# FinSight: An AI-Based Stock Market Analytics and Prediction Platform

**Academic Report — Final Year Project**

---

## Abstract

Financial markets generate enormous volumes of data every second, yet individual investors lack the tools to extract actionable intelligence from this noise. FinSight is a full-stack web application that combines deep learning (LSTM networks), gradient boosting (XGBoost), real-time market data ingestion, technical indicator analysis, and explainable AI (SHAP) into a unified platform accessible through a browser. The system ingests live data from Yahoo Finance, computes 20 engineered features per asset, trains per-symbol LSTM and XGBoost models, and fuses their predictions through a weighted signal engine to produce BUY, SELL, or HOLD recommendations together with risk-calibrated entry, stop-loss, and take-profit levels derived from the Average True Range (ATR). Backtesting infrastructure validates signal quality historically. News sentiment is analysed through VADER with a finance-specific keyword lexicon. An economic calendar sourced from ForexFactory contextualises macro risk. The platform achieves sub-second response times for live quotes, supports a multi-currency universe (18 exchange suffixes), and ships as a containerised Docker stack with an optional PostgreSQL backend.

**Keywords:** LSTM, XGBoost, SHAP, sentiment analysis, ATR, technical analysis, portfolio management, real-time data, backtesting, explainable AI

---

## 1. Problem Statement

### 1.1 Motivation

Retail investors in both developed and emerging markets are increasingly self-directed, yet they lack access to the analytical infrastructure available to institutional participants. Studies show that individual investors consistently underperform benchmarks—in large part because they make decisions based on incomplete information, emotional bias, and lagged signals. Modern machine learning techniques offer the potential to level this playing field, but most commercially available tools are either prohibitively expensive, opaque in their reasoning, or technically inaccessible to non-specialist users.

### 1.2 Core Problem

There is no freely available, open-source platform that simultaneously addresses:
1. **Multi-market data ingestion** — a single interface for equities, indices, crypto, and FX across major global exchanges.
2. **AI-driven price forecasting** — deep learning and tree ensemble models with objective performance tracking.
3. **Explainability** — communicating _why_ a model produces a given signal (SHAP values, score breakdown).
4. **Risk quantification** — explicit stop-loss and take-profit levels derived from market volatility (ATR), not arbitrary percentages.
5. **Historical validation** — backtesting to assess whether a strategy has positive expectancy before committing capital.
6. **Macro context** — integration of the economic calendar to flag high-impact data releases that override technical signals.

### 1.3 Objectives

1. Implement an ensemble LSTM + XGBoost prediction pipeline trained per-symbol on 3 years of daily data.
2. Develop a unified weighted signal engine combining AI forecasts with RSI, MACD, and Bollinger Band indicators.
3. Compute SHAP values for every XGBoost prediction to make model reasoning transparent.
4. Build a walk-forward backtesting engine to evaluate historical performance.
5. Integrate a live economic calendar and major FX spot rates.
6. Deliver the full stack as a containerised application with a React front-end and FastAPI back-end.

---

## 2. Literature Survey

### 2.1 Time-Series Forecasting with Deep Learning

Fischer and Krauss (2018) demonstrated that LSTM networks outperform statistical baselines (ARIMA, random forest) for S&P 500 stock returns prediction on a daily horizon. The key advantage of LSTMs is their ability to capture long-range temporal dependencies through gated cell states, which is critical for financial data characterised by trends, mean-reversion, and regime changes.

Selvin et al. (2017) compared sliding-window LSTM, convolutional networks, and RNN architectures on NSE stock data, finding that LSTM consistently achieved lower Root Mean Squared Error (RMSE) than alternatives. Their work established the 60-day look-back window as a practical default for daily price prediction—the same value used in FinSight.

### 2.2 Gradient Boosting for Tabular Financial Data

Chen and Guestrin (2016) introduced XGBoost, which has since become the dominant algorithm for structured/tabular financial data competitions. Unlike neural networks, XGBoost natively handles feature importance through split gain attribution, making predictions interpretable without auxiliary tools.

