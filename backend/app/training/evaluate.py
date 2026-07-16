"""Regression + trading-quality metrics for model evaluation."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def _max_drawdown(equity: np.ndarray) -> float:
    """Largest peak-to-trough drop of an equity curve, as a positive fraction."""
    if len(equity) < 2:
        return 0.0
    peak = np.maximum.accumulate(equity)
    dd = (equity - peak) / np.where(peak == 0, 1e-9, peak)
    return float(-dd.min())


def _sharpe(returns: np.ndarray, periods_per_year: int = 252) -> float:
    """Annualised Sharpe of a per-period return series (rf = 0)."""
    r = np.asarray(returns, dtype=float)
    r = r[np.isfinite(r)]
    if len(r) < 2 or r.std() == 0:
        return 0.0
    return float(r.mean() / r.std() * np.sqrt(periods_per_year))


def _strategy_returns(y_true: np.ndarray, y_pred: np.ndarray) -> np.ndarray:
    """
    Realised returns of a naive strategy: take the predicted next-step direction,
    earn the actual next-step return. Used for Sharpe / drawdown / Calmar.
    """
    actual_ret = np.diff(y_true) / np.where(y_true[:-1] == 0, 1e-9, y_true[:-1])
    pred_dir = np.sign(np.diff(y_pred))
    return pred_dir * actual_ret


def evaluate_regression(y_true: np.ndarray, y_pred: np.ndarray,
                        regimes: np.ndarray | None = None) -> dict:
    """
    Regression accuracy + trading-quality metrics.

    `regimes` (optional): per-sample regime label array aligned to y_true; if
    given, adds per-regime directional accuracy under `regime_accuracy`.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae = float(mean_absolute_error(y_true, y_pred))
    eps = 1e-8
    mape = float(np.mean(np.abs((y_true - y_pred) / (np.abs(y_true) + eps))) * 100)
    r2 = float(r2_score(y_true, y_pred)) if len(y_true) > 1 else 0.0

    # Directional accuracy — right sign of the step-to-step change.
    dir_true = np.sign(np.diff(y_true))
    dir_pred = np.sign(np.diff(y_pred))
    directional_accuracy = float(np.mean(dir_true == dir_pred)) if len(dir_true) else 0.0

    # Trading-quality metrics from the direction strategy.
    strat_ret = _strategy_returns(y_true, y_pred)
    equity = np.cumprod(1.0 + strat_ret) if len(strat_ret) else np.array([1.0])
    max_dd = _max_drawdown(equity)
    sharpe = _sharpe(strat_ret)
    annual_return = float(equity[-1] ** (252 / max(len(strat_ret), 1)) - 1) if len(strat_ret) else 0.0
    calmar = float(annual_return / max_dd) if max_dd > 1e-9 else 0.0

    # Prediction stability — std of a rolling window of predictions (lower=steadier).
    if len(y_pred) >= 5:
        roll = np.array([y_pred[i:i + 5].std() for i in range(len(y_pred) - 4)])
        prediction_stability = float(np.mean(roll))
    else:
        prediction_stability = float(np.std(y_pred)) if len(y_pred) else 0.0

    out = {
        "rmse": rmse,
        "mae": mae,
        "mape": mape,
        "r2_score": r2,
        "directional_accuracy": directional_accuracy,
        "max_drawdown": max_dd,
        "sharpe_ratio": sharpe,
        "calmar_ratio": calmar,
        "prediction_stability": prediction_stability,
    }

    # Per-regime directional accuracy.
    if regimes is not None and len(regimes) >= len(dir_true) + 1 and len(dir_true):
        reg = np.asarray(regimes)[1:len(dir_true) + 1]
        regime_acc: dict[str, float] = {}
        for label in np.unique(reg):
            mask = reg == label
            if mask.sum():
                regime_acc[str(label)] = float(np.mean(dir_true[mask] == dir_pred[mask]))
        out["regime_accuracy"] = regime_acc

    return out
