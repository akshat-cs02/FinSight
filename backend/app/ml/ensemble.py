"""
Improved ensemble: validation-weighted averaging, fallback, metadata.

Replaces the inline MAPE-weighted blending in prediction_service.py with
a reusable, testable module that also tracks which models contributed and
their relative weights.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


MAX_PCT_DEVIATION = 0.15


def _clip_outliers(
    predictions: list[tuple[str, float]],
    current_price: float,
) -> list[tuple[str, float]]:
    clipped: list[tuple[str, float]] = []
    for name, p in predictions:
        deviation = abs(p - current_price) / max(current_price, 1e-6)
        if deviation > MAX_PCT_DEVIATION:
            clipped_p = current_price * (1 + MAX_PCT_DEVIATION * (1 if p > current_price else -1))
            logger.info(
                f"[ensemble] {name} prediction {p:.2f} clipped to {clipped_p:.2f} "
                f"(was {deviation*100:.1f}% from current {current_price:.2f})"
            )
            clipped.append((name, clipped_p))
        else:
            clipped.append((name, p))
    return clipped


def ensemble_weighted_average(
    predictions: list[tuple[str, float]],
    model_metrics_list: list[dict],
    current_price: float,
) -> dict:
    if not predictions:
        raise ValueError("No predictions to ensemble")

    clipped = _clip_outliers(predictions, current_price)

    weights: list[float] = []
    for i, (_, _) in enumerate(clipped):
        m = model_metrics_list[i] if i < len(model_metrics_list) else {}
        mape = m.get("mape", 5.0) if m else 5.0
        weights.append(1.0 / max(mape, 0.1))

    total_w = sum(weights)
    if total_w > 0:
        ensemble = sum(w * p for w, (_, p) in zip(weights, clipped)) / total_w
    else:
        ensemble = float(np.mean([p for _, p in clipped]))

    max_weight = max(weights) if weights else 1.0
    weight_map = {
        name: round(float(w / max_weight), 4)
        for (name, _), w in zip(clipped, weights)
    }

    return {
        "ensemble_price": round(ensemble, 2),
        "model_predictions": {name: round(p, 2) for name, p in clipped},
        "model_predictions_raw": {name: round(p, 2) for name, p in predictions},
        "weights": weight_map,
        "models_used": [name for name, _ in clipped],
    }