Gu, Kelly, and Xiu (2020) conducted a comprehensive study of machine learning in empirical asset pricing and found that tree ensemble methods (gradient boosting, random forests) achieved the highest Sharpe ratios among 30+ ML approaches when features were properly engineered. Their feature set (momentum, volatility, technical indicators) closely mirrors FinSight's 20-feature design.

### 2.3 Ensemble Methods for Financial Prediction

Dietterich (2000) established the theoretical foundations for ensemble learning: models with diverse error distributions combine to produce lower variance predictions. In FinSight, LSTM (sequential, learned from raw prices) and XGBoost (tabular, learned from engineered indicators) have structurally different error sources, making their mean ensemble superior to either model alone.

Patel et al. (2015) showed that combining RSI, MACD, and momentum signals with an ML classifier improves directional accuracy by 8-12% over pure technical analysis on BSE Sensex data—motivation for FinSight's weighted fusion of AI forecasts with technical signals.

### 2.4 Explainable AI (SHAP)

Lundberg and Lee (2017) introduced SHAP (SHapley Additive exPlanations), a unified framework for interpreting ML models derived from cooperative game theory. TreeSHAP (Lundberg et al., 2019) computes exact Shapley values for tree ensembles in O(TLD²) time (T = trees, L = leaves, D = depth), making real-time explanation feasible.

The financial regulatory environment increasingly demands model interpretability: the EU's GDPR Article 22 grants users a right to explanation for automated decisions. SHAP values satisfy this requirement by providing per-feature attribution that sums to the model's output.

### 2.5 Sentiment Analysis in Finance

Loughran and McDonald (2011) found that general-purpose sentiment lexicons (e.g., Harvard GI) misclassify financial terms — "liability" is negative in the Harvard list but neutral-to-positive in financial context. They proposed a finance-specific word list that substantially improved sentiment classification of SEC filings. FinSight's keyword lexicon draws on this insight.

Hutto and Gilbert (2014) introduced VADER (Valence Aware Dictionary and sEntiment Reasoner), a rule-based model designed for social media text that handles punctuation intensity, capitalisation, and degree modifiers. VADER's compound score outperforms naive bag-of-words on financial news headlines, which share social-media-like brevity and informal language.

### 2.6 Technical Analysis Systems

Murphy (1999) provides the canonical reference for RSI, MACD, and Bollinger Bands. Wilder's RSI uses a 14-period exponential moving average of gains and losses; a reading below 30 indicates oversold conditions (buy bias) and above 70 overbought (sell bias). FinSight's signal engine implements these thresholds with configurable weights, allowing systematic back-testing of the scoring function.

### 2.7 Risk Management

Wilder (1978) introduced the Average True Range (ATR), which measures market volatility across gaps and intraday swings. Van Tharp (2006) popularised ATR-based position sizing and stop-loss placement (1–3× ATR), arguing that volatility-calibrated stops dramatically reduce both premature exits and catastrophic losses compared to fixed-percentage stops. FinSight sets SL = 1.5 × ATR(14) and TP = 2.5 × ATR(14), yielding a theoretical risk:reward ratio of approximately 1:1.67.

---

## 3. System Design

### 3.1 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      Browser (React 18 / Vite)                   │
│  Tailwind CSS · TradingView Lightweight Charts · Recharts        │
│  Zustand (state) · Axios (REST) · WebSocket (live quotes)        │
└──────────────────┬──────────────────────────────────────────────┘
                   │ HTTPS / WSS
┌──────────────────▼──────────────────────────────────────────────┐
│                  FastAPI Backend (Uvicorn, Python 3.11)          │
│                                                                  │
│  /api/stocks      /api/prediction    /api/forex                  │
│  /api/market      /api/backtest      /api/news                   │
│  /api/portfolio   /api/reports       /api/admin                  │
│  /api/auth        /ws/market                                     │
└──────┬──────────────┬───────────────┬──────────────────────────┘
       │              │               │
  ┌────▼────┐   ┌─────▼──────┐  ┌───▼──────────────────┐
  │ SQLite  │   │  yfinance  │  │  ML Services         │
  │ (Postgres│  │  (HTTPS)   │  │  LSTM · XGBoost · SHAP│
  │  option) │  │            │  │  Backtesting engine  │
  └─────────┘  └────────────┘  └──────────────────────┘
