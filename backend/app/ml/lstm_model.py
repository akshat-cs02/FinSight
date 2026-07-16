"""
LSTM model architecture + I/O helpers.

Base architecture (build_lstm — single-output, unchanged so existing trained
models and prediction_service keep working):
    Input(seq_len, n_features)
        → LSTM(128, return_sequences=True) → Dropout(0.2)
        → LSTM(64) → Dense(32, relu) → Dense(1)  → predicted scaled close

Advanced architecture (build_lstm_advanced):
    + self-attention between the LSTM layers
    + residual connection from a pooled input to the Dense head
    + scheduled dropout (higher in early layers)
    + optional multi-task heads: price + direction (sigmoid) + volatility
The advanced model defaults to single-output ("price" only) so it too remains a
drop-in for predict_next_lstm; pass multi_task=True to add the extra heads.
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import joblib
import numpy as np
from tensorflow.keras.layers import (
    LSTM, Dense, Dropout, Input, Attention, GlobalAveragePooling1D,
    Concatenate, LayerNormalization,
)
from tensorflow.keras.models import Model, load_model
from tensorflow.keras.optimizers import Adam

logger = logging.getLogger(__name__)


HORIZONS = ["intraday", "short", "mid", "long"]
HORIZON_WEIGHTS = {"intraday": 0.35, "short": 0.25, "mid": 0.25, "long": 0.15}


def build_lstm(seq_len: int, n_features: int, lstm1: int = 128, lstm2: int = 64,
               dropout: float = 0.2, lr: float = 1e-3) -> Model:
    inputs = Input(shape=(seq_len, n_features))
    x = LSTM(lstm1, return_sequences=True)(inputs)
    x = Dropout(dropout)(x)
    x = LSTM(lstm2)(x)
    x = Dropout(dropout)(x)
    x = Dense(32, activation="relu")(x)
    outputs = Dense(1)(x)

    model = Model(inputs=inputs, outputs=outputs, name="finsight_lstm")
    model.compile(optimizer=Adam(learning_rate=lr), loss="mse", metrics=["mae"])
    return model


def build_lstm_multi_horizon(seq_len: int, n_features: int, lstm1: int = 128, lstm2: int = 64,
                             dropout: float = 0.2, lr: float = 1e-3) -> Model:
    """
    Multi-horizon LSTM: predicts 4 prices simultaneously.
    Output: [intraday, short, mid, long] — next close at different horizons.
    Horizons: intraday=t+1, short=t+5, mid=t+21, long=t+63 (daily bars).
    """
    inputs = Input(shape=(seq_len, n_features))
    x = LSTM(lstm1, return_sequences=True)(inputs)
    x = Dropout(dropout)(x)
    x = LSTM(lstm2)(x)
    x = Dropout(dropout)(x)
    shared = Dense(64, activation="relu")(x)
    shared = Dropout(dropout * 0.5)(shared)

    # Separate head per horizon for independent learning
    intra = Dense(32, activation="relu")(shared)
    intra = Dense(1, name="intraday")(intra)
    short = Dense(32, activation="relu")(shared)
    short = Dense(1, name="short")(short)
    mid = Dense(32, activation="relu")(shared)
    mid = Dense(1, name="mid")(mid)
    long_ = Dense(32, activation="relu")(shared)
    long_ = Dense(1, name="long")(long_)

    model = Model(inputs=inputs, outputs=[intra, short, mid, long_],
                  name="finsight_lstm_multi_horizon")
    model.compile(
        optimizer=Adam(learning_rate=lr),
        loss="mse",
        loss_weights={"intraday": 0.35, "short": 0.25, "mid": 0.25, "long": 0.15},
        metrics=["mae"],
    )
    return model


def build_lstm_advanced(seq_len: int, n_features: int, lstm1: int = 128, lstm2: int = 64,
                        dropout: float = 0.3, lr: float = 1e-3,
                        multi_task: bool = False) -> Model:
    """
    Attention + residual + scheduled-dropout LSTM.

    Single-output by default (name="price") → drop-in for predict_next_lstm.
    With multi_task=True, adds "direction" (sigmoid) and "volatility" heads;
    training code must then supply a dict of targets.
    """
    inputs = Input(shape=(seq_len, n_features))

    # First recurrent block (higher dropout early — scheduled dropout).
    x = LSTM(lstm1, return_sequences=True)(inputs)
    x = Dropout(dropout)(x)                       # e.g. 0.30

    # Self-attention between the two LSTM layers.
    attn = Attention()([x, x])
    x = LayerNormalization()(x + attn)            # residual around attention

    # Second recurrent block (lower dropout later).
    seq = LSTM(lstm2, return_sequences=True)(x)
    seq = Dropout(dropout * 0.66)(seq)            # e.g. 0.20
    pooled = GlobalAveragePooling1D()(seq)

    # Residual connection from a pooled view of the raw input to the head.
    input_skip = GlobalAveragePooling1D()(inputs)
    merged = Concatenate()([pooled, input_skip])

    head = Dense(32, activation="relu")(merged)
    head = Dropout(dropout * 0.33)(head)          # e.g. 0.10 (lowest, last)

    price = Dense(1, name="price")(head)

    if not multi_task:
        model = Model(inputs=inputs, outputs=price, name="finsight_lstm_adv")
        model.compile(optimizer=Adam(learning_rate=lr), loss="mse", metrics=["mae"])
        return model

    direction = Dense(1, activation="sigmoid", name="direction")(head)
    volatility = Dense(1, activation="softplus", name="volatility")(head)
    model = Model(inputs=inputs, outputs=[price, direction, volatility],
                  name="finsight_lstm_multitask")
    model.compile(
        optimizer=Adam(learning_rate=lr),
        loss={"price": "mse", "direction": "binary_crossentropy", "volatility": "mse"},
        loss_weights={"price": 1.0, "direction": 0.3, "volatility": 0.2},
        metrics={"price": "mae", "direction": "accuracy"},
    )
    return model


def save_lstm(model: Model, scaler_features, scaler_target, meta: dict, model_dir: str, symbol: str) -> dict:
    os.makedirs(model_dir, exist_ok=True)
    h5_path = os.path.join(model_dir, f"lstm_{symbol}.keras")
    scaler_path = os.path.join(model_dir, f"lstm_{symbol}_scalers.pkl")
    meta_path = os.path.join(model_dir, f"lstm_{symbol}_meta.pkl")

    model.save(h5_path)
    joblib.dump({"features": scaler_features, "target": scaler_target}, scaler_path)
    joblib.dump(meta, meta_path)
    logger.info(f"Saved LSTM model & scalers to {h5_path}")
    return {"model_path": h5_path, "scaler_path": scaler_path, "meta_path": meta_path}


def load_lstm(model_dir: str, symbol: str) -> Optional[Tuple[Model, dict, dict]]:
    h5_path = os.path.join(model_dir, f"lstm_{symbol}.keras")
    scaler_path = os.path.join(model_dir, f"lstm_{symbol}_scalers.pkl")
    meta_path = os.path.join(model_dir, f"lstm_{symbol}_meta.pkl")
    if not (os.path.exists(h5_path) and os.path.exists(scaler_path)):
        return None
    model = load_model(h5_path, compile=False)
    scalers = joblib.load(scaler_path)
    meta = joblib.load(meta_path) if os.path.exists(meta_path) else {}
    return model, scalers, meta


def predict_next_lstm(model: Model, scaled_window: np.ndarray, scaler_target) -> float:
    """
    scaled_window: shape (1, seq_len, n_features) — already feature-scaled.
    Returns: unscaled predicted close price.

    Handles both single-output models and multi-task models (list of outputs —
    the first head is always "price"), so it stays a drop-in for all variants.
    """
    out = model.predict(scaled_window, verbose=0)
    price_out = out[0] if isinstance(out, (list, tuple)) else out   # multi-task → first head
    pred_scaled = np.asarray(price_out).reshape(-1)[0]
    pred = scaler_target.inverse_transform([[pred_scaled]])[0, 0]
    return float(pred)


def predict_next_lstm_multi_horizon(model: Model, scaled_window: np.ndarray,
                                    scaler_target) -> dict:
    """
    Multi-horizon prediction: returns {intraday, short, mid, long} predicted prices.

    scaled_window: shape (1, seq_len, n_features) — already feature-scaled.
    scaler_target: the MinMaxScaler used for the target (close price).
    """
    outs = model.predict(scaled_window, verbose=0)
    if not isinstance(outs, (list, tuple)):
        outs = [outs]
    result = {}
    for i, h in enumerate(HORIZONS):
        pred_scaled = np.asarray(outs[i]).reshape(-1)[0]
        pred = scaler_target.inverse_transform([[pred_scaled]])[0, 0]
        result[h] = round(float(pred), 4)
    return result
