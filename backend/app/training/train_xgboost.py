"""
Train XGBoost for next-day close, upgraded:

  • Optuna hyperparameter search (time-series CV)
  • Feature-set selection: [all, top-20, top-15] chosen by CV score
  • Quantile regression P10 / P50 / P90 for uncertainty bands
  • Saves best params, feature importances, and SHAP values for the last row

The saved bundle is a SUPERSET of the original one (keeps `model`, `scaler`,
`feature_cols`, `meta`) so the existing `load_xgb` / prediction_service path is
unchanged; the new artefacts live under extra keys.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import TimeSeriesSplit

from app.config import settings
from app.ml.xgboost_model import (
    build_xgb, build_xgb_quantile, save_xgb,
    build_interaction_constraints, direction_weighted_objective,
)
from app.training.dataset_builder import (
    FEATURE_COLS, EXTENDED_FEATURE_COLS, build_dataset, build_xy_supervised,
)
from app.training.evaluate import evaluate_regression

logger = logging.getLogger(__name__)

DEFAULT_OPTUNA_TRIALS = 50

# COMPAT: the frozen prediction_service feeds the BASE 20 features (df[FEATURE_COLS]),
# so trained models MUST use the base set to stay servable. `extended=True` unlocks
# the full 51-feature set — use it only once prediction_service is updated to feed
# EXTENDED_FEATURE_COLS. Default False keeps auto-train / live prediction working.


def _cv_rmse(params: dict, X: np.ndarray, y: np.ndarray, n_splits: int = 3) -> float:
    """Mean RMSE across time-series CV folds for a given param set."""
    tss = TimeSeriesSplit(n_splits=n_splits)
    rmses = []
    for tr, te in tss.split(X):
        model = build_xgb(**params)
        model.fit(X[tr], y[tr], verbose=False)
        pred = model.predict(X[te])
        rmses.append(float(np.sqrt(np.mean((pred - y[te]) ** 2))))
    return float(np.mean(rmses)) if rmses else float("inf")


def _select_feature_set(df, feat_cols: list[str], top_by_importance: dict | None):
    """Return candidate feature-column subsets: all, top-20, top-15."""
    cands = {"all": feat_cols}
    if top_by_importance:
        ranked = sorted(top_by_importance, key=top_by_importance.get, reverse=True)
        cands["top20"] = ranked[:20]
        cands["top15"] = ranked[:15]
    return cands


def train_xgb_for_symbol(symbol: str, period: str = "3y",
                         n_estimators: int = 300, max_depth: int = 5,
                         optuna_trials: int = DEFAULT_OPTUNA_TRIALS,
                         use_optuna: bool = True, extended: bool = False) -> dict:
    df = build_dataset(symbol, period, extended=extended)
    cols = EXTENDED_FEATURE_COLS if extended else FEATURE_COLS
    feat_cols = [c for c in cols if c in df.columns]

    X_all, y, _ = build_xy_supervised(df, horizon=1, feature_cols=feat_cols)
    if len(X_all) < 120:
        raise ValueError(f"{symbol}: need ≥120 rows after engineering, got {len(X_all)}")

    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(X_all)
    split = int(len(X_scaled) * 0.8)
    X_tr, X_te, y_tr, y_te = X_scaled[:split], X_scaled[split:], y[:split], y[split:]

    # ── 1. Quick baseline for feature importances (drives feature-set search) ─
    base = build_xgb(n_estimators=150, max_depth=max_depth)
    base.fit(X_tr, y_tr, verbose=False)
    importances = dict(zip(feat_cols, [float(v) for v in base.feature_importances_]))

    # ── 2. Optuna hyperparameter search (time-series CV) ──────────────────────
    best_params = {"n_estimators": n_estimators, "max_depth": max_depth, "learning_rate": 0.05}
    if use_optuna and optuna_trials > 0:
        try:
            import optuna
            optuna.logging.set_verbosity(optuna.logging.WARNING)

            def objective(trial):
                params = {
                    "n_estimators": trial.suggest_int("n_estimators", 150, 600, step=50),
                    "max_depth": trial.suggest_int("max_depth", 3, 8),
                    "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
                }
                return _cv_rmse(params, X_tr, y_tr)

            study = optuna.create_study(direction="minimize")
            study.optimize(objective, n_trials=optuna_trials, show_progress_bar=False)
            best_params = study.best_params
            logger.info("[%s] Optuna best %s (rmse=%.4f)", symbol, best_params, study.best_value)
        except Exception as e:
            logger.warning("[%s] Optuna skipped: %s", symbol, e)

    # ── 3. Feature-set selection: all vs top-20 vs top-15 (CV) ────────────────
    cands = _select_feature_set(df, feat_cols, importances)
    fs_scores: dict[str, float] = {}
    for name, cols in cands.items():
        idx = [feat_cols.index(c) for c in cols]
        fs_scores[name] = _cv_rmse(best_params, X_tr[:, idx], y_tr)
    best_fs = min(fs_scores, key=fs_scores.get)
    chosen_cols = cands[best_fs]
    chosen_idx = [feat_cols.index(c) for c in chosen_cols]
    logger.info("[%s] feature set '%s' won %s", symbol, best_fs, {k: round(v, 3) for k, v in fs_scores.items()})

    # Refit scaler on the chosen columns so the saved model matches feature_cols.
    scaler_final = MinMaxScaler().fit(X_all[:, chosen_idx])
    Xc = scaler_final.transform(X_all[:, chosen_idx])
    Xc_tr, Xc_te = Xc[:split], Xc[split:]

    # ── 4. Final point model (direction-weighted objective) ───────────────────
    # Interaction constraints must index into the CHOSEN columns (0..len-1).
    ic = build_interaction_constraints(chosen_cols)
    # Reference for "direction" = current close (raw units), aligned to y_train.
    prev_close_tr = X_all[:split, feat_cols.index("close")] if "close" in feat_cols else None
    model = build_xgb(**best_params, interaction_constraints=ic,
                      objective=direction_weighted_objective(2.5, prev_close_tr))
    model.fit(np.ascontiguousarray(Xc_tr), y_tr, verbose=False)
    pred = model.predict(Xc_te)
    metrics = evaluate_regression(y_te, pred)

    # The custom (closure) objective isn't picklable and is only needed during
    # training — swap to a plain string objective for serialization. The fitted
    # trees are unchanged, so predictions are identical.
    model.set_params(objective="reg:squarederror")

    # ── 5. Quantile models P10 / P50 / P90 (uncertainty) ──────────────────────
    quantiles = {}
    for tag, alpha in (("p10", 0.1), ("p50", 0.5), ("p90", 0.9)):
        try:
            qm = build_xgb_quantile(alpha, **{k: best_params.get(k) for k in ("n_estimators", "max_depth", "learning_rate") if k in best_params})
            qm.fit(Xc_tr, y_tr, verbose=False)
            quantiles[tag] = qm
        except Exception as e:
            logger.warning("[%s] quantile %s failed: %s", symbol, tag, e)

    # ── 6. SHAP for the last prediction ───────────────────────────────────────
    shap_last = {}
    try:
        import shap
        expl = shap.TreeExplainer(model)
        sv = expl.shap_values(Xc[-1:])
        row = sv[0] if getattr(sv, "ndim", 1) == 2 else sv
        shap_last = {c: round(float(v), 5) for c, v in zip(chosen_cols, np.ravel(row))}
    except Exception as e:
        logger.debug("[%s] SHAP skipped: %s", symbol, e)

    meta = {
        "symbol": symbol, "period": period,
        "best_params": best_params,
        "feature_set": best_fs, "feature_set_scores": fs_scores,
        "rows_total": int(len(df)), "rows_train": int(len(Xc_tr)), "rows_test": int(len(Xc_te)),
        "feature_importance": dict(zip(chosen_cols, [float(v) for v in model.feature_importances_])),
        "shap_last_prediction": shap_last,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
    }
    paths = save_xgb(model, scaler_final, chosen_cols, meta, settings.MODEL_PATH, symbol)

    # Persist quantile models alongside (extra artefact, doesn't affect load_xgb).
    try:
        import os, joblib
        qpath = os.path.join(settings.MODEL_PATH, f"xgb_{symbol}_quantiles.pkl")
        joblib.dump({"models": quantiles, "feature_cols": chosen_cols,
                     "scaler": scaler_final}, qpath)
        paths["quantile_path"] = qpath
    except Exception as e:
        logger.warning("[%s] quantile save failed: %s", symbol, e)

    return {"symbol": symbol, "metrics": metrics, "paths": paths, "meta": meta}


if __name__ == "__main__":
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    # Fewer trials for a manual smoke run.
    res = train_xgb_for_symbol(sym, period="3y", optuna_trials=10)
    print(res["metrics"])