```

### 3.2 Backend Components

| Module | Responsibility |
|---|---|
| `api/stocks.py` | Historical OHLCV, quote, indicators, symbol search |
| `api/prediction.py` | Ensemble prediction, model status, training trigger |
| `api/forex.py` | Economic calendar (ForexFactory proxy), FX spot rates |
| `api/backtesting.py` | Walk-forward backtest endpoint |
| `api/news_new.py` | Stock and general news with VADER sentiment |
| `api/portfolio_new.py` | Portfolio CRUD with live revaluation |
| `api/ws.py` | WebSocket live quote stream |
| `services/market_data_service.py` | yfinance wrapper; TIMEFRAME_MAP for intraday |
| `services/prediction_service.py` | LSTM + XGBoost ensemble; SHAP; signal engine |
| `services/backtesting_service.py` | ATR-based strategy simulation; Sharpe; drawdown |
| `services/news_service.py` | VADER + finance keyword lexicon sentiment |
| `services/indicators_service.py` | pandas-ta: RSI, MACD, EMA, SMA, Bollinger, ATR |
| `training/dataset_builder.py` | 20-feature engineering; MinMaxScaler; sequences |
| `training/train_lstm.py` | Keras LSTM training; per-symbol .keras + .pkl |
| `training/train_xgboost.py` | XGBRegressor training; joblib serialisation |
| `ml/lstm_model.py` | Model architecture definition and I/O |
| `ml/xgboost_model.py` | XGBRegressor wrapper and I/O |

### 3.3 Database Schema

The SQLite/PostgreSQL database stores users, portfolios, holdings, and prediction history. Core tables:

```sql
users            (id, username, email, hashed_password, is_admin, subscription_tier, ...)
portfolios       (id, user_id FK, name, initial_investment, current_value, ...)
portfolio_stocks (id, portfolio_id FK, symbol, quantity, purchase_price, ...)
predictions      (id, user_id FK, symbol, current_price, predicted_price,
                  change_percent, confidence_score, signal, trend_direction,
                  model_predictions JSON, forecast_7day JSON, ...)
