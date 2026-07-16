"""
Technical Indicators Calculator
Calculates SMA, EMA, RSI, MACD, Bollinger Bands, ATR, VWAP, and more
"""

import pandas as pd
import numpy as np
import talib
import logging

logger = logging.getLogger(__name__)

class IndicatorCalculator:
    """Calculate technical indicators for stocks"""

    @staticmethod
    def sma(data, period=20):
        """Simple Moving Average"""
        return talib.SMA(data, timeperiod=period)

    @staticmethod
    def ema(data, period=12):
        """Exponential Moving Average"""
        return talib.EMA(data, timeperiod=period)

    @staticmethod
    def rsi(data, period=14):
        """Relative Strength Index"""
        return talib.RSI(data, timeperiod=period)

    @staticmethod
    def macd(data):
        """MACD (Moving Average Convergence Divergence)"""
        macd_line, signal_line, histogram = talib.MACD(data, fastperiod=12, slowperiod=26, signalperiod=9)
        return macd_line, signal_line, histogram

    @staticmethod
    def bollinger_bands(data, period=20, std_dev=2):
        """Bollinger Bands"""
        upper, middle, lower = talib.BBANDS(data, timeperiod=period, nbdevup=std_dev, nbdevdn=std_dev)
        return upper, middle, lower

    @staticmethod
    def atr(high, low, close, period=14):
        """Average True Range"""
        return talib.ATR(high, low, close, timeperiod=period)

    @staticmethod
    def vwap(high, low, close, volume):
        """Volume Weighted Average Price"""
        typical_price = (high + low + close) / 3
        vwap = (typical_price * volume).cumsum() / volume.cumsum()
        return vwap

    @staticmethod
    def stochastic_rsi(data, period=14):
        """Stochastic RSI"""
        rsi = talib.RSI(data, timeperiod=period)
        stoch_rsi = talib.STOCH(rsi, rsi, rsi, fastk_period=14, slowk_period=3, slowd_period=3)[0]
        return stoch_rsi

    @staticmethod
    def support_resistance(data, period=20):
        """Calculate support and resistance levels"""
        support = data.rolling(window=period).min()
        resistance = data.rolling(window=period).max()
        return support, resistance

    @staticmethod
    def fibonacci_retracement(high, low):
        """Fibonacci retracement levels"""
        diff = high - low
        level_0_0 = high
        level_0_236 = high - (diff * 0.236)
        level_0_382 = high - (diff * 0.382)
        level_0_5 = high - (diff * 0.5)
        level_0_618 = high - (diff * 0.618)
        level_1_0 = low

        return {
            '0%': level_0_0,
            '23.6%': level_0_236,
            '38.2%': level_0_382,
            '50%': level_0_5,
            '61.8%': level_0_618,
            '100%': level_1_0
        }

    @classmethod
    def calculate_all(cls, df):
        """Calculate all indicators for a given dataframe"""
        try:
            close = df['Close'].values
            high = df['High'].values
            low = df['Low'].values
            volume = df['Volume'].values

            indicators = {
                'sma_20': cls.sma(close, 20),
                'sma_50': cls.sma(close, 50),
                'sma_200': cls.sma(close, 200),
                'ema_12': cls.ema(close, 12),
                'ema_26': cls.ema(close, 26),
                'rsi_14': cls.rsi(close, 14),
                'atr': cls.atr(high, low, close, 14),
                'vwap': cls.vwap(high, low, close, volume),
                'stochastic_rsi': cls.stochastic_rsi(close, 14),
            }

            # MACD
            macd_line, signal_line, histogram = cls.macd(close)
            indicators['macd'] = macd_line
            indicators['macd_signal'] = signal_line
            indicators['macd_histogram'] = histogram

            # Bollinger Bands
            upper, middle, lower = cls.bollinger_bands(close, 20, 2)
            indicators['bollinger_upper'] = upper
            indicators['bollinger_middle'] = middle
            indicators['bollinger_lower'] = lower

            # Support & Resistance
            support, resistance = cls.support_resistance(df['Close'], 20)
            indicators['support'] = support.values
            indicators['resistance'] = resistance.values

            logger.info("✅ All technical indicators calculated")
            return indicators

        except Exception as e:
            logger.error(f"Error calculating indicators: {str(e)}")
            return {}

    @staticmethod
    def generate_signals(indicators_dict, current_price):
        """Generate buy/sell/hold signals based on indicators"""
        signal_score = 0
        signals = []

        # RSI Signal
        rsi = indicators_dict.get('rsi_14', [])
        if len(rsi) > 0:
            if rsi[-1] < 30:
                signal_score += 2
                signals.append('RSI: Oversold (BUY)')
            elif rsi[-1] > 70:
                signal_score -= 2
                signals.append('RSI: Overbought (SELL)')

        # MACD Signal
        macd = indicators_dict.get('macd', [])
        signal_line = indicators_dict.get('macd_signal', [])
        if len(macd) > 1 and len(signal_line) > 1:
            if macd[-1] > signal_line[-1] and macd[-2] <= signal_line[-2]:
                signal_score += 1
                signals.append('MACD: Bullish Crossover (BUY)')
            elif macd[-1] < signal_line[-1] and macd[-2] >= signal_line[-2]:
                signal_score -= 1
                signals.append('MACD: Bearish Crossover (SELL)')

        # Bollinger Bands Signal
        if 'bollinger_lower' in indicators_dict and 'bollinger_upper' in indicators_dict:
            lower = indicators_dict['bollinger_lower'][-1]
            upper = indicators_dict['bollinger_upper'][-1]
            if current_price <= lower:
                signal_score += 1
                signals.append('BB: Price below lower band (BUY)')
            elif current_price >= upper:
                signal_score -= 1
                signals.append('BB: Price above upper band (SELL)')

        # Determine final signal
        if signal_score > 1:
            final_signal = 'BUY'
        elif signal_score < -1:
            final_signal = 'SELL'
        else:
            final_signal = 'HOLD'

        return {
            'signal': final_signal,
            'confidence': abs(signal_score) / 4,  # Normalized to 0-1
            'individual_signals': signals
        }
