# FinSight — System Architecture

## High-level component diagram

```
                          ┌─────────────────────────────────────┐
                          │              Browser                │
                          │  React 18 + TypeScript + Vite       │
                          │  Tailwind / Recharts /              │
                          │  TradingView Lightweight Charts     │
                          │  Zustand store (auth)               │
                          └────────────┬────────────────────────┘
                                       │ HTTPS
                          ┌────────────┴────────────┐
                          │      REST (Axios)       │  WS (native)
                          ▼                         ▼
              ┌──────────────────────────────────────────┐
              │           FastAPI backend (uvicorn)      │
              │  ─ JWT middleware (HS256, bcrypt)        │
              │  ─ CORS / GZip                           │
              │  ─ SQLAlchemy ORM                        │
              │  ─ WebSocket (/ws/market)                │
              └─┬───────────┬───────────┬───────────┬────┘
                │           │           │           │
       ┌────────▼──┐ ┌──────▼─────┐ ┌───▼─────┐ ┌───▼──────┐
       │ SQLite DB │ │ ML services│ │ yfinance│ │ TextLib  │
       │ users,    │ │ LSTM/XGB   │ │ (HTTPS) │ │ VADER +  │
       │ portfolio,│ │ predictor  │ │         │ │ keywords │
       │ predict.  │ │ + indicat. │ │         │ │          │
       └───────────┘ └────────────┘ └─────────┘ └──────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │ Trained model artifacts  │
              │  ─ lstm_<SYM>.keras       │
              │  ─ lstm_<SYM>_scalers.pkl │
              │  ─ xgb_<SYM>.pkl          │
              │  ─ *_meta.pkl             │
              └──────────────────────────┘
```

---

## Request flow examples

### 1. Authenticated stock prediction

```
Browser  ─►  POST /api/auth/login     →  JWT (access + refresh)
        ◄─  200
Browser  ─►  GET /api/prediction/AAPL  Authorization: Bearer <token>
   FastAPI
     ├─ security.get_optional_user(token) ─► User row
     ├─ prediction_service.predict_stock("AAPL")
     │    ├─ market_data_service.get_stock_quote        ─► yfinance HTTPS
     │    ├─ dataset_builder.build_dataset              ─► yfinance + pandas_ta
     │    ├─ load_xgb / load_lstm                       ─► disk
     │    ├─ _recursive_lstm_forecast (7 days)
     │    ├─ _unified_signal (weighted: AI/RSI/MACD/BB)
     │    └─ _compute_levels (EP / SL / TP from ATR)
     ├─ Persist row to predictions table
     └─ Return JSON
        ◄─  200 { signal, EP/SL/TP, forecast_7day, ... }
```

### 2. Live ticker over WebSocket

```
Browser  ─►  ws://host/ws/market?symbols=AAPL,MSFT&interval=5
  FastAPI accepts, manager.connect()
  Loop:
    asyncio.to_thread(fetch_quotes_blocking)  ─► yfinance HTTPS
    ws.send_json({type: "quote_update", quotes: [...]})
    await asyncio.sleep(interval)
```

---

## Backend module layout

```
app/
├── api/                  ◄── HTTP/WS routers
│   ├── auth_new.py       (register, login, refresh, me, logout)
│   ├── stocks.py         (quote, history, search, indicators)
│   ├── market_new.py     (summary, trending, gainers, losers, status)
│   ├── news_new.py       (general + per-symbol news with VADER)
│   ├── portfolio_new.py  (holdings CRUD; AUTH REQUIRED)
│   ├── prediction.py     (AI predict + history + train; auth-aware)
│   ├── reports.py        (PDF/CSV downloads)
│   ├── admin_new.py      (users, model metrics, retrain; ADMIN ONLY)
│   └── ws.py             (WebSocket market stream)
│
├── services/             ◄── business logic
│   ├── market_data_service.py     (yfinance wrapper)
│   ├── indicators_service.py      (pandas-ta + unified signal)
│   ├── news_service.py            (yfinance news + VADER+keywords)
│   ├── portfolio_service.py       (DB + live revaluation)
│   ├── prediction_service.py      (ensemble + signal + EP/SL/TP)
│   └── reports_service.py         (ReportLab PDF + CSV)
│
├── ml/                   ◄── pure model code
│   ├── lstm_model.py     (Keras architecture + I/O)
│   └── xgboost_model.py  (XGBRegressor + I/O)
│
├── training/             ◄── offline training scripts
│   ├── dataset_builder.py  (20 features, MinMaxScaler, sequences)
│   ├── train_lstm.py
│   ├── train_xgboost.py
│   └── evaluate.py
│
├── security.py           (JWT, bcrypt, OAuth2PasswordBearer deps)
├── database.py           (SQLAlchemy models + init)
├── config.py             (Pydantic settings)
└── main.py               (FastAPI app + router wiring)
```