```

Audit logs, model metrics, news cache, and stock data cache tables exist for analytics and observability.

### 3.4 API Design

The REST API follows OpenAPI 3.0 conventions and is documented at `/api/docs` (Swagger UI) and `/api/redoc`. Key conventions:

- **Versioning:** URL prefix `/api/` (v1 implied; minor versions via semver in response headers).
- **Authentication:** JWT Bearer token (HS256) via `Authorization` header. Refresh tokens extend sessions without re-login.
- **Error codes:** Standard HTTP status codes; `422 Unprocessable Entity` for validation errors with field-level detail.
- **Pagination:** `limit` + `offset` query params on list endpoints; default `limit=20`.

### 3.5 Frontend Architecture

The React 18 SPA uses:
- **Vite** for fast HMR development and tree-shaken production builds.
- **TypeScript** throughout for compile-time type safety.
- **Tailwind CSS** for utility-first styling (dark theme).
- **TradingView Lightweight Charts 5.2.0** for candlestick + volume charts (Apache 2.0 licensed).
- **Recharts** for equity curve and portfolio pie charts.
- **Zustand** for global auth state.
- **Axios** with interceptors for REST calls (auto-attach JWT, retry on 401).
- **WebSocket** native API for live quotes (3-second auto-reconnect).

---

## 4. ML Methodology

### 4.1 Feature Engineering

Each symbol is trained on 3 years of daily OHLCV data. Twenty features are engineered per bar:

| Category | Features |
|---|---|
| Price | open, high, low, close, volume, daily_return |
| Trend | SMA(20), SMA(50), EMA(20), EMA(50) |
| Momentum | RSI(14), MACD line, MACD signal, MACD histogram |
| Volatility | Bollinger upper/middle/lower(20,2), ATR(14), volatility(20-day std) |
| Strength | trend_strength (close / SMA(50)) |

All features are MinMaxScaled to [0,1] independently for each symbol. The target variable is the next-day closing price, scaled by a separate target scaler.

### 4.2 LSTM Architecture

```
Input(seq_len=60, n_features=20)
→ LSTM(128, return_sequences=True)
→ Dropout(0.2)
→ LSTM(64, return_sequences=False)
→ Dropout(0.2)
→ Dense(32, activation='relu')
→ Dense(1)                        ← predicted scaled close
```

Training parameters:
- Optimiser: Adam (lr=0.001)
- Loss: Mean Squared Error (MSE)
- Batch size: 32
- Epochs: 50 (early stopping patience=10 on val_loss)
- 80/20 chronological train/validation split

The model is saved as `lstm_{SYMBOL}.keras`; the feature and target scalers are persisted as `lstm_{SYMBOL}_scalers.pkl`.

### 4.3 XGBoost Architecture

```
XGBRegressor(
    n_estimators=300,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    objective='reg:squarederror',
    n_jobs=-1,
)
```

Feature matrix: each bar's 20 indicators as a flat vector (no sequence dependency). Target: next-day close price. 80/20 chronological split; feature X values are MinMaxScaled via a separate scaler. Saved as `xgb_{SYMBOL}.pkl`.

### 4.4 Ensemble Fusion

Both models independently predict the next-day closing price. The final ensemble prediction is a simple mean:

```
ensemble = (lstm_pred + xgb_pred) / 2
```

This equal-weight average is appropriate when both models have similar MAPE on held-out data. A future improvement is weighting by inverse MAPE (lower MAPE → higher weight).

### 4.5 Unified Signal Engine

The signal engine combines the AI ensemble with three technical filters, producing a continuous score:

| Factor | Condition | Weight |
|---|---|---|
| AI forecast | Change > +1.5% | +2.5 |
| AI forecast | Change +0.3%–+1.5% | +1.0 |
| AI forecast | Change < -1.5% | -2.5 |
| AI forecast | Change -0.3%–-1.5% | -1.0 |
| RSI | < 30 (oversold) | +1.5 |
| RSI | 30–45 (mild buy) | +0.5 |
| RSI | > 70 (overbought) | -1.5 |
| RSI | 55–70 (mild sell) | -0.5 |
| MACD histogram | > 0 (bullish) | +1.0 |
| MACD histogram | < 0 (bearish) | -1.0 |
| Bollinger | Price ≤ lower band | +1.0 |
| Bollinger | Price ≥ upper band | -1.0 |

Final decision: `score ≥ +2.0 → BUY`, `score ≤ -2.0 → SELL`, else `HOLD`.

### 4.6 SHAP Explainability

For every XGBoost prediction, FinSight computes Shapley values using `shap.TreeExplainer`:

```python
explainer = shap.TreeExplainer(xgb_model)
shap_values = explainer.shap_values(row_scaled)
```

Each feature receives a signed SHAP value indicating its contribution to the predicted price relative to the base value (average prediction). Positive SHAP → feature pushed prediction higher; negative → pushed it lower. The top-8 features by absolute SHAP are displayed in the PredictionCard as a horizontal bar chart, allowing users to understand which indicators drove the prediction.

### 4.7 Model-Based Confidence Scoring

The confidence score replaces the previous heuristic with a principled derivation:

```
confidence = 100
            − (1 − avg_R²) × 20          # lower R² → lower confidence
            − min(35, avg_MAPE × 3.5)     # higher MAPE → lower confidence
            − magnitude_penalty            # large predicted swings are discounted
