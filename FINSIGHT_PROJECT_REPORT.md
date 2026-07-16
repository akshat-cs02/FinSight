# FinSight — AI-Powered Stock Analytics Platform
### Project Report · June 2026

---

## Executive Summary

FinSight is a full-stack AI-powered financial analytics platform built for retail and professional traders. It combines a **Python FastAPI backend**, a **React/TypeScript frontend**, and a **dual-model ML ensemble (LSTM + XGBoost)** to deliver real-time stock quotes, predictive price targets, ICT/SMC intraday trading signals, backtesting, portfolio tracking, and live news sentiment — all in a single dark-themed web application.

The platform supports **global multi-asset coverage**: US equities, Indian stocks (NSE/BSE), Forex pairs, Cryptocurrencies, and Commodity ETFs — with intelligent symbol resolution and live TradingView charts embedded for every asset.

---

## Platform Overview

| Attribute          | Detail                                             |
|--------------------|----------------------------------------------------|
| **Type**           | Full-stack web application                         |
| **Frontend**       | React 18 + TypeScript + Vite + Tailwind CSS        |
| **Backend**        | Python 3.11 + FastAPI + SQLAlchemy + SQLite        |
| **ML Models**      | LSTM (Keras/TensorFlow) + XGBoost ensemble         |
| **Auth**           | JWT + 30-day refresh tokens                        |
| **Charts**         | TradingView iframe embed (full drawing tools)      |
| **Data Sources**   | Yahoo Finance (OHLCV) + TradingView Symbol Search  |
| **Deployment**     | Local dev: Vite (port 5173) + Uvicorn (port 8888)  |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React/TypeScript)                  │
│                                                                  │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │Dashboard │  │StockDetail │  │  Backtesting  │  │Portfolio │  │
│  └──────────┘  └────────────┘  └──────────────┘  └──────────┘  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  SearchBar (TradingView-powered, market filter chips)     │   │
│  └───────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  TradingViewWidget (iframe embed — full chart, intraday)  │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API (port 8888)
┌──────────────────────────────▼──────────────────────────────────┐
│                     BACKEND (FastAPI / Python)                   │
│                                                                  │
│  Routes:  /api/stocks  /api/predictions  /api/backtest          │
│           /api/portfolio  /api/news  /api/reports  /api/auth     │
│                                                                  │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ MarketData Svc │  │ Prediction Svc   │  │ Backtesting Svc │  │
│  │ Yahoo Finance  │  │ LSTM + XGBoost   │  │ 8 ICT Strategies│  │
│  │ TV Symbol API  │  │ Ensemble blend   │  │ ATR-based SL/TP │  │
│  └────────────────┘  └──────────────────┘  └─────────────────┘  │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │ Portfolio Svc  │  │  News Svc        │  │  Reports Svc    │  │
│  │ SQLite DB      │  │  Sentiment NLP   │  │  PDF + CSV      │  │
│  └────────────────┘  └──────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### 1. Global Symbol Search
- Powered by **TradingView's symbol search API** — returns any exchange-listed symbol worldwide
- Market filter chips: 🇺🇸 US · 🇮🇳 India · ₿ Crypto · 💱 Forex · 🇪🇺 Europe · 🏗️ Commodities
- **India coverage**: Full Nifty 50, BankNifty constituents, IPO stocks (Eternal/Zomato, Paytm, Nykaa, LIC, JioFin, Ola Electric), and indices (^NSEI, ^BSESN, ^NSEBANK)
- Intelligent symbol resolution: `RELIANCE` → `RELIANCE.NS`, `NSE:RELIANCE` → `RELIANCE.NS`
- Falls back gracefully to Yahoo Finance and direct `.NS`/`.BO` probing

### 2. Stock Detail Page
- Real-time quote: price, change %, open/high/low, volume, 52-week range, market cap, P/E
- **TradingView iframe chart** — full drawing tools, all built-in indicators, RSI + MACD pre-loaded, 15-minute default interval
- Auto-decimal price formatting: forex shows `1.13045` not `1.13`, crypto shows 8 decimals
- Currency detection from yfinance metadata (INR for `.NS`, GBP for `.L`, etc.)
- **Chart-only graceful fallback** for spot symbols (XAUUSD, USOIL) — shows live TV chart even when Yahoo has no data
- Add to Portfolio, PDF Report, CSV Data export buttons

### 3. AI Price Prediction (LSTM + XGBoost Ensemble)
- **LSTM** (Keras/TensorFlow): 60-bar sequence model trained per symbol
- **XGBoost**: gradient-boosted regressor on 20+ technical features (RSI, MACD, Bollinger, EMA, ATR, volume ratios)
- **MAPE-weighted ensemble**: model with lower Mean Absolute Percentage Error contributes more
- **15% outlier clipping**: prevents extreme outliers from corrupting predictions
- Signal rules:
  - `BUY` → predicted > current AND RSI < 70
  - `SELL` → predicted < current
  - `HOLD` → otherwise
- Supported across 20 symbols: US large-cap, Indian blue chips, Crypto, Forex
- Auto-trains on first request if no model exists on disk