---

## Database schema

```
users
─────────────────────
id (PK)
username, email (unique, indexed)
hashed_password    bcrypt
first_name, last_name
is_active, is_admin
subscription_tier
created_at, updated_at, last_login

portfolios
─────────────────────
id (PK)
user_id (FK → users)
name, description
initial_investment, current_value
total_gain_loss, total_gain_loss_percent
is_default
created_at, updated_at

portfolio_stocks
─────────────────────
id (PK)
portfolio_id (FK)
symbol
quantity, purchase_price
purchase_date, current_price, current_value
gain_loss, gain_loss_percent
notes, created_at, updated_at

predictions
─────────────────────
id (PK)
user_id           ◄── nullable; set if authenticated request
symbol
current_price
predicted_price
change_percent
confidence_score
signal             BUY|SELL|HOLD
trend_direction    BULLISH|BEARISH|NEUTRAL
model_predictions  JSON  { "lstm": 287, "xgb": 265 }
models_used        JSON  ["xgb", "lstm"]
forecast_7day      JSON  [{ day, date, price }]
created_at, updated_at
```

Tables `news`, `technical_indicators`, `stock_data`, `audit_logs`, `model_metrics` exist but are mainly used as caches/logs (most real reads come live from yfinance for freshness).

---

## ML pipeline

```
yfinance.history(symbol, "3y")
   │
   ▼
dataset_builder.engineer_features
   ├─ Price:      open, high, low, close, volume, daily_return
   ├─ Trend:      SMA 20/50, EMA 20/50
   ├─ Momentum:   RSI 14, MACD line/signal/histogram
   ├─ Volatility: Bollinger upper/middle/lower, ATR 14, volatility_20
   └─ Strength:   trend_strength (close / SMA 50)
   │
   ▼
dataset_builder.clean_dataset      (dedupe, drop NaN, clip 1%/99% IQR returns)
   │
   ┌─────────────────┴─────────────────┐
   ▼                                   ▼
XGBoost path                       LSTM path
build_xy_supervised                MinMaxScaler features + target
   │                                   │
MinMaxScaler X                     build_sequences (seq_len=60)
   │                                   │
80/20 chronological split          80/20 chronological split
   │                                   │
XGBRegressor.fit                   Keras LSTM(128 → 64 → 32 → 1)
   │                                   │
joblib.dump → xgb_<SYM>.pkl        model.save → lstm_<SYM>.keras
                                   joblib.dump → lstm_<SYM>_scalers.pkl
                                   joblib.dump → lstm_<SYM>_meta.pkl
```

### Inference

```
build_dataset(symbol, "1y")
   │
   ▼
Get last row → XGBoost prediction
Get last 60 rows → LSTM single-step prediction
                 → recursive 7-day forecast (shift window, replace close)
   │
   ▼
ensemble = mean([xgb, lstm])
confidence = 100 - penalties (MAPE, change magnitude, disagreement)
   │
   ▼
_unified_signal(current, ensemble, RSI, MACD-hist, Bollinger)
  → score = AI(±2.5) + RSI(±1.5) + MACD(±1.0) + BB(±1.0)
  → BUY if ≥+2.0, SELL if ≤-2.0, else HOLD
   │
   ▼
_compute_levels(current, signal, ATR)
  EP = current
  SL = current ± 1.5*ATR
  TP = current ± 2.5*ATR
```

