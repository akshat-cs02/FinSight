# FinSight — AI-Based Stock Market Analytics & Prediction Platform

Full-stack platform combining live market data, technical analysis, news sentiment, and an LSTM + XGBoost AI prediction engine.

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind, Recharts, Zustand, Axios, WebSocket |
| Backend | FastAPI, SQLAlchemy, JWT, Pydantic v2 |
| Data | Yahoo Finance (`yfinance`), pandas-ta |
| ML | TensorFlow 2.21 LSTM, XGBoost 3.3, scikit-learn |
| Sentiment | TextBlob |
| Reports | ReportLab (PDF), CSV |
| Deploy | Docker, docker-compose, nginx |

---

## Features

- **Live market data** — quotes, history, indices, gainers/losers, search (yfinance)
- **Portfolio management** — add/delete/update holdings with live revaluation, P/L, allocation pie chart
- **Technical indicators** — SMA, EMA, RSI, MACD, Bollinger Bands, ATR, VWAP, Stochastic RSI
- **News + sentiment** — yfinance news scored by TextBlob into POSITIVE / NEGATIVE / NEUTRAL
- **AI predictions** — ensemble of LSTM (60-day sequence) + XGBoost; confidence + BUY/SELL/HOLD signal
- **7-day forecast** — recursive LSTM prediction
- **WebSocket live ticker** — pushed quotes every 3–60s
- **Reports** — PDF and CSV for portfolio + per-stock analysis
- **Auth** — JWT (access + refresh), bcrypt-hashed passwords, admin role gated by registration key
- **Admin ML dashboard** — model metrics (RMSE / R² / MAPE), retrain controls, user management

---

## Quick start

### Option A — Docker (recommended)

```bash
cp .env.example .env
# Edit .env and set SECRET_KEY + ADMIN_API_KEY
docker-compose up --build -d
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8000
- API docs: http://localhost:8000/api/docs

### Option B — Local dev

See [INSTALLATION.md](INSTALLATION.md).

```bash
# Terminal 1: Backend
cd backend
python -m venv venv
venv\Scripts\activate         # Windows
# source venv/bin/activate    # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

---

## Documentation

- [`INSTALLATION.md`](INSTALLATION.md) — full local + Docker setup
- [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md) — every REST endpoint + WebSocket
- [`USER_MANUAL.md`](USER_MANUAL.md) — feature walkthrough
- [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) — components, data flow, ML pipeline

---

## Repo layout

```
FinSight/
├── backend/
│   ├── app/
│   │   ├── api/                  # FastAPI routers
│   │   ├── services/             # Business logic
│   │   ├── ml/                   # LSTM + XGBoost model code
│   │   ├── training/             # Dataset builder, train scripts, eval
│   │   ├── database.py
│   │   ├── security.py           # JWT
│   │   └── main.py
│   ├── models/trained/           # Saved models (.keras + .pkl)
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/                # Route-level screens
│   │   ├── components/           # UI + Prediction + charts
│   │   ├── services/             # Typed Axios clients
│   │   ├── hooks/                # useLiveQuotes
│   │   ├── store/                # Zustand auth
│   │   └── App.tsx
│   ├── nginx.conf
│   └── Dockerfile
│
├── docker-compose.yml
└── .env.example
```

---

## Honest scope

This codebase is wired end-to-end with **real** Yahoo Finance data, **trained** ML models, and **persisted** predictions. It is suitable for demo / final-year project / portfolio.

It is **not** intended as financial advice or for production trading. Signals are heuristic and short historical windows. Don't trade real money on it.

License: MIT.