### 4. ICT/SMC Intraday Signal Engine
8 professional Smart Money Concepts strategies implemented:

| Strategy           | Description                                          |
|--------------------|------------------------------------------------------|
| `BOS_FVG`          | Break of Structure + Fair Value Gap (trend continuation) |
| `CHOCH_FVG`        | Change of Character + FVG (reversal entry)            |
| `MSS_OrderBlock`   | Market Structure Shift + Order Block (high-confidence) |
| `LiqSweep_FVG`     | Liquidity Sweep + FVG (stop-hunt reversal)            |
| `SR_Bounce`        | Support/Resistance swing-level bounce                 |
| `RSI_OTE`          | RSI in Optimal Trade Entry zone (62–79% retracement)  |
| `PriceAction`      | Engulfing/Hammer/Shooting-Star + trend filter         |
| `MA_FVG`           | EMA 21/55 crossover + FVG confirmation                |

**Intraday discipline enforced:**
- Only `15m`, `30m`, `1h` intervals — `1d` removed entirely
- All positions open AND close within the same session (EOD exit at 15:55)
- No overnight holds

Each signal includes: entry price, stop-loss (1.5× ATR), take-profit (2.5× ATR), Sharpe ratio, win rate, total return.

**News filter**: signals within ±30 min of a high/medium impact economic event are automatically skipped.

### 5. Backtesting Engine
- Run any of the 8 ICT strategies on any symbol, any interval (15m/30m/1h)
- Period options: 1 month, 3 months, 6 months, 1 year
- Performance metrics: Total Return, Sharpe Ratio (annualized for intraday), Max Drawdown, Win Rate, Total Trades
- **Leaderboard mode**: run all 8 strategies simultaneously and rank by Sharpe
- Quick-pick symbols: AAPL, MSFT, NVDA, TSLA, BTC-USD, ETH-USD, EURUSD=X, RELIANCE.NS, and more

### 6. Paper Trading (Demo Portfolio)
- localStorage-based simulated portfolio — no real money
- Pre-fill with ICT signal entry, SL, TP by clicking "Use This Signal" in ICT section
- Track open positions, P&L, realized gains
- Persists across browser sessions

### 7. Portfolio Tracker
- JWT-authenticated real portfolio (SQLite backend)
- Add holdings with symbol, quantity, purchase price
- Live P&L calculation against current quote
- Market value, gain/loss, percentage return per holding

### 8. Market News + Sentiment
- Per-symbol news feed with sentiment classification (POSITIVE / NEGATIVE / NEUTRAL)
- NLP-based sentiment scoring on article summaries
- Recent articles from financial news sources

### 9. Reports
- **PDF Report**: full stock analysis export (price, indicators, historical data)
- **CSV Export**: 1-year OHLCV data download per symbol

### 10. Technical Indicators Panel
- RSI, MACD, Bollinger Bands, EMA values computed server-side
- Technical-only signal (BUY/SELL/HOLD) as secondary reference
- Note displayed: "AI Prediction above is authoritative — it combines these with LSTM+XGBoost"

---

## Tech Stack

### Backend
| Component        | Technology                          |
|------------------|-------------------------------------|
| Framework        | FastAPI 0.110                       |
| Language         | Python 3.11                         |
| Database         | SQLite via SQLAlchemy               |
| Auth             | JWT (python-jose) + bcrypt          |
| ML               | TensorFlow/Keras (LSTM), XGBoost    |
| Data             | yfinance, pandas, numpy             |
| Symbol Search    | TradingView symbol-search API       |
| PDF Generation   | ReportLab / WeasyPrint              |
| Server           | Uvicorn (ASGI)                      |

### Frontend
| Component        | Technology                          |
|------------------|-------------------------------------|
| Framework        | React 18 + TypeScript               |
| Build Tool       | Vite (esbuild minification)         |
| Styling          | Tailwind CSS                        |
| Charts           | TradingView Embed (iframe)          |
| Icons            | Lucide React                        |
| HTTP Client      | Axios                               |
| Routing          | React Router v6                     |
| Notifications    | react-hot-toast                     |

---

## API Endpoints (17 Routes)

| Method | Endpoint                              | Description                         |
|--------|---------------------------------------|-------------------------------------|
| POST   | `/api/auth/login`                     | JWT login                           |
| POST   | `/api/auth/register`                  | New user registration               |
| GET    | `/api/stocks/{symbol}/quote`          | Live quote (price, change, meta)    |
| GET    | `/api/stocks/{symbol}/history`        | OHLCV historical data               |
| GET    | `/api/stocks/{symbol}/indicators`     | RSI, MACD, Bollinger, EMA           |
| GET    | `/api/stocks/search`                  | TradingView-powered symbol search   |
| GET    | `/api/predictions/{symbol}`           | LSTM+XGBoost price prediction       |
| GET    | `/api/backtest/{symbol}`              | Single ICT strategy backtest        |
| GET    | `/api/backtest/{symbol}/all`          | All 8 strategies leaderboard        |
| GET    | `/api/backtest/{symbol}/live_signal`  | Current intraday signal from strategy |
| GET    | `/api/portfolio`                      | User's holdings (authenticated)     |
| POST   | `/api/portfolio`                      | Add holding                         |
| DELETE | `/api/portfolio/{id}`                 | Remove holding                      |
| GET    | `/api/news/{symbol}`                  | News + sentiment for symbol         |
| GET    | `/api/reports/stock/{symbol}/pdf`     | Download PDF report                 |
| GET    | `/api/reports/stock/{symbol}/csv`     | Download CSV data                   |
| GET    | `/api/admin/users`                    | Admin: list users                   |

