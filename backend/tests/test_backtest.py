"""
Tests for the ML backtesting engine.

Uses synthetic data so tests are fast and deterministic.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.ml.backtesting import (
    _compute_metrics,
    _baseline_last_price,
    _baseline_sma,
    _walk_forward_indices,
    _generate_trade_signals,
)
from app.ml.ensemble import ensemble_weighted_average, _clip_outliers


class TestComputeMetrics:
    def test_perfect_prediction(self):
        y_true = np.array([100.0, 101.0, 102.0])
        y_pred = np.array([100.0, 101.0, 102.0])
        m = _compute_metrics(y_true, y_pred)
        assert m["rmse"] == 0.0
        assert m["mae"] == 0.0
        assert m["r2"] == 1.0
        assert m["directional_accuracy"] == 1.0

    def test_off_by_constant(self):
        y_true = np.array([100.0, 102.0, 104.0])
        y_pred = np.array([98.0, 100.0, 102.0])
        m = _compute_metrics(y_true, y_pred)
        assert m["rmse"] > 0
        assert m["r2"] < 1.0

    def test_single_value(self):
        y_true = np.array([100.0])
        y_pred = np.array([100.0])
        m = _compute_metrics(y_true, y_pred)
        assert m["r2"] == 0.0


class TestBaselines:
    def test_last_price(self):
        y_true = np.array([100.0, 102.0, 101.0, 103.0])
        preds = _baseline_last_price(y_true)
        assert preds[0] == 100.0
        assert preds[1] == 100.0
        assert preds[2] == 100.0

    def test_sma_20_short(self):
        y_true = np.array([100.0, 102.0])
        preds = _baseline_sma(y_true, window=20)
        assert len(preds) == 2
        assert preds[0] == 100.0


class TestWalkForwardIndices:
    def test_basic_partition(self):
        indices = _walk_forward_indices(100, n_windows=5)
        assert len(indices) == 5
        for train_start, train_end, test_start, test_end in indices:
            assert train_start == 0
            assert test_start == train_end
            assert test_end > test_start
            assert train_end > train_start

    def test_edge_small_dataset(self):
        indices = _walk_forward_indices(10, n_windows=3)
        assert len(indices) == 3


class TestTradeSignals:
    def test_bullish_market(self):
        prices = np.array([100.0, 102.0, 104.0, 106.0, 108.0, 110.0])
        y_true = prices.copy()
        y_pred = prices + 0.5
        signals, equity, acc = _generate_trade_signals(y_true, y_pred, prices)
        assert len(signals) == len(prices)
        assert len(equity) == len(prices)

    def test_hold_in_flat_market(self):
        prices = np.array([100.0, 100.1, 100.0, 100.1, 100.0])
        y_true = prices.copy()
        y_pred = prices + 0.05
        signals, equity, acc = _generate_trade_signals(y_true, y_pred, prices)
        holds = sum(1 for s in signals if s == "HOLD")
        assert holds > 0


class TestEnsemble:
    def test_single_model(self):
        result = ensemble_weighted_average(
            [("xgb", 150.0)],
            [{"mape": 3.0}],
            current_price=148.0,
        )
        assert result["ensemble_price"] == 150.0
        assert result["models_used"] == ["xgb"]

    def test_two_models_equal_weight(self):
        result = ensemble_weighted_average(
            [("xgb", 150.0), ("lstm", 152.0)],
            [{"mape": 5.0}, {"mape": 5.0}],
            current_price=148.0,
        )
        assert result["ensemble_price"] == 151.0

    def test_outlier_clipping(self):
        result = ensemble_weighted_average(
            [("xgb", 200.0)],
            [{"mape": 5.0}],
            current_price=100.0,
        )
        assert result["model_predictions"]["xgb"] == pytest.approx(115.0, rel=1e-3)

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            ensemble_weighted_average([], [], current_price=100.0)


class TestClipOutliers:
    def test_no_clip_needed(self):
        result = _clip_outliers([("xgb", 105.0)], current_price=100.0)
        assert result[0][1] == 105.0

    def test_clip_extreme(self):
        result = _clip_outliers([("xgb", 200.0)], current_price=100.0)
        assert result[0][1] <= 115.0
