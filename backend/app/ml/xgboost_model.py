"""
XGBoost models for FinSight.

  • build_xgb            — next-day close regressor (unchanged default so
                           predict_next_xgb / prediction_service keep working)
  • build_xgb_classifier — up/down direction classifier
  • build_xgb_volatility — next-period volatility regressor
  • build_xgb_quantile   — quantile regressor (P10 / P50 / P90 uncertainty)
  • direction_weighted_objective — custom loss penalising wrong-direction errors
  • DEFAULT_INTERACTION_CONSTRAINTS — group features so unrealistic cross-family
                           interactions are disallowed
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import joblib
import numpy as np
import xgboost as xgb

logger = logging.getLogger(__name__)


def build_xgb(n_estimators: int = 300, max_depth: int = 5,
              learning_rate: float = 0.05, random_state: int = 42,
              interaction_constraints: Optional[list] = None,
              objective=None) -> xgb.XGBRegressor:
    """
    Next-day close regressor.

    `objective` may be a custom callable (e.g. direction_weighted_objective) to
    penalise wrong-direction predictions harder than wrong-magnitude ones.
    `interaction_constraints` limits which feature groups may interact.
    """
    return xgb.XGBRegressor(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        objective=objective or "reg:squarederror",
        random_state=random_state,
        tree_method="hist",
        n_jobs=-1,
        # XGBoost 3.x wants a string form ("[[0,1],[2],...]") for numpy inputs.
        interaction_constraints=_ic_str(interaction_constraints),
    )


def _ic_str(ic):
    """Serialize interaction constraints to XGBoost's expected string form."""
    if ic is None:
        return None
    if isinstance(ic, str):
        return ic
    return str([list(map(int, g)) for g in ic])


def build_xgb_classifier(n_estimators: int = 300, max_depth: int = 5,
                         learning_rate: float = 0.05, random_state: int = 42,
                         interaction_constraints: Optional[list] = None) -> xgb.XGBClassifier:
    """Direction classifier: P(next close > current close)."""
    return xgb.XGBClassifier(
        n_estimators=n_estimators, max_depth=max_depth, learning_rate=learning_rate,
        objective="binary:logistic", eval_metric="logloss",
        random_state=random_state, tree_method="hist", n_jobs=-1,
        interaction_constraints=interaction_constraints,
    )


def build_xgb_volatility(n_estimators: int = 300, max_depth: int = 4,
                         learning_rate: float = 0.05, random_state: int = 42) -> xgb.XGBRegressor:
    """Next-period realised-volatility regressor (targets are non-negative)."""
    return xgb.XGBRegressor(
        n_estimators=n_estimators, max_depth=max_depth, learning_rate=learning_rate,
        objective="reg:squarederror", random_state=random_state,
        tree_method="hist", n_jobs=-1,
    )


def build_xgb_quantile(alpha: float, n_estimators: int = 300, max_depth: int = 5,
                       learning_rate: float = 0.05, random_state: int = 42) -> xgb.XGBRegressor:
    """
    Quantile regressor for uncertainty bands (alpha = 0.1 / 0.5 / 0.9 → P10/P50/P90).
    Uses XGBoost's native pinball loss where available, else a callable fallback.
    """
    try:
        return xgb.XGBRegressor(
            n_estimators=n_estimators, max_depth=max_depth, learning_rate=learning_rate,
            objective="reg:quantileerror", quantile_alpha=alpha,
            random_state=random_state, tree_method="hist", n_jobs=-1,
        )
    except (TypeError, xgb.core.XGBoostError):
        return xgb.XGBRegressor(
            n_estimators=n_estimators, max_depth=max_depth, learning_rate=learning_rate,
            objective=_pinball_objective(alpha),
            random_state=random_state, tree_method="hist", n_jobs=-1,
        )


def _labels(a, b):
    """
    Normalise the two objective args to (y_true, y_pred) regardless of XGBoost
    calling convention: sklearn wrapper passes (y_true, y_pred ndarrays); the
    native Booster passes (y_pred, DMatrix).
    """
    if hasattr(b, "get_label"):          # native: (y_pred, dtrain)
        return np.asarray(b.get_label(), dtype=float), np.asarray(a, dtype=float)
    return np.asarray(a, dtype=float), np.asarray(b, dtype=float)  # sklearn: (y_true, y_pred)


def _pinball_objective(alpha: float):
    """Gradient/Hessian for pinball (quantile) loss — fallback for older XGBoost."""
    def obj(a, b):
        y_true, y_pred = _labels(a, b)
        err = y_true - y_pred
        grad = np.where(err >= 0, -alpha, (1 - alpha))
        hess = np.ones_like(y_pred) * 1e-2
        return grad, hess
    return obj


def direction_weighted_objective(wrong_dir_penalty: float = 3.0, prev_close=None):
    """
    Custom regression objective: squared error, but gradients/hessians are scaled
    up by `wrong_dir_penalty` whenever the prediction lands on the WRONG side of
    the previous close (wrong direction) — penalising wrong direction more than
    wrong magnitude. `prev_close` = per-sample reference price array.
    """
    ref = None if prev_close is None else np.asarray(prev_close, dtype=float)

    def obj(a, b):
        y_true, y_pred = _labels(a, b)
        base = ref if (ref is not None and len(ref) == len(y_true)) else y_true
        grad = (y_pred - y_true)
        hess = np.ones_like(y_pred)
        true_dir = np.sign(y_true - base)
        pred_dir = np.sign(y_pred - base)
        wrong = (true_dir != 0) & (pred_dir != true_dir)
        grad = np.where(wrong, grad * wrong_dir_penalty, grad)
        hess = np.where(wrong, hess * wrong_dir_penalty, hess)
        return grad, hess
    return obj


