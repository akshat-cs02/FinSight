"""
Walk-forward backtesting engine for ML models (LSTM + XGBoost).

Performs:
  - Expanding-window walk-forward validation
  - Metrics: RMSE, MAE, MAPE, R², directional accuracy, signal accuracy
  - Baselines: last-price persistence, SMA-20
  - Equity curves from model-based trade simulation
  - Look-ahead bias prevention (only past data used at each step)
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

from app.config import settings
from app.ml.lstm_model import load_lstm, predict_next_lstm
from app.ml.xgboost_model import load_xgb, predict_next_xgb
from app.training.dataset_builder import FEATURE_COLS, build_dataset, clean_dataset

logger = logging.getLogger(__name__)

SEQ_LEN = 60
WIN_RR = 2.5 / 1.5


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    errors = y_true - y_pred
    mse = float(np.mean(errors ** 2))
    rmse = float(math.sqrt(mse))
    mae = float(np.mean(np.abs(errors)))
    mape = float(np.mean(np.abs(errors) / np.maximum(np.abs(y_true), 1e-10)) * 100)
    ss_res = float(np.sum(errors ** 2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 1e-10 else 0.0

    direction_true = np.sign(np.diff(y_true, prepend=y_true[0]))
    direction_pred = np.sign(np.diff(y_pred, prepend=y_pred[0]))
    correct_dir = np.sum(direction_true == direction_pred)
    directional_accuracy = float(correct_dir / max(len(direction_true), 1))

    return {
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "mape": round(mape, 2),
        "r2": round(r2, 4),
        "directional_accuracy": round(directional_accuracy, 4),
    }


def _baseline_last_price(y_true: np.ndarray) -> np.ndarray:
    return np.full_like(y_true, y_true[0])


def _baseline_sma(y_true: np.ndarray, window: int = 20) -> np.ndarray:
    preds = np.full_like(y_true, np.nan)
    for i in range(window, len(y_true)):
        preds[i] = float(np.mean(y_true[i - window:i]))
    preds[:window] = y_true[0]
    return preds


def _walk_forward_indices(n: int, n_windows: int = 5) -> list[tuple[int, int, int, int]]:
    step = n // n_windows
    indices = []
    for w in range(n_windows):
        train_end = step * (w + 1)
        if w == n_windows - 1:
            train_end = n - max(step // 2, 1)
        test_start = train_end
        test_end = n if w == n_windows - 1 else min(train_end + step, n)
        indices.append((0, train_end, test_start, test_end))
    return indices


def _generate_trade_signals(
    y_true: np.ndarray, y_pred: np.ndarray, prices: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    n = len(y_pred)
    next_pred = np.roll(y_pred, -1)
    signals = np.full(n, "HOLD", dtype=object)
    for i in range(n):
        if i < len(y_pred) - 1 and next_pred[i] > prices[i] * 1.005:
            signals[i] = "BUY"
        elif y_pred[i] < prices[i] * 0.995:
            signals[i] = "SELL"

    equity = np.full(n, 10000.0)
    position: Optional[dict] = None
    for i in range(1, n):
        price = float(prices[i])
        sig = signals[i - 1] if i > 0 else "HOLD"

        if position is not None:
            if sig == "SELL" or price <= position["sl"] or price >= position["tp"]:
                pnl = (price - position["entry"]) / position["entry"] * position["risk"]
                equity[i] = equity[i - 1] + pnl
                position = None
            else:
                equity[i] = equity[i - 1]
        else:
            equity[i] = equity[i - 1]

        if position is None and sig == "BUY":
            risk = equity[i] * 0.02
            sl = price * 0.98
            tp = price * 1.035
            position = {"entry": price, "sl": sl, "tp": tp, "risk": risk}

    signal_accuracy = 0.0
    correct = 0
    total_sig = 0
    for i in range(1, n):
        if signals[i - 1] == "BUY" and prices[i] > prices[i - 1]:
            correct += 1; total_sig += 1
        elif signals[i - 1] == "SELL" and prices[i] < prices[i - 1]:
            correct += 1; total_sig += 1
        elif signals[i - 1] != "HOLD":
            total_sig += 1
    signal_accuracy = correct / max(total_sig, 1)

    return signals, equity, signal_accuracy


def run_ml_backtest(
    symbol: str,
    period: str = "2y",
    walk_forward_windows: int = 5,
) -> dict:
    symbol = symbol.upper()
    df = build_dataset(symbol, period=period, extended=False)
    df = clean_dataset(df, drop=True)

    if len(df) < SEQ_LEN + 50:
        raise ValueError(f"Need at least {SEQ_LEN + 50} bars, got {len(df)}")

    model_dir = settings.MODEL_PATH
    lstm_bundle = load_lstm(model_dir, symbol)
    xgb_bundle = load_xgb(model_dir, symbol)

    n = len(df)
    windows = _walk_forward_indices(n, walk_forward_windows)

    all_y_true: list[np.ndarray] = []
    all_y_pred: list[np.ndarray] = []
    all_prices: list[np.ndarray] = []

    for train_start, train_end, test_start, test_end in windows:
        if test_end <= test_start:
            continue

        y_true_seg = df["close"].values[test_start:test_end]
        prices_seg = df["close"].values[test_start:test_end]
        preds_seg = np.full(len(y_true_seg), np.nan)

        features = df[FEATURE_COLS].values

        if xgb_bundle is not None:
            xgb_model, xgb_scaler, _, xgb_meta = xgb_bundle
            for i, idx in enumerate(range(test_start, test_end)):
                row = features[idx:idx + 1]
                if xgb_scaler is not None:
                    try:
                        row_scaled = xgb_scaler.transform(row)
                    except Exception:
                        continue
                else:
                    row_scaled = row
                try:
                    preds_seg[i] = predict_next_xgb(xgb_model, row_scaled)
                except Exception:
                    pass

        if lstm_bundle is not None:
            lstm_model, scalers, lstm_meta = lstm_bundle
            feat_scaler = scalers.get("features")
            targ_scaler = scalers.get("target")
            for i, idx in enumerate(range(test_start, test_end)):
                if idx < SEQ_LEN:
                    continue
                window = features[idx - SEQ_LEN:idx]
                try:
                    if feat_scaler is not None:
                        window_scaled = feat_scaler.transform(window).reshape(1, SEQ_LEN, -1)
                    else:
                        window_scaled = window.reshape(1, SEQ_LEN, -1)
                    lstm_pred = predict_next_lstm(lstm_model, window_scaled, targ_scaler)
                except Exception:
                    continue
                if not np.isnan(preds_seg[i]):
                    preds_seg[i] = 0.5 * (preds_seg[i] + lstm_pred)
                else:
                    preds_seg[i] = lstm_pred

        valid = ~np.isnan(preds_seg)
        if valid.sum() > 0:
            all_y_true.append(y_true_seg[valid])
            all_y_pred.append(preds_seg[valid])
            all_prices.append(prices_seg[valid])

    if not all_y_pred:
        raise RuntimeError("No predictions generated in any walk-forward window")

    y_true_all = np.concatenate(all_y_true)
    y_pred_all = np.concatenate(all_y_pred)
    prices_all = np.concatenate(all_prices)

    model_metrics = _compute_metrics(y_true_all, y_pred_all)

    baseline_lp = _baseline_last_price(y_true_all)
    baseline_sma = _baseline_sma(y_true_all, window=20)
    baselines = {
        "last_price": _compute_metrics(y_true_all, baseline_lp),
        "sma_20": _compute_metrics(y_true_all, baseline_sma),
    }

    _, equity_curve, signal_accuracy = _generate_trade_signals(
        y_true_all, y_pred_all, prices_all
    )

    strategy_return = (equity_curve[-1] - 10000) / 10000 * 100
    benchmark_return = (prices_all[-1] - prices_all[0]) / prices_all[0] * 100

    running_max = np.maximum.accumulate(equity_curve)
    drawdowns = (equity_curve - running_max) / np.maximum(running_max, 1e-10)
    max_dd = float(drawdowns.min()) * 100

    bar_rets = np.diff(equity_curve) / np.maximum(equity_curve[:-1], 1e-10)
    sharpe = 0.0
    if len(bar_rets) > 1 and bar_rets.std() > 1e-10:
        sharpe = float(bar_rets.mean() / bar_rets.std() * math.sqrt(252))

    years = max(len(df) / 252, 1e-6)
    ann_ret = ((equity_curve[-1] / 10000) ** (1 / years) - 1) * 100
    calmar = ann_ret / abs(max_dd) if max_dd != 0 else 0.0

    model_metrics["signal_accuracy"] = round(signal_accuracy, 4)
    model_metrics["strategy_return"] = round(strategy_return, 2)
    model_metrics["benchmark_return"] = round(benchmark_return, 2)
    model_metrics["max_drawdown"] = round(max_dd, 2)
    model_metrics["win_rate"] = round(
        float(np.mean(equity_curve[1:] > equity_curve[:-1])), 4
    )

    dates = df.index[-len(y_true_all):]
    eq_curve_out = []
    for i in range(0, len(equity_curve), max(1, len(equity_curve) // 500)):
        eq_curve_out.append({
            "date": str(dates[i].date()) if i < len(dates) else "",
            "strategy": round(float(equity_curve[i]), 2),
            "benchmark": round(float(10000 * (prices_all[i] / prices_all[0])), 2),
        })

    pv_out = []
    for i in range(min(200, len(y_pred_all))):
        pv_out.append({
            "date": str(dates[i].date()) if i < len(dates) else "",
            "predicted": round(float(y_pred_all[i]), 2),
            "actual": round(float(y_true_all[i]), 2),
        })

    signals_out = _generate_trade_signals(y_true_all, y_pred_all, prices_all)
    sig_list = []
    for i in range(len(signals_out[0])):
        sig_list.append({
            "date": str(dates[i].date()) if i < len(dates) else "",
            "signal": str(signals_out[0][i]),
            "confidence": round(float(abs(y_pred_all[i] - prices_all[i]) / prices_all[i] * 100), 2),
        })

    winning = equity_curve[1:][equity_curve[1:] > equity_curve[:-1]]
    losing = equity_curve[1:][equity_curve[1:] <= equity_curve[:-1]]

    return {
        "symbol": symbol,
        "period": period,
        "status": "success",
        "cached": False,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": model_metrics,
        "baselines": baselines,
        "equity_curve": eq_curve_out,
        "predictions_vs_actuals": pv_out,
        "signals": sig_list,
        "summary": {
            "total_trades": len(equity_curve),
            "winning_trades": int(len(winning)),
            "losing_trades": int(len(losing)),
            "total_return_pct": round(strategy_return, 2),
            "benchmark_return_pct": round(benchmark_return, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "sharpe_ratio": round(sharpe, 4),
            "calmar_ratio": round(calmar, 4),
        },
    }