---

## Frontend layout

```
src/
├── App.tsx                     ◄── BrowserRouter + protected/admin layouts
├── main.tsx
│
├── pages/
│   ├── auth/Login.tsx          (email + password)
│   ├── auth/Register.tsx       (+ admin_key field)
│   ├── Dashboard.tsx
│   ├── StockDetails.tsx
│   ├── Predictions.tsx
│   ├── Portfolio.tsx
│   ├── News.tsx
│   ├── Admin.tsx               (admin-only)
│   └── Settings.tsx
│
├── components/
│   ├── SearchBar.tsx           (debounced symbol search)
│   ├── LiveTicker.tsx          (WS consumer)
│   ├── charts/
│   │   ├── PriceChart.tsx          (Recharts area)
│   │   ├── VolumeChart.tsx         (Recharts bar)
│   │   ├── PortfolioChart.tsx      (Recharts pie)
│   │   └── CandlestickChart.tsx    (TradingView Lightweight Charts)
│   └── Prediction/
│       ├── PredictionCard.tsx
│       ├── ConfidenceMeter.tsx
│       ├── SignalBadge.tsx
│       ├── ForecastChart.tsx       (7-day line)
│       └── AIOutlook.tsx           (dashboard widget)
│
├── services/                   ◄── typed Axios clients
│   ├── api.ts                  (interceptors, WS_BASE)
│   ├── authService.ts
│   ├── stockService.ts
│   ├── dashboardService.ts
│   ├── portfolioService.ts
│   ├── predictionService.ts
│   ├── newsService.ts
│   └── adminService.ts
│
├── hooks/
│   └── useLiveQuotes.ts        (WebSocket hook with auto-reconnect)
│
└── store/
    └── authStore.ts            (Zustand: user, token, bootstrap)
```

---

## Deployment

### docker-compose.yml

```
backend container
  ├─ python:3.11-slim
  ├─ /opt/venv     (built in builder stage)
  ├─ /app/data     ◄── finsight-data volume   (SQLite db)
  ├─ /app/models   ◄── finsight-models volume (.keras + .pkl)
  └─ /app/logs     ◄── finsight-logs volume
  exposes 8000

frontend container
  ├─ nginx:1.27-alpine
  ├─ /usr/share/nginx/html (built dist/)
  └─ nginx.conf with SPA fallback + asset caching
  exposes 80 → host 3000

Networking: shared bridge network; frontend container references backend
            via the externally-published API URL (build arg VITE_API_URL).
```

### Production hardening checklist (not all done — this is a demo)

| Item | Status |
|---|---|
| HTTPS (TLS termination at reverse proxy) | Not done — add nginx-proxy or Caddy |
| Secrets management | Currently env vars in `.env`. Replace with Docker secrets / Vault in real prod. |
| Postgres in place of SQLite | Easy swap (just change `DATABASE_URL`). |
| Rate limiting on auth endpoints | Not done |
| Refresh-token rotation / revocation list | Not done — stateless JWT only |
| WAF / origin firewall | Not done |
| Observability (Prometheus / Sentry) | Not wired |

---

## Critical paths

| Concern | Where handled |
|---|---|
| Password hashing | `security.py` bcrypt v4.0.1 (pinned for compat) |
| Token signing | `security.py` HS256, secret from `SECRET_KEY` env |
| User isolation in portfolios | `portfolio_service.py` filters by `user_id` from JWT |
| ML model isolation | One pair of `.keras` + `.pkl` per symbol, no cross-talk |
| WebSocket fault tolerance | Frontend reconnects every 3s; backend handles disconnect gracefully |
| yfinance throttling | Each request hits live API; consider Redis cache layer for scale |

---

## What this architecture is good for

- Final-year project demo
- Portfolio piece (full-stack + ML + WebSocket + Docker)
- Educational reference

## What it is NOT

- A real trading system
- A high-frequency data platform
- Multi-tenant SaaS without further hardening
