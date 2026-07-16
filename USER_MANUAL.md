# FinSight — User Manual

## Getting started

1. Open **http://localhost:3000** (or wherever you've deployed).
2. **Register** an account. Leave _Admin key_ blank for a regular account, or paste the `ADMIN_API_KEY` value from `.env` to register as admin.
3. After login you land on the **Dashboard**.

> Tokens are stored in your browser's local storage. Click **Logout** in the top-right to clear them.

---

## Top navigation

| Element | What it does |
|---|---|
| **Search bar** | Type any ticker (AAPL, TSLA, RELIANCE.NS, BTC-USD…). Hit Enter or click a suggestion → go to Stock Details. |
| **Username** | Shows current user. `ADMIN` tag appears for admin accounts. |
| **Logout** | Clears tokens, returns to login. |

---

## Sidebar

- **Dashboard** — market overview + live ticker + AI outlook
- **Stocks** — full per-stock analysis (charts, indicators, AI prediction, news)
- **AI Predictions** — model panel + history per symbol + training controls
- **Portfolio** — holdings, P/L, allocation pie, PDF/CSV download
- **News** — sentiment-filtered news feed
- **Settings** — account info
- **Admin** — _only visible to admins_

---

## Dashboard

What you see, top to bottom:

1. **4 metric cards** — Portfolio Value, Today's P/L, Market Status (OPEN/CLOSED), Holdings count.
2. **Live ticker bar** — WebSocket-driven, prices refresh every 5 seconds. A green Wi-Fi icon = connected; yellow = reconnecting.
3. **AI Market Outlook** — top trained-stock predictions ranked by confidence × move magnitude. Click any tile to drill in.
4. **Market Indices** — S&P 500, NASDAQ, Dow Jones, VIX snapshot.
5. **Trending Stocks** — Yahoo Finance hot list.
6. **Top Gainers / Losers** — % movers.
7. **Latest Financial News** — VADER-scored sentiment badges.

---

## Stock Details (`/stocks/<symbol>`)

### Header
- Symbol, company name, exchange.
- Big current price + change (color: green if up, red if down).

### Action buttons
- **Add to Portfolio** — opens an inline form. Enter quantity + buy price → saves to your portfolio.
- **PDF Report** — downloadable stock analysis PDF (quote + indicators).
- **CSV Data** — historical OHLCV in CSV.

### Quote details
8 small cards: Open, High, Low, Volume, 52w High/Low, Market Cap, P/E.

### Price Chart
- **Candles** (default) — TradingView Lightweight Charts with green/red candles + volume in a bottom pane. Crosshair on hover. Pinch/scroll to zoom.
- **Area** — alternative simple area chart.
- **Timeframe** — 1D / 5D / 1MO / 3MO / 6MO / 1Y / 5Y (live re-fetch from yfinance).

### AI Prediction Panel
- **Current price** vs **Predicted next close** vs **% change**.
- **Confidence bar** — heuristic combining ensemble agreement + model MAPE + change magnitude.
- **Signal badge** — `BUY`, `SELL`, or `HOLD`.
- **Trend** — BULLISH / BEARISH / NEUTRAL.
- **Entry Price / Stop Loss / Take Profit** — appears only when signal is BUY or SELL. Stop and target derived from ATR(14): SL = ±1.5×ATR, TP = ±2.5×ATR. Risk:Reward shown.
- **Score breakdown** — click to expand. Shows how each component (AI forecast, RSI, MACD, Bollinger) contributed to the signal score.
- **7-day forecast** — recursive LSTM line chart, current price → next 7 trading days.
- **Per-model values** — XGBoost vs LSTM individual predictions.

### Technical Indicators Panel
- 12 latest indicator values (SMA 20/50/200, EMA 12/26, RSI 14, MACD line/signal/histogram, Bollinger upper/middle/lower).
- _Technical-only bias_ chip — same engine as AI prediction but **without** the AI forecast input. **The AI Prediction above is the authoritative recommendation.**

### Recent News
- Last 6 articles with sentiment chip (POSITIVE / NEGATIVE / NEUTRAL).

---

## AI Predictions page (`/predictions`)

- **Symbol selector buttons** — click any supported ticker. Green dot = trained, gray = not yet trained.
- **Prediction card** for selected symbol (same as on Stock Details, but standalone).
- **Model Status table** — shows LSTM and XGBoost availability per symbol. **Retrain** button per row (admin gets a working button; regular users get 403).
- **Custom train** — input any valid yfinance ticker and trigger training.
- **Prediction History** — last 20 predictions for the selected symbol with timestamp + signal.

---

## Portfolio (`/portfolio`)

- **Summary** — Total Invested, Current Value, Total Gain/Loss, Today's P/L.
- **Allocation Pie Chart** — value share per holding.
- **Allocation Breakdown** — same data in list form.
- **Holdings table** — qty, buy price, current, value, P/L, P/L%, delete (🗑) button.
- **Add Holding** — form: symbol + quantity + buy price.
- **PDF / CSV** — download buttons in the header.

Live revaluation: every page load refetches current prices from yfinance.

---

## News (`/news`)

- 30 articles aggregated across major tickers.
- **Filter** — ALL / POSITIVE / NEGATIVE / NEUTRAL (VADER-scored).
- Click any card → opens the article in a new tab.

---

## Admin (`/admin`, admin only)

- **System stats** — total/active users, portfolios, predictions logged, models trained.
- **Model Performance table** — per-symbol RMSE / R² / MAPE for both LSTM and XGBoost. **Retrain** kicks off background training.
- **User Management** — toggle active, delete user (and their portfolios).

---

## How to interpret signals — important

The recommendation engine uses **two layers**:

1. **AI Forecast** (LSTM + XGBoost ensemble) — predicts next-day closing price.
2. **Technical filters** — RSI, MACD histogram, Bollinger position.

The unified scoring weighting:

| Factor | Weight |
|---|---|
| AI move > +1.5% / < -1.5% | ±2.5 |
| AI move > +0.3% / < -0.3% | ±1.0 |
| RSI < 30 / > 70 (extreme) | ±1.5 |
| RSI mild bias 30-45 / 55-70 | ±0.5 |
| MACD histogram sign | ±1.0 |
| Price at Bollinger lower / upper | ±1.0 |

Final: `score >= +2.0` → **BUY**, `score <= -2.0` → **SELL**, else **HOLD**.

The Technical Indicators panel shows the **bias from indicators alone** (without the AI forecast). It can disagree with the AI signal — the AI signal is authoritative.

---

## Disclaimer

This is an educational project. **Do not trade real money based on these signals.** Stop-loss / take-profit levels are derived from ATR-based rules of thumb, not from any guaranteed model. Past performance is not predictive of future returns.
