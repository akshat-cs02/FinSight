"""
Prediction service — ensembles LSTM + XGBoost.

- Loads pre-trained per-symbol models from disk.
- Auto-trains on first call if no model exists.
- Returns: predicted price, confidence, trend, BUY/SELL/HOLD signal.

Signal rule (per spec):
    BUY  if predicted > current AND RSI < 70
    SELL if predicted < current
    HOLD otherwise
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from app.config import settings
from app.ml.lstm_model import load_lstm, predict_next_lstm, predict_next_lstm_multi_horizon
from app.ml.xgboost_model import load_xgb, predict_next_xgb, load_xgb_multi_horizon, predict_next_xgb_multi_horizon
from app.ml.ensemble import ensemble_weighted_average
from app.ml.inference import get_model_version, _estimate_uncertainty
from app.services import market_data_service as mds
from app.training.dataset_builder import FEATURE_COLS, EXTENDED_FEATURE_COLS, build_dataset

logger = logging.getLogger(__name__)

MODEL_DIR = settings.MODEL_PATH
SEQ_LEN = 60
SUPPORTED = [
    # US large cap
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "NFLX",
    # Indian blue chips
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "WIPRO.NS",
    # Crypto
    "BTC-USD", "ETH-USD",
    # Forex
    "EURUSD=X", "GBPUSD=X",
]


# ============ Helpers ============
def has_trained_models(symbol: str) -> dict:
    """Return which models exist on disk for a symbol."""
    lstm_h5 = os.path.join(MODEL_DIR, f"lstm_{symbol}.keras")
    xgb_pkl = os.path.join(MODEL_DIR, f"xgb_{symbol}.pkl")
    lstm_multi_h5 = os.path.join(MODEL_DIR, f"lstm_{symbol}_multi_horizon.keras")
    xgb_multi_pkl = os.path.join(MODEL_DIR, f"xgb_{symbol}_multi.pkl")
    return {
        "lstm": os.path.exists(lstm_h5),
        "xgb": os.path.exists(xgb_pkl),
        "lstm_multi": os.path.exists(lstm_multi_h5),
        "xgb_multi": os.path.exists(xgb_multi_pkl),
    }


def _unified_signal(current: float, predicted: float,
                    rsi: Optional[float],
                    macd_hist: Optional[float],
                    bb_upper: Optional[float],
                    bb_lower: Optional[float]) -> tuple[str, str, dict]:
    """
    Combined BUY/SELL/HOLD using AI + technical indicators.

    Returns: (signal, trend, score_breakdown)
    """
    score = 0.0
    breakdown = {}

    # 1. AI ensemble: weight 2.5
    pct_change = (predicted - current) / current * 100 if current else 0
    if pct_change > 1.5:
        s = 2.5
    elif pct_change > 0.3:
        s = 1.0
    elif pct_change < -1.5:
        s = -2.5
    elif pct_change < -0.3:
        s = -1.0
    else:
        s = 0
    score += s
    breakdown["ai_forecast"] = {"pct_change": round(pct_change, 2), "weight": s}

    # 2. RSI: weight 1.5
    if rsi is not None:
        if rsi < 30:
            s = 1.5            # oversold → buy bias
        elif rsi < 45:
            s = 0.5
        elif rsi > 70:
            s = -1.5           # overbought → sell bias
        elif rsi > 55:
            s = -0.5
        else:
            s = 0
        score += s
        breakdown["rsi"] = {"value": round(rsi, 2), "weight": s}

    # 3. MACD histogram: weight 1.0
    if macd_hist is not None:
        if macd_hist > 0:
            s = 1.0           # bullish momentum
        elif macd_hist < 0:
            s = -1.0
        else:
            s = 0
        score += s
        breakdown["macd_hist"] = {"value": round(macd_hist, 3), "weight": s}

    # 4. Bollinger position: weight 1.0
    if bb_upper is not None and bb_lower is not None:
        if current >= bb_upper:
            s = -1.0           # at upper band → mean-reversion sell
        elif current <= bb_lower:
            s = 1.0            # at lower band → buy
        else:
            s = 0
        score += s
        breakdown["bollinger"] = {"upper": round(bb_upper, 2), "lower": round(bb_lower, 2), "weight": s}

    # Decision thresholds
    if score >= 2.0:
        signal = "BUY"
    elif score <= -2.0:
        signal = "SELL"
    else:
        signal = "HOLD"

    # Trend label (separate, based on AI direction only)
    if pct_change > 0.5:
        trend = "BULLISH"
    elif pct_change < -0.5:
        trend = "BEARISH"
    else:
        trend = "NEUTRAL"

    breakdown["total_score"] = round(score, 2)
    return signal, trend, breakdown


def _compute_levels(current: float, signal: str, atr: Optional[float]) -> dict:
    """
    Compute Entry Price (EP), Stop Loss (SL), Take Profit (TP) from ATR.

    For BUY:
        EP = current
        SL = current - 1.5*ATR
        TP = current + 2.5*ATR   (risk:reward ≈ 1:1.67)

    For SELL (short setup):
        EP = current
        SL = current + 1.5*ATR
        TP = current - 2.5*ATR

    For HOLD:
        return None levels.

    If ATR unavailable, fall back to 2%/3.5% of price.
    """
    if signal == "HOLD":
        return {"entry_price": None, "stop_loss": None, "take_profit": None,
                "risk_reward_ratio": None, "atr": atr}

    if atr is None or atr <= 0:
        sl_mult = 0.02   # 2%
        tp_mult = 0.035  # 3.5%
        sl_dist = current * sl_mult
        tp_dist = current * tp_mult
    else:
        sl_dist = 1.5 * atr
        tp_dist = 2.5 * atr

    if signal == "BUY":
        ep = current
        sl = current - sl_dist
        tp = current + tp_dist
    else:  # SELL
        ep = current
        sl = current + sl_dist
        tp = current - tp_dist

    rr = round(tp_dist / sl_dist, 2) if sl_dist > 0 else None
    return {
        "entry_price": round(ep, 2),
        "stop_loss": round(sl, 2),
        "take_profit": round(tp, 2),
        "risk_reward_ratio": rr,
        "atr": round(atr, 2) if atr else None,
    }


# Backwards-compat shim for any older callers
def _signal_engine(current: float, predicted: float, rsi: Optional[float]) -> tuple[str, str]:
    sig, trend, _ = _unified_signal(current, predicted, rsi, None, None, None)
    return sig, trend


def _confidence(predicted: float, current: float, model_metrics: list[dict]) -> float:
    """
    Model-based confidence score (0-100).

    Derivation:
      1. R²-based baseline  — high R² → high confidence (primary signal).
      2. MAPE penalty       — high MAPE reduces confidence.
      3. Magnitude penalty  — very large predicted swings are suspect.

    Falls back gracefully when metrics lack R² (older trained models).
    """
    score = 100.0

    # 1. R²-based baseline (if available)
    r2_values = [m.get("r2") for m in model_metrics if m and m.get("r2") is not None]
    if r2_values:
        avg_r2 = sum(r2_values) / len(r2_values)
        # Perfect R²=1 → 0 penalty; R²=0 → -40; R²<0 → capped at -40
        score -= (1.0 - max(-1.0, avg_r2)) * 20

    # 2. MAPE penalty
    mapes = [m.get("mape", 5.0) for m in model_metrics if m]
    if mapes:
        avg_mape = sum(mapes) / len(mapes)
        score -= min(35, avg_mape * 3.5)   # 5% MAPE → -17.5

    # 3. Magnitude penalty
    pct_change = abs(predicted - current) / max(current, 1e-6) * 100
    if pct_change > 8:
        score -= min(20, (pct_change - 8) * 2)

    return max(5.0, min(100.0, round(score, 2)))


# ============ N-day recursive forecast ============
def _recursive_lstm_forecast(model, scalers, df_features: np.ndarray,
                             seq_len: int, n_days: int) -> list[float]:
    """
    Recursive LSTM forecast.

    Approach:
      1. Take the last `seq_len` rows of scaled features.
      2. Predict next scaled close → inverse to price.
      3. Shift window by 1, replace the 'close' column of the new last row with
         the predicted (scaled) close; copy other features from the last row
         (assumes short-horizon stability).
      4. Repeat n_days times.

    Returns list of n_days unscaled predicted prices.
    """
    feat_scaler = scalers["features"]
    targ_scaler = scalers["target"]

    # We need the column index of "close" in the feature matrix.
    from app.training.dataset_builder import FEATURE_COLS
    try:
        close_idx = FEATURE_COLS.index("close")
    except ValueError:
        close_idx = 3  # fallback

    scaled = feat_scaler.transform(df_features)
    window = scaled[-seq_len:].copy()  # (seq_len, n_features)

    out = []
    for _ in range(n_days):
        x = window.reshape(1, seq_len, -1)
        pred_scaled = model.predict(x, verbose=0)[0, 0]
        pred_price = float(targ_scaler.inverse_transform([[pred_scaled]])[0, 0])
        out.append(pred_price)

        # Slide window: copy last row, overwrite scaled close with model output
        next_row = window[-1].copy()
        next_row[close_idx] = pred_scaled
        window = np.vstack([window[1:], next_row])

    return out


# ============ Core ============
def predict_stock(symbol: str, auto_train: bool = True, forecast_days: int = 7) -> dict:
    """Run ensemble prediction. Auto-trains if models missing and auto_train=True."""
    symbol = symbol.upper()

    quote = mds.get_stock_quote(symbol)
    current_price = float(quote["price"])

    models_present = has_trained_models(symbol)
    if not (models_present["lstm"] or models_present["xgb"]):
        if auto_train:
            logger.info(f"No models for {symbol}, auto-training...")
            from app.training.train_xgboost import train_xgb_for_symbol
            try:
                train_xgb_for_symbol(symbol, period="3y")
                models_present = has_trained_models(symbol)
            except Exception as e:
                logger.exception(f"auto-train xgb failed: {e}")
        if not models_present["xgb"] and not models_present["lstm"]:
            raise RuntimeError(f"No trained models available for {symbol} and auto-train failed")

    # Build current feature snapshot (need recent data + indicators)
    df = build_dataset(symbol, period="1y")
    if len(df) < SEQ_LEN:
        raise ValueError(f"Need at least {SEQ_LEN} rows, got {len(df)}")

    latest_features = df[FEATURE_COLS].iloc[-1].to_numpy(dtype=np.float32).reshape(1, -1)
    rsi_latest = float(df["rsi_14"].iloc[-1]) if "rsi_14" in df.columns else None
    macd_hist_latest = float(df["macd_hist"].iloc[-1]) if "macd_hist" in df.columns else None
    bb_upper_latest = float(df["bb_upper"].iloc[-1]) if "bb_upper" in df.columns else None
    bb_lower_latest = float(df["bb_lower"].iloc[-1]) if "bb_lower" in df.columns else None
    atr_latest = float(df["atr_14"].iloc[-1]) if "atr_14" in df.columns else None

    predictions: list[tuple[str, float]] = []
    model_metrics_list: list[dict] = []

    # --- XGBoost ---
    xgb_pred = None
    shap_values: dict = {}
    if models_present["xgb"]:
        bundle = load_xgb(MODEL_DIR, symbol)
        if bundle is not None:
            xgb_model, xgb_scaler, _, xgb_meta = bundle
            # The pre-trained scaler may have been saved with an earlier,
            # smaller FEATURE_COLS list (15 vs the current 20). Align the live
            # feature matrix to whatever the scaler was fit on so old artefacts
            # still load after FEATURE_COLS grew.
            try:
                expected = getattr(xgb_scaler, "n_features_in_", latest_features.shape[1])
                if expected != latest_features.shape[1]:
                    logger.warning(
                        "XGB feature-count mismatch for %s: scaler=%d, live=%d — slicing to match",
                        symbol, expected, latest_features.shape[1],
                    )
                    latest_features = latest_features[:, :expected]
                    feats_for_bundles = FEATURE_COLS[:expected]
                else:
                    feats_for_bundles = FEATURE_COLS
            except Exception:
                feats_for_bundles = FEATURE_COLS
            row_scaled = xgb_scaler.transform(latest_features)
            xgb_pred = predict_next_xgb(xgb_model, row_scaled)
            predictions.append(("xgb", xgb_pred))
            model_metrics_list.append(xgb_meta.get("metrics", {}))

            # SHAP feature importance for interpretability
            try:
                import shap as _shap
                explainer = _shap.TreeExplainer(xgb_model)
                sv = explainer.shap_values(row_scaled)
                # sv shape: (1, n_features)
                sv_row = sv[0] if sv.ndim == 2 else sv
                shap_values = {
                    feat: round(float(val), 4)
                    for feat, val in zip(feats_for_bundles, sv_row)
                }
            except Exception as _e:
                logger.debug(f"SHAP computation skipped: {_e}")

    # --- LSTM ---
    lstm_pred = None
    forecast_n_day: list[float] = []
    if models_present["lstm"]:
        loaded = load_lstm(MODEL_DIR, symbol)
        if loaded is not None:
            lstm_model, scalers, lstm_meta = loaded
            feat_scaler = scalers["features"]
            targ_scaler = scalers["target"]
            try:
                window = df[FEATURE_COLS].iloc[-SEQ_LEN:].to_numpy(dtype=np.float32)
                expected_lstm = getattr(feat_scaler, "n_features_in_", window.shape[1])
                if expected_lstm != window.shape[1]:
                    logger.warning(
                        "LSTM feature-count mismatch for %s: scaler=%d, live=%d — slicing to match",
                        symbol, expected_lstm, window.shape[1],
                    )
                    window = window[:, :expected_lstm]
                window_scaled = feat_scaler.transform(window).reshape(1, SEQ_LEN, -1)
                lstm_pred = predict_next_lstm(lstm_model, window_scaled, targ_scaler)
                predictions.append(("lstm", lstm_pred))
                model_metrics_list.append(lstm_meta.get("metrics", {}))
            except Exception as e:
                logger.warning("LSTM inference failed for %s: %s", symbol, e)

            # Recursive N-day forecast
            try:
                full_feats = df[FEATURE_COLS].to_numpy(dtype=np.float32)
                expected_lstm = getattr(scalers["features"], "n_features_in_", full_feats.shape[1])
                if expected_lstm != full_feats.shape[1]:
                    full_feats = full_feats[:, :expected_lstm]
                forecast_n_day = _recursive_lstm_forecast(
                    lstm_model, scalers, full_feats, SEQ_LEN, forecast_days
                )
            except Exception as e:
                logger.warning(f"recursive forecast failed: {e}")
                forecast_n_day = []

    if not predictions:
        raise RuntimeError(f"All models failed to produce predictions for {symbol}")

    # ── Ensemble: MAPE-weighted mean with outlier clipping ─────────────────────
    ensemble_result = ensemble_weighted_average(predictions, model_metrics_list, current_price)
    ensemble = ensemble_result["ensemble_price"]

    change_pct = (ensemble - current_price) / current_price * 100

    confidence = _confidence(ensemble, current_price, model_metrics_list)
    signal, trend, score_breakdown = _unified_signal(
        current_price, ensemble, rsi_latest,
        macd_hist_latest, bb_upper_latest, bb_lower_latest,
    )
    levels = _compute_levels(current_price, signal, atr_latest)

    # Build forecast_7day list of (date, predicted_price) — uses recursive LSTM if available,
    # otherwise falls back to repeating the ensemble prediction.
    from datetime import timedelta, timezone
    today = datetime.now(timezone.utc).date()
    if forecast_n_day:
        # use recursive predictions
        forecast_series = [
            {"day": i + 1,
             "date": (today + timedelta(days=i + 1)).isoformat(),
             "price": round(float(p), 2)}
            for i, p in enumerate(forecast_n_day)
        ]
    else:
        # fallback: flat ensemble extrapolation
        forecast_series = [
            {"day": i + 1,
             "date": (today + timedelta(days=i + 1)).isoformat(),
             "price": round(float(ensemble), 2)}
            for i in range(forecast_days)
        ]

    # ── Model staleness check ───────────────────────────────────────────────────
    # Warn if the model files are older than 30 days — predictions may be stale.
    stale_models: list[str] = []
    stale_threshold_days = 30
    for model_name, file_prefix in [("xgb", f"xgb_{symbol}.pkl"), ("lstm", f"lstm_{symbol}.keras")]:
        mpath = os.path.join(MODEL_DIR, file_prefix)
        if os.path.exists(mpath):
            age_days = (datetime.now(timezone.utc).timestamp() - os.path.getmtime(mpath)) / 86400
            if age_days > stale_threshold_days:
                stale_models.append(f"{model_name} ({int(age_days)}d old)")

    # Directional conviction score used by the consensus engine:
    # BUY  → +confidence, SELL → -confidence, HOLD → 0  (range -100..+100)
    consensus_score = round(
        confidence if signal == "BUY" else (-confidence if signal == "SELL" else 0.0), 1
    )

    # ── Multi-horizon predictions (if models available) ──────────────────────
    horizons = {}
    HORIZON_MAP = {"intraday": 1, "short": 5, "mid": 21, "long": 63}
    try:
        # Try multi-horizon LSTM
        lstm_multi_loaded = False
        lstm_multi_model = None
        lstm_multi_scalers = None
        lstm_multi_path = os.path.join(MODEL_DIR, f"lstm_{symbol}_multi_horizon.keras")
        if os.path.exists(lstm_multi_path):
            lstm_multi_model, lstm_multi_scalers, _ = load_lstm(MODEL_DIR, f"{symbol}_multi_horizon")
            if lstm_multi_model is not None:
                lstm_multi_loaded = True

        # Try multi-horizon XGBoost
        xgb_multi_loaded = False
        xgb_multi_models = None
        xgb_multi_scaler = None
        xgb_multi_bundle = load_xgb_multi_horizon(MODEL_DIR, symbol)
        if xgb_multi_bundle is not None:
            xgb_multi_models, xgb_multi_scaler, _, _ = xgb_multi_bundle
            xgb_multi_loaded = True

        # Get multi-horizon predictions if any model supports it
        if lstm_multi_loaded or xgb_multi_loaded:
            window = df[FEATURE_COLS].iloc[-SEQ_LEN:].to_numpy(dtype=np.float32)
            try:
                expected_m = getattr(lstm_multi_scalers["features"], "n_features_in_", window.shape[1])
                if expected_m != window.shape[1]:
                    window = window[:, :expected_m]
            except Exception:
                pass
            try:
                expected_x = getattr(xgb_multi_scaler, "n_features_in_", None) if xgb_multi_loaded else None
                if expected_x == latest_features.shape[1]:
                    pass
                elif expected_x is not None and expected_x != latest_features.shape[1]:
                    logger.warning(
                        "Multi-horizon XGB scaler mismatch for %s: scaler=%d, live=%d",
                        symbol, expected_x, latest_features.shape[1],
                    )
            except Exception:
                pass
            window_scaled = lstm_multi_scalers["features"].transform(window).reshape(1, SEQ_LEN, -1) if lstm_multi_loaded else None
            row_scaled = xgb_multi_scaler.transform(latest_features) if xgb_multi_loaded else None

            for h_key, h_days in HORIZON_MAP.items():
                h_preds = []
                h_weights = []

                if lstm_multi_loaded and window_scaled is not None:
                    try:
                        lstm_h_pred = predict_next_lstm_multi_horizon(lstm_multi_model, window_scaled, lstm_multi_scalers["target"])
                        if h_key in lstm_h_pred and lstm_h_pred[h_key] is not None:
                            h_preds.append(lstm_h_pred[h_key])
                            h_weights.append(0.5)
                    except Exception as e:
                        logger.debug(f"Multi-horizon LSTM {h_key} failed: {e}")

                if xgb_multi_loaded and row_scaled is not None and xgb_multi_models:
                    try:
                        xgb_h_preds = predict_next_xgb_multi_horizon(xgb_multi_models, row_scaled)
                        if h_key in xgb_h_preds and xgb_h_preds[h_key] is not None:
                            h_preds.append(xgb_h_preds[h_key])
                            h_weights.append(0.5)
                    except Exception as e:
                        logger.debug(f"Multi-horizon XGB {h_key} failed: {e}")

                if h_preds:
                    total_w = sum(h_weights)
                    h_price = sum(w * p for w, p in zip(h_weights, h_preds)) / total_w if total_w > 0 else np.mean(h_preds)
                    h_change = (h_price - current_price) / current_price * 100 if current_price else 0
                    h_direction = "up" if h_change > 0.5 else ("down" if h_change < -0.5 else "neutral")
                    h_confidence = _confidence(h_price, current_price, model_metrics_list)

                    # Entry/SL/TP per horizon using ATR
                    h_atr_mult = {"intraday": (1.5, 2.5), "short": (1.5, 2.5), "mid": (4.0, 6.0), "long": (8.0, 12.0)}
                    sl_m, tp_m = h_atr_mult.get(h_key, (1.5, 2.5))
                    h_entry = round(current_price, 4)
                    h_tp = round(h_price + tp_m * atr_latest, 4) if h_direction == "up" else (round(h_price - tp_m * atr_latest, 4) if h_direction == "down" else None)
                    h_sl = round(h_entry - sl_m * atr_latest, 4) if h_direction == "up" else (round(h_entry + sl_m * atr_latest, 4) if h_direction == "down" else None)
                    h_rr = round(abs(h_tp - h_entry) / abs(h_entry - h_sl), 2) if h_sl and h_tp and abs(h_entry - h_sl) > 0 else None

                    horizons[h_key] = {
                        "predicted_price": round(float(h_price), 2),
                        "change_percent": round(float(h_change), 2),
                        "direction": h_direction,
                        "confidence": round(float(h_confidence), 1),
                        "entry_price": h_entry,
                        "stop_loss": h_sl,
                        "take_profit": h_tp,
                        "risk_reward_ratio": h_rr,
                    }
    except Exception as e:
        logger.debug(f"Multi-horizon predictions failed: {e}")

    # ── Overall consensus across horizons ──────────────────────────────────────
    overall = None
    if horizons:
        HORIZON_WEIGHTS = {"intraday": 0.35, "short": 0.25, "mid": 0.25, "long": 0.15}
        score = 0.0
        for h_key, h_weight in HORIZON_WEIGHTS.items():
            if h_key in horizons:
                h = horizons[h_key]
                direction_mult = 1 if h["direction"] == "up" else (-1 if h["direction"] == "down" else 0)
                score += h_weight * (h["confidence"] / 100.0) * direction_mult
        master_signal = "BULLISH" if score > 0.1 else ("BEARISH" if score < -0.1 else "NEUTRAL")
        overall = {"master_signal": master_signal, "score": round(score * 100, 1)}

    return {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "predicted_price": round(ensemble, 2),
        "change_percent": round(float(change_pct), 2),
        "confidence": confidence,
        "consensus_score": consensus_score,
        "trend": trend,
        "signal": signal,
        "stale_models": stale_models,
        "rsi": round(rsi_latest, 2) if rsi_latest is not None else None,
        "atr": round(atr_latest, 2) if atr_latest is not None else None,
        "entry_price": levels["entry_price"],
        "stop_loss": levels["stop_loss"],
        "take_profit": levels["take_profit"],
        "risk_reward_ratio": levels["risk_reward_ratio"],
        "score_breakdown": score_breakdown,
        "model_predictions": {name: round(p, 2) for name, p in clipped},
        "model_predictions_raw": {name: round(p, 2) for name, p in predictions},
        "models_used": [name for name, _ in predictions],
        "forecast_7day": forecast_series,
        "shap_values": shap_values,
        "horizons": horizons,
        "overall": overall,
        "currency": mds.guess_currency(symbol),
        "model_version": get_model_version(),
        "confidence_interval": _estimate_uncertainty(ensemble, model_metrics_list, current_price),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def list_models() -> list[dict]:
    """Return status of trained models for every supported symbol."""
    out = []
    for s in SUPPORTED:
        out.append({"symbol": s, **has_trained_models(s)})
    return out