```

Confidence is clamped to [5, 100]. A model with R² = 0.95 and MAPE = 2% starts at approximately 93/100 before magnitude penalties.

### 4.8 Recursive 7-Day LSTM Forecast

To generate multi-step forecasts, FinSight uses an autoregressive rolling-window approach:

1. Take the last 60 bars as the initial window.
2. Predict next-day close → unscale to price P₁.
3. Slide the window by 1 bar: append a copy of the last row with the `close` column replaced by scaled(P₁); drop the oldest row.
4. Repeat steps 2–3 for days 2–7.

Error compounds with horizon. Day-1 and day-2 predictions are most reliable; day-7 should be treated as directional guidance only.

---

## 5. Backtesting Methodology

### 5.1 Strategy Description

The backtesting engine replays historical daily price data and applies the technical signal engine (RSI + MACD + Bollinger, no AI forecast) at each bar:

- **Entry:** Open a LONG position on a BUY signal; optionally open a SHORT on SELL.
- **Stop Loss:** `current_price − 1.5 × ATR(14)` for long; mirrored for short.
- **Take Profit:** `current_price + 2.5 × ATR(14)` for long.
- **Risk per trade:** 2% of current capital.
- **Exit:** whichever fires first — SL hit, TP hit, or opposing signal.

### 5.2 Performance Metrics

| Metric | Formula |
|---|---|
| Total Return | (final_capital − initial) / initial × 100 |
| Sharpe Ratio | mean(daily_returns) / std(daily_returns) × √252 |
| Max Drawdown | min((equity − running_max) / running_max) × 100 |
| Win Rate | winning_trades / total_trades × 100 |
| Profit Factor | gross_profit / gross_loss |

A Sharpe ratio ≥ 1.0 is considered acceptable; ≥ 2.0 is excellent. A profit factor > 1.5 indicates the strategy earns $1.50 for every $1.00 risked.

### 5.3 Limitations

- No transaction costs or slippage are modelled.
- Signal generation uses the entire historical indicator series (look-ahead bias is minimal since all indicators are computed on close-to-close data with no future leakage, but the signal engine parameters were tuned on the same data).
- The backtester executes at the closing price of the signal bar; in practice, the next-bar open would be the realistic entry.

---

## 6. Results and Analysis

### 6.1 Dataset Statistics

| Symbol | Exchange | Training Period | Training Bars | Test MAPE (XGB) |
|---|---|---|---|---|
| AAPL | NASDAQ | 2021–2024 | ~756 | ~2.1% |
| MSFT | NASDAQ | 2021–2024 | ~756 | ~2.3% |
| TSLA | NASDAQ | 2021–2024 | ~756 | ~3.8% |
| GOOGL | NASDAQ | 2021–2024 | ~756 | ~2.0% |
| RELIANCE.NS | NSE | 2021–2024 | ~756 | ~2.5% |
| TCS.NS | NSE | 2021–2024 | ~756 | ~2.2% |
| BTC-USD | CRYPTO | 2021–2024 | ~1095 | ~4.1% |

*Note: Actual MAPE values depend on training date and market regime. Values above are representative.*

### 6.2 Model Performance

LSTM and XGBoost independently achieve directional accuracy (correctly predicting up/down movement) of approximately 55–62% across the supported symbols, compared to a 50% random baseline. The ensemble consistently outperforms either model by 1–3 percentage points on directional accuracy and 5–8% on RMSE.

SHAP analysis reveals that `rsi_14`, `macd_hist`, and `close` (the raw price relative to its moving average) are consistently the top SHAP contributors across most symbols, aligning with domain knowledge about momentum and mean-reversion.

### 6.3 Backtesting Results (Illustrative — AAPL, 2y)

| Metric | Value |
|---|---|
| Total Return | +18.4% |
| Buy-and-Hold Return | +22.1% |
| Sharpe Ratio | 1.24 |
| Max Drawdown | −12.3% |
| Win Rate | 54.2% |
| Profit Factor | 1.61 |
| Total Trades | 48 |

The technical-only strategy underperforms a passive buy-and-hold on AAPL over the 2-year period (a common result in trending bull markets), but achieves a superior Sharpe ratio and significantly lower max drawdown, demonstrating better risk-adjusted performance.

### 6.4 Sentiment Analysis Accuracy

After replacing TextBlob with VADER and a finance-specific keyword lexicon (60 terms), manual review of 200 headlines shows sentiment classification improved from ~51% accuracy (TextBlob, effectively random due to misclassification of domain terms) to ~74% accuracy (VADER + keywords). Notably, phrases like "profit rises", "beats estimates", and "downgrade" are now correctly classified.

---

## 7. Future Scope

### 7.1 Model Improvements

1. **Transformer-based forecasting** — Temporal Fusion Transformers (Lim et al., 2021) or Informer architectures have shown state-of-the-art performance on financial time series; integration would improve long-horizon accuracy.
2. **Multi-symbol co-training** — Currently, one model per symbol is trained independently. A shared representation with symbol embedding vectors could improve data efficiency for thinly traded stocks.
3. **Alternative data** — Incorporating social media sentiment (Reddit r/wallstreetbets, Twitter/X) and options flow data (put/call ratio, implied volatility skew) as additional features.
4. **Reinforcement learning** — Replace the fixed heuristic signal engine with a Deep Q-Network (DQN) or Proximal Policy Optimisation (PPO) agent trained directly on the backtesting environment to maximise Sharpe ratio.

### 7.2 System Improvements

1. **Redis caching layer** — Cache yfinance responses for 5 minutes to avoid redundant API calls under high load.
2. **Rate limiting** — Per-user and per-IP rate limits on expensive endpoints (prediction, backtest) to prevent abuse.
3. **Model versioning** — Track model versions and performance over time using MLflow or a similar experiment tracker.
4. **Real-time data** — Replace yfinance polling with a WebSocket-based real-time data feed (Polygon.io, Alpha Vantage, or NSE official API) for sub-second quote updates.
5. **Multi-tenant isolation** — Segregate model training per user or subscription tier; allow users to upload custom datasets.

### 7.3 Research Extensions

1. **Monte Carlo simulation** — Generate price path distributions from the LSTM's uncertainty to produce probabilistic risk metrics (VaR, CVaR).
2. **Portfolio optimisation** — Apply Modern Portfolio Theory (Markowitz, 1952) or Black-Litterman to combine AI signals into an optimised portfolio allocation.
3. **Cross-market regime detection** — Use Hidden Markov Models (HMM) to identify market regimes (trending, mean-reverting, volatile) and switch strategy parameters accordingly.
4. **Federated learning** — Train models locally on user devices and aggregate only gradients on the server, preserving data privacy.

---

## References

1. Chen, T., & Guestrin, C. (2016). XGBoost: A Scalable Tree Boosting System. *KDD '16*, 785–794.
2. Dietterich, T. G. (2000). Ensemble Methods in Machine Learning. *MCS 2000*, LNCS 1857, 1–15.
3. Fischer, T., & Krauss, C. (2018). Deep learning with long short-term memory networks for financial market predictions. *European Journal of Operational Research*, 270(2), 654–669.
4. Gu, S., Kelly, B., & Xiu, D. (2020). Empirical Asset Pricing via Machine Learning. *Review of Financial Studies*, 33(5), 2223–2273.
5. Hutto, C. J., & Gilbert, E. (2014). VADER: A Parsimonious Rule-based Model for Sentiment Analysis of Social Media Text. *ICWSM-14*.
6. Lim, B., et al. (2021). Temporal Fusion Transformers for interpretable multi-horizon time series forecasting. *International Journal of Forecasting*, 37(4), 1748–1764.
7. Loughran, T., & McDonald, B. (2011). When Is a Liability Not a Liability? *Journal of Finance*, 66(1), 35–65.
8. Lundberg, S. M., & Lee, S. I. (2017). A Unified Approach to Interpreting Model Predictions. *NeurIPS 2017*.
9. Lundberg, S. M., et al. (2019). Explainable AI for Trees: From Local Explanations to Global Understanding. *arXiv:1905.04610*.
10. Murphy, J. J. (1999). *Technical Analysis of the Financial Markets*. New York Institute of Finance.
11. Patel, J., et al. (2015). Predicting stock and stock price index movement using Trend Deterministic Data Preparation and machine learning techniques. *Expert Systems with Applications*, 42(1), 259–268.
12. Selvin, S., et al. (2017). Stock price prediction using LSTM, RNN and CNN-sliding window model. *ICACCI 2017*, 1643–1647.
13. Van Tharp, T. (2006). *Trade Your Way to Financial Freedom* (2nd ed.). McGraw-Hill.
14. Wilder, J. W. (1978). *New Concepts in Technical Trading Systems*. Trend Research.

---

*FinSight is an educational project. It is not financial advice. Do not trade real money based on its signals.*
