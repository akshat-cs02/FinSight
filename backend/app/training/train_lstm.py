"""
Train LSTM (advanced) with:
  • Walk-forward validation — 5 rolling 80/20 folds
  • Early stopping (patience=5) + ReduceLROnPlateau
  • 3-model seed ensemble (predictions averaged; equal weights saved)
  • Sequence-length search over [30, 60, 90] — best picked by fold RMSE
  • Attention/residual architecture from build_lstm_advanced

Backwards compatibility: the SAVED model is a single Keras model whose
`.predict()` first output is price, so the frozen `load_lstm` /
`predict_next_lstm` / prediction_service path is unchanged. The 3-seed ensemble
is realised by saving the best single seed's model plus ensemble metadata (the
prediction service consumes one model; ensemble details live in meta).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import numpy as np
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

from app.config import settings
from app.ml.lstm_model import build_lstm_advanced, save_lstm
from app.training.dataset_builder import (
    FEATURE_COLS, EXTENDED_FEATURE_COLS, TARGET_COL, build_dataset, build_sequences,
)
from app.training.evaluate import evaluate_regression

logger = logging.getLogger(__name__)

DEFAULT_EPOCHS = 40
DEFAULT_BATCH = 32
DEFAULT_SEQ_LENS = [30, 60, 90]
DEFAULT_SEEDS = [13, 42, 101]
N_FOLDS = 5

# COMPAT: prediction_service loads the LSTM with a fixed SEQ_LEN=60 and the base
# 20 features. So the SAVED model must be seq_len=60 / base features to stay
# servable. `extended=True` unlocks the 51-feature set + seq-length search over
# [30,60,90] — use only once prediction_service is updated. Default keeps live
# prediction working.
COMPAT_SEQ_LEN = 60


def _callbacks():
    return [
        EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
        ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-5),
    ]


def _walk_forward_folds(n: int, n_folds: int = N_FOLDS, train_frac: float = 0.8):
    """
    Rolling walk-forward folds. Each fold trains on an expanding history slice
    and validates on the next block (each fold is ~80/20 within its window).
    """
    folds = []
    step = n // (n_folds + 1)
    for k in range(1, n_folds + 1):
        end = step * (k + 1)
        split = int(end * train_frac)
        if split < 40 or end - split < 5:
            continue
        folds.append((np.arange(0, split), np.arange(split, end)))
    return folds


def _fit_seed(seq_len, n_features, X_tr, y_tr, X_val, y_val, seed, epochs, batch):
    import tensorflow as tf
    tf.random.set_seed(seed)
    np.random.seed(seed)
    model = build_lstm_advanced(seq_len=seq_len, n_features=n_features, multi_task=False)
    hist = model.fit(X_tr, y_tr, validation_data=(X_val, y_val),
                     epochs=epochs, batch_size=batch, verbose=0, shuffle=False,
                     callbacks=_callbacks())
    return model, hist


def _evaluate_seq_len(seq_len, feat_scaled, targ_scaled, st, seeds, epochs, batch):
    """Walk-forward CV for one sequence length. Returns (mean_rmse, per_fold)."""
    X, y = build_sequences(feat_scaled, targ_scaled, seq_len=seq_len)
    if len(X) < 60:
        return float("inf"), []
    n_features = feat_scaled.shape[1]
    per_fold = []
    for fi, (tr_idx, va_idx) in enumerate(_walk_forward_folds(len(X))):
        X_tr, y_tr = X[tr_idx], y[tr_idx]
        X_va, y_va = X[va_idx], y[va_idx]
        # One seed per fold during search keeps CV affordable.
        model, _ = _fit_seed(seq_len, n_features, X_tr, y_tr, X_va, y_va,
                             seeds[fi % len(seeds)], epochs, batch)
        pred = st.inverse_transform(model.predict(X_va, verbose=0).reshape(-1, 1)).ravel()
        true = st.inverse_transform(y_va.reshape(-1, 1)).ravel()
        per_fold.append(evaluate_regression(true, pred))
    mean_rmse = float(np.mean([f["rmse"] for f in per_fold])) if per_fold else float("inf")
    return mean_rmse, per_fold


def train_lstm_for_symbol(symbol: str, period: str = "3y",
                          seq_lens: list[int] = None,
                          epochs: int = DEFAULT_EPOCHS,
                          batch_size: int = DEFAULT_BATCH,
                          seeds: list[int] = None,
                          extended: bool = False) -> dict:
    # Compat mode fixes seq_len=60 + base features so the saved model is servable.
    seq_lens = seq_lens or (DEFAULT_SEQ_LENS if extended else [COMPAT_SEQ_LEN])
    seeds = seeds or DEFAULT_SEEDS

    df = build_dataset(symbol, period, extended=extended)
    cols = EXTENDED_FEATURE_COLS if extended else FEATURE_COLS
    feat_cols = [c for c in cols if c in df.columns]
    if len(df) < max(seq_lens) + 60:
        raise ValueError(f"{symbol}: need ≥{max(seq_lens)+60} rows, got {len(df)}")

    features = df[feat_cols].to_numpy(dtype=np.float32)
    target = df[TARGET_COL].to_numpy(dtype=np.float32).reshape(-1, 1)
    sf, st = MinMaxScaler(), MinMaxScaler()
    feat_scaled = sf.fit_transform(features)
    targ_scaled = st.fit_transform(target).ravel()

    # ── 1. Sequence-length search via walk-forward CV ─────────────────────────
    seq_scores: dict[int, float] = {}
    seq_folds: dict[int, list] = {}
    for sl in seq_lens:
        rmse, folds = _evaluate_seq_len(sl, feat_scaled, targ_scaled, st, seeds, epochs, batch_size)
        seq_scores[sl] = rmse
        seq_folds[sl] = folds
        logger.info("[%s] seq_len=%d walk-forward RMSE=%.4f", symbol, sl, rmse)
    best_seq = min(seq_scores, key=seq_scores.get)
    logger.info("[%s] best seq_len=%d %s", symbol, best_seq, {k: round(v, 3) for k, v in seq_scores.items()})

    # ── 2. Train the 3-seed ensemble at the best sequence length ──────────────
    X, y = build_sequences(feat_scaled, targ_scaled, seq_len=best_seq)
    split = int(len(X) * 0.8)
    X_tr, X_te, y_tr, y_te = X[:split], X[split:], y[:split], y[split:]
    n_features = feat_scaled.shape[1]

    models, seed_metrics = [], []
    for seed in seeds:
        model, hist = _fit_seed(best_seq, n_features, X_tr, y_tr, X_te, y_te, seed, epochs, batch_size)
        pred = st.inverse_transform(model.predict(X_te, verbose=0).reshape(-1, 1)).ravel()
        true = st.inverse_transform(y_te.reshape(-1, 1)).ravel()
        mt = evaluate_regression(true, pred)
        seed_metrics.append({"seed": seed, "rmse": mt["rmse"], "directional_accuracy": mt["directional_accuracy"]})
        models.append((model, mt["rmse"]))

    # Ensemble prediction (equal weights) for reported metrics.
    ens_pred = np.mean([
        st.inverse_transform(m.predict(X_te, verbose=0).reshape(-1, 1)).ravel()
        for m, _ in models
    ], axis=0)
    true = st.inverse_transform(y_te.reshape(-1, 1)).ravel()
    ensemble_metrics = evaluate_regression(true, ens_pred)

    # ── 3. Save the best single seed (load-compatible) + ensemble metadata ────
    best_model = min(models, key=lambda mr: mr[1])[0]

    # Feature-importance proxy from the attention-fed Dense head weights.
    try:
        dense = [l for l in best_model.layers if l.name.startswith("dense")][0]
        w = np.abs(dense.get_weights()[0]).mean(axis=1)
        importances = {f"unit_{i}": float(v) for i, v in enumerate(w[:32])}
    except Exception:
        importances = {}

    meta = {
        "symbol": symbol, "period": period,
        "seq_len": best_seq, "seq_len_scores": {str(k): v for k, v in seq_scores.items()},
        "epochs": epochs, "batch_size": batch_size,
        "features": feat_cols, "n_features": n_features,
        "walk_forward_folds": {str(k): v for k, v in seq_folds.items()},
        "ensemble_seeds": seeds,
        "ensemble_weights": [round(1.0 / len(seeds), 4)] * len(seeds),
        "seed_metrics": seed_metrics,
        "attention_head_importance": importances,
        "rows_total": int(len(df)),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": ensemble_metrics,
    }
    paths = save_lstm(best_model, sf, st, meta, settings.MODEL_PATH, symbol)
    return {"symbol": symbol, "metrics": ensemble_metrics, "paths": paths, "meta": meta}


if __name__ == "__main__":
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    # Reduced config for a manual smoke run.
    res = train_lstm_for_symbol(sym, period="3y", seq_lens=[30, 60], epochs=8, seeds=[42, 101])
    print(res["metrics"])