---

## Market Coverage

### India (NSE/BSE)
**Nifty 50**: RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK, HINDUNILVR, ITC, BAJFINANCE, KOTAKBANK, LT, AXISBANK, SBIN, ASIANPAINT, MARUTI, TITAN, WIPRO, NESTLEIND, ULTRACEMCO, TECHM, POWERGRID, NTPC, SUNPHARMA, TATAMOTORS, JSWSTEEL, ADANIENT, ADANIPORTS, ONGC, COALINDIA, DIVISLAB, CIPLA, APOLLOHOSP, BAJAJFINSV, BRITANNIA, DRREDDY, EICHERMOT, GRASIM, HCLTECH, INDUSINDBK, HINDALCO, MM, TATASTEEL, VEDL, UPL, BPCL, IOC, TATACONSUM, SHREECEM, HEROMOTOCO, BAJAJ-AUTO

**BankNifty**: HDFCBANK, ICICIBANK, KOTAKBANK, AXISBANK, SBIN, INDUSINDBK, BANDHANBNK, FEDERALBNK, IDFCFIRSTB, PNB, CANBK

**High Market-Cap / IPOs**: ETERNAL (Zomato), PAYTM, NYKAA, LIC, JIOFIN, OLAELEC, DMART, TRENT, POLYCAB, ZOMATO

**Indices**: ^NSEI (Nifty 50), ^BSESN (Sensex), ^NSEBANK (BankNifty)

### Global Markets
- **US**: AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, NFLX, JPM, GS, BAC, V, MA, and more
- **Crypto**: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX (via Binance on TradingView)
- **Forex**: EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD, USD/INR, EUR/JPY, and more
- **Commodities (ETF spot-proxies)**: GLD (Gold), SLV (Silver), USO (Crude Oil), UNG (Natural Gas), CPER (Copper), PPLT (Platinum), WEAT (Wheat), CORN (Corn)
- **Europe**: DAX (XETR), CAC 40 (EURONEXT), FTSE (LSE) — via TradingView search

---

## How to Run Locally

### Prerequisites
- Python 3.11+
- Node.js 18+

### Backend
```bash
cd Downloads/FinSight/backend
venv/Scripts/activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --port 8888 --reload
```

### Frontend
```bash
cd Downloads/FinSight/frontend
npm install
npm run dev                    # Starts on http://localhost:5173
```

### Environment
`frontend/.env`:
```
VITE_API_URL=http://localhost:8888
```

`backend/.env`:
```
SECRET_KEY=your-secret-key
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

---

## Build Status

| Component      | Status      | Details                                              |
|----------------|-------------|------------------------------------------------------|
| Frontend build | **PASSING** | 2,262 modules · 796 KB bundle (222 KB gzipped)       |
| Backend import | **PASSING** | All 40 modules import cleanly · 17 routes registered |
| Symbol search  | **PASSING** | Tested: adani, reliance, btc, tesla, eurusd, xauusd, irctc, nykaa, lic, eternal |
| ICT backtesting| **PASSING** | 8 strategies · 15m/30m/1h intervals · EOD exit |
| ML predictions | **PASSING** | LSTM+XGBoost ensemble · 20 supported symbols |
| Auth flow      | **PASSING** | JWT 30-day tokens + refresh fallback |

---

## Key Design Decisions

1. **TradingView iframe over custom chart library** — iframe is not blockable by ad blockers the way the tv.js script approach is; shows full professional charting with all indicators and drawing tools
2. **Yahoo Finance for OHLCV, TradingView for search** — TV's symbol search has better global coverage (finds IRCTC, ETERNAL, any NSE stock); Yahoo provides clean OHLCV for ML training
3. **Spot-only commodities** — no futures-as-spot fake mapping; spot symbols (XAUUSD, USOIL) show TradingView chart, ETF proxies (GLD, USO) used for Yahoo quotes
4. **Intraday-only ICT** — ICT/SMC strategies are mathematically designed for same-session trades; `1d` interval removed to prevent multi-week "intraday" holds
5. **MAPE-weighted ensemble** — the model with lower error on validation automatically gets more weight; no static 50/50 split

---

## Potential Next Steps

- Add real-time WebSocket price streaming (endpoint exists at `/api/ws`)
- Expand ML training universe to all Nifty 50 symbols
- Universe leaderboard: cross-asset strategy ranking (which ICT strategy works best across all 35+ assets)
- Mobile-responsive layout optimization
- Broker integration (Zerodha Kite API / Alpaca for US) for live order routing

---

*Report generated: June 2026 | Platform: FinSight v1.0 | Stack: FastAPI + React + LSTM + XGBoost*
