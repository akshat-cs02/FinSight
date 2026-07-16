"""
LSTM-based Stock Price Prediction Model
Predicts future stock prices using historical OHLCV data + technical indicators + sentiment
"""

import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dropout, Dense
from tensorflow.keras.optimizers import Adam
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_percentage_error, r2_score
import joblib
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class LSTMPredictor:
    """LSTM model for stock price prediction"""

    def __init__(self, lookback_window=60, lstm_units=128):
        self.lookback_window = lookback_window
        self.lstm_units = lstm_units
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        self.model = None
        self.history = None

    def build_model(self, input_shape):
        """Build LSTM architecture"""
        self.model = Sequential([
            LSTM(self.lstm_units, activation='relu', input_shape=input_shape, return_sequences=True),
            Dropout(0.2),
            LSTM(self.lstm_units // 2, activation='relu', return_sequences=True),
            Dropout(0.2),
            LSTM(self.lstm_units // 4, activation='relu'),
            Dropout(0.2),
            Dense(32, activation='relu'),
            Dense(1)
        ])

        self.model.compile(
            optimizer=Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )

        logger.info(f"✅ LSTM model built with input shape: {input_shape}")
        return self.model

    def prepare_data(self, data, target_column='Close'):
        """Prepare and normalize data for LSTM"""
        # Extract target column
        prices = data[[target_column]].values

        # Scale the data
        scaled_data = self.scaler.fit_transform(prices)

        # Create sequences
        X, y = [], []
        for i in range(len(scaled_data) - self.lookback_window):
            X.append(scaled_data[i:i + self.lookback_window])
            y.append(scaled_data[i + self.lookback_window])

        X = np.array(X)
        y = np.array(y)

        logger.info(f"Data prepared: X shape = {X.shape}, y shape = {y.shape}")
        return X, y

    def train(self, X_train, y_train, epochs=50, batch_size=32, validation_split=0.2):
        """Train the LSTM model"""
        self.history = self.model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            verbose=1,
            shuffle=True
        )

        logger.info(f"✅ Model training completed: {epochs} epochs")
        return self.history

    def evaluate(self, X_test, y_test):
        """Evaluate model performance"""
        y_pred = self.model.predict(X_test)

        # Inverse scale predictions
        y_pred_inverse = self.scaler.inverse_transform(y_pred)
        y_test_inverse = self.scaler.inverse_transform(y_test)

        # Calculate metrics
        mse = mean_squared_error(y_test_inverse, y_pred_inverse)
        rmse = np.sqrt(mse)
        mape = mean_absolute_percentage_error(y_test_inverse, y_pred_inverse)
        r2 = r2_score(y_test_inverse, y_pred_inverse)

        metrics = {
            'mse': float(mse),
            'rmse': float(rmse),
            'mape': float(mape),
            'r2_score': float(r2),
            'accuracy': max(0, min(100, 100 * (1 - mape)))
        }

        logger.info(f"Model Evaluation - RMSE: {rmse:.4f}, MAPE: {mape:.4f}, R²: {r2:.4f}")
        return metrics

    def predict(self, recent_data, days_ahead=1):
        """Predict future prices"""
        # Prepare the data
        scaled_recent = self.scaler.transform(recent_data[[-1]].values.reshape(-1, 1))

        # Build input sequence
        if len(recent_data) >= self.lookback_window:
            input_seq = self.scaler.transform(recent_data.values.reshape(-1, 1))
            input_seq = input_seq[-self.lookback_window:].reshape(1, self.lookback_window, 1)
        else:
            logger.warning(f"Insufficient data for prediction. Need {self.lookback_window} points")
            return None

        # Make predictions
        predictions = []
        current_seq = input_seq.copy()

        for _ in range(days_ahead):
            next_pred = self.model.predict(current_seq, verbose=0)
            predictions.append(next_pred[0, 0])

            # Update sequence for next prediction
            current_seq = np.append(current_seq[0, 1:], [[next_pred[0, 0]]], axis=0)
            current_seq = current_seq.reshape(1, self.lookback_window, 1)

        # Inverse scale
        predictions_inverse = self.scaler.inverse_transform(np.array(predictions).reshape(-1, 1))

        logger.info(f"✅ Prediction complete: {days_ahead} days")
        return predictions_inverse.flatten()

    def save_model(self, filepath):
        """Save model and scaler"""
        if self.model is None:
            logger.error("Model not found. Train the model first.")
            return False

        try:
            self.model.save(f"{filepath}.h5")
            joblib.dump(self.scaler, f"{filepath}_scaler.pkl")
            logger.info(f"✅ Model saved to {filepath}")
            return True
        except Exception as e:
            logger.error(f"Failed to save model: {str(e)}")
            return False

    def load_model(self, filepath):
        """Load pre-trained model and scaler"""
        try:
            from tensorflow.keras.models import load_model
            self.model = load_model(f"{filepath}.h5")
            self.scaler = joblib.load(f"{filepath}_scaler.pkl")
            logger.info(f"✅ Model loaded from {filepath}")
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            return False