def save_xgb(model: xgb.XGBRegressor, scaler_features, feature_cols: list, meta: dict,
             model_dir: str, symbol: str) -> dict:
    os.makedirs(model_dir, exist_ok=True)
    path = os.path.join(model_dir, f"xgb_{symbol}.pkl")
    joblib.dump({"model": model, "scaler": scaler_features, "feature_cols": feature_cols, "meta": meta}, path)
    logger.info(f"Saved XGB model to {path}")
    return {"model_path": path}


def load_xgb(model_dir: str, symbol: str) -> Optional[Tuple[xgb.XGBRegressor, object, list, dict]]:
    path = os.path.join(model_dir, f"xgb_{symbol}.pkl")
    if not os.path.exists(path):
        return None
    bundle = joblib.load(path)
    return bundle["model"], bundle["scaler"], bundle["feature_cols"], bundle.get("meta", {})


def predict_next_xgb(model: xgb.XGBRegressor, scaled_row: np.ndarray) -> float:
    """scaled_row: shape (1, n_features). Returns price (unscaled — model trained on raw target)."""
    pred = model.predict(scaled_row)[0]
    return float(pred)


def build_interaction_constraints(feature_cols: list[str]) -> list[list[int]]:
    """
    Group features into families and return XGBoost interaction constraints
    (lists of column indices allowed to interact). Prevents unrealistic splits
    that mix, say, a raw-price level with a bounded oscillator.
    """
    families = {
        "price":      ("open", "high", "low", "close", "vwap", "vp_", "prev_", "session_",
                       "sma_", "ema_", "bb_", "kc_", "ichimoku", "supertrend", "psar", "atr_trailing"),
        "momentum":   ("rsi", "macd", "stoch", "cci", "willr", "mfi", "roc", "adx"),
        "volume":     ("volume", "obv"),
        "volatility": ("atr_14", "volatility", "daily_return"),
        "regime":     ("regime_", "trend_strength", "index_corr"),
    }
    groups: dict[str, list[int]] = {k: [] for k in families}
    other: list[int] = []
    for i, col in enumerate(feature_cols):
        placed = False
        for fam, prefixes in families.items():
            if any(col.startswith(p) or p in col for p in prefixes):
                groups[fam].append(i)
                placed = True
                break
        if not placed:
            other.append(i)
    constraints = [idxs for idxs in groups.values() if idxs]
    if other:
        constraints.append(other)
    return constraints


# Convenience: build constraints for the extended feature set at import time.
try:
    from app.training.dataset_builder import EXTENDED_FEATURE_COLS as _EXT
    DEFAULT_INTERACTION_CONSTRAINTS = build_interaction_constraints(_EXT)
except Exception:
    DEFAULT_INTERACTION_CONSTRAINTS = None


# ── Multi-horizon XGBoost bundle ──────────────────────────────────────────────
HORIZONS = ["intraday", "short", "mid", "long"]
HORIZON_HORIZON_DAYS = {"intraday": 1, "short": 5, "mid": 21, "long": 63}


def build_xgb_multi_horizon(n_estimators: int = 300, max_depth: int = 5,
                            learning_rate: float = 0.05, random_state: int = 42,
                            objective=None) -> dict[str, xgb.XGBRegressor]:
    """Build 4 separate XGBRegressor models (one per horizon)."""
    models = {}
    for h in HORIZONS:
        models[h] = build_xgb(
            n_estimators=n_estimators, max_depth=max_depth,
            learning_rate=learning_rate, random_state=random_state,
            objective=objective,
        )
    return models


def save_xgb_multi_horizon(models: dict[str, xgb.XGBRegressor], scaler_features,
                           feature_cols: list, meta: dict, model_dir: str, symbol: str) -> dict:
    """Save 4 horizon models + shared scaler + feature_cols + meta in one bundle."""
    os.makedirs(model_dir, exist_ok=True)
    path = os.path.join(model_dir, f"xgb_{symbol}_multi.pkl")
    bundle = {
        "models": models,
        "scaler": scaler_features,
        "feature_cols": feature_cols,
        "meta": meta,
    }
    joblib.dump(bundle, path)
    logger.info(f"Saved multi-horizon XGB bundle to {path}")
    return {"model_path": path}


def load_xgb_multi_horizon(model_dir: str, symbol: str) -> Optional[Tuple[dict, object, list, dict]]:
    """Load multi-horizon XGB bundle. Returns (models_dict, scaler, feature_cols, meta) or None."""
    path = os.path.join(model_dir, f"xgb_{symbol}_multi.pkl")
    if not os.path.exists(path):
        return None
    bundle = joblib.load(path)
    return bundle["models"], bundle["scaler"], bundle["feature_cols"], bundle.get("meta", {})


def predict_next_xgb_multi_horizon(models: dict[str, xgb.XGBRegressor],
                                   scaled_row: np.ndarray) -> dict[str, float]:
    """
    Predict 4 horizons from a single feature row.
    scaled_row: shape (1, n_features).
    Returns: {intraday: price, short: price, mid: price, long: price}.
    """
    result = {}
    for h in HORIZONS:
        if h in models:
            pred = models[h].predict(scaled_row)[0]
            result[h] = round(float(pred), 4)
        else:
            result[h] = None
    return result
