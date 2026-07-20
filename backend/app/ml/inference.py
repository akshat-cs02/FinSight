"""
Prediction inference wrapper: load model, predict, validate shapes, add uncertainty.

Provides:
  - predict_with_uncertainty: returns point prediction + confidence interval
  - get_model_version: reads version metadata from disk
  - validate_features: checks feature count matches model expectations
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from app.config import settings
from app.ml.lstm_model import load_lstm, predict_next_lstm
from app.ml.xgboost_model import load_xgb, predict_next_xgb
from app.training.dataset_builder import FEATURE_COLS

logger = logging.getLogger(__name__)

MODEL_DIR = settings.MODEL_PATH


def _load_metadata() -> dict:
    path = os.path.join(MODEL_DIR, "metadata.json")
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load metadata.json: {e}")
    return {"version": "1.0.0", "updated_at": None}


def get_model_version() -> str:
    meta = _load_metadata()
    return meta.get("version", "1.0.0")


def validate_features(
    features: np.ndarray, expected_n: Optional[int]
) -> np.ndarray:
    if expected_n is not None and features.shape[1] != expected_n:
        logger.warning(
            f"Feature mismatch: model expects {expected_n}, got {features.shape[1]}. Slicing."
        )
        features = features[:, :expected_n]
    return features


def _estimate_uncertainty(
    y_pred: float,
    model_metrics: list[dict],
    current_price: float,
) -> tuple[float, float, float]:
    avg_mape = 5.0
    mapes = [m.get("mape") for m in model_metrics if m and m.get("mape") is not None]
    if mapes:
        avg_mape = sum(mapes) / len(mapes)

    base_std = current_price * (avg_mape / 100.0)
    from scipy.stats import norm
    z = norm.ppf(0.95)
    half_width = z * base_std
    return y_pred - half_width, y_pred + half_width, 0.90


def predict_with_uncertainty(
    symbol: str,
    features: np.ndarray,
    current_price: float,
) -> dict:
    symbol = symbol.upper()
    lstm_bundle = load_lstm(MODEL_DIR, symbol)
    xgb_bundle = load_xgb(MODEL_DIR, symbol)

    predictions: list[tuple[str, float]] = []
    model_metrics_list: list[dict] = []

    if xgb_bundle is not None:
        xgb_model, xgb_scaler, _, xgb_meta = xgb_bundle
        expected = getattr(xgb_scaler, "n_features_in_", features.shape[1]) if xgb_scaler else features.shape[1]
        feats = validate_features(features, expected)
        row_scaled = xgb_scaler.transform(feats) if xgb_scaler else feats
        xgb_pred = predict_next_xgb(xgb_model, row_scaled)
        predictions.append(("xgb", xgb_pred))
        model_metrics_list.append(xgb_meta.get("metrics", {}))

    if lstm_bundle is not None:
        lstm_model, scalers, lstm_meta = lstm_bundle
        feat_scaler = scalers.get("features")
        targ_scaler = scalers.get("target")
        if feat_scaler is not None:
            expected = getattr(feat_scaler, "n_features_in_", features.shape[1])
            feats = validate_features(features, expected)
            row_scaled = feat_scaler.transform(feats.reshape(1, -1))
        else:
            row_scaled = features.reshape(1, -1)
        window_scaled = row_scaled.reshape(1, 1, -1)
        lstm_pred = predict_next_lstm(lstm_model, window_scaled, targ_scaler)
        predictions.append(("lstm", lstm_pred))
        model_metrics_list.append(lstm_meta.get("metrics", {}))

    if not predictions:
        raise RuntimeError(f"No models available for {symbol}")

    weights = []
    for i, (_, _) in enumerate(predictions):
        m = model_metrics_list[i] if i < len(model_metrics_list) else {}
        mape = m.get("mape", 5.0) if m else 5.0
        weights.append(1.0 / max(mape, 0.1))

    total_w = sum(weights)
    ensemble = sum(w * p for w, (_, p) in zip(weights, predictions)) / max(total_w, 1e-10)

    lower, upper, level = _estimate_uncertainty(ensemble, model_metrics_list, current_price)

    return {
        "predicted_price": round(ensemble, 2),
        "confidence_interval": {"lower": round(lower, 2), "upper": round(upper, 2), "level": level},
        "model_version": get_model_version(),
        "models_used": [name for name, _ in predictions],
    }
