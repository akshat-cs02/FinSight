# FinSight

> AI-powered stock market analytics & prediction platform with real-time data, ML predictions, and portfolio management.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.21-FF6F00?style=flat&logo=tensorflow&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Live-brightgreen)

---

## What it does

| Feature | Description |
|---|---|
| **Live Market Data** | Real-time quotes, history, indices, gainers/losers via Yahoo Finance |
| **AI Predictions** | Ensemble of LSTM (60-day sequence) + XGBoost with confidence scores |
| **7-Day Forecast** | Recursive LSTM-based price prediction |
| **Portfolio Tracking** | Add holdings, live P/L, allocation charts, rebalancing suggestions |
| **Technical Indicators** | SMA, EMA, RSI, MACD, Bollinger Bands, ATR, VWAP, Stochastic RSI |
| **News + Sentiment** | Financial news scored by TextBlob (Positive / Negative / Neutral) |
| **WebSocket Live Ticker** | Pushed quotes every 3–60 seconds |
| **PDF/CSV Reports** | Portfolio summary + per-stock analysis export |
| **Admin Dashboard** | Model metrics (RMSE/R²/MAPE), retrain controls, user management |
| **JWT Auth** | Access + refresh tokens, bcrypt passwords, role-based access |

---

## Tech Stack

```
Frontend  → React 18, TypeScript, Vite, Tailwind CSS, Recharts, Zustand
Backend   → FastAPI, SQLAlchemy, Pydantic v2, JWT Auth
Database  → SQLite (default) / MongoDB (optional)
ML/AI     → TensorFlow LSTM, XGBoost, scikit-learn, pandas-ta
Data      → Yahoo Finance (yfinance), TextBlob sentiment
Deploy    → Docker, docker-compose, Nginx
```

---

## Getting Started

### Docker (Recommended)

```bash
git clone https://github.com/akshat-cs02/FinSight.git
cd FinSight

cp .env.example .env
# Edit .env → set SECRET_KEY (32+ chars) and ADMIN_API_KEY

docker-compose up --build -d
```

### Local Development

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8888

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

---

## First-Time Setup

1. Open the app in your browser
2. Click **Register**
3. Enter email, password, and sign up
4. Sign in — you're in!

> To create an admin account, set `ADMIN_API_KEY` in `.env` and include it during registration.

---

## Project Structure

```
FinSight/
├── backend/
│   ├── app/
│   │   ├── api/              ← FastAPI route handlers
│   │   ├── services/         ← Business logic (market, signals, news)
│   │   ├── ml/               ← LSTM + XGBoost inference
│   │   ├── training/         ← Dataset builder, train scripts
│   │   ├── security.py       ← JWT + password hashing
│   │   └── main.py           ← App entrypoint
│   ├── models/trained/       ← Saved .keras + .pkl models
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/            ← Route-level screens
│   │   ├── components/       ← Charts, cards, prediction UI
│   │   ├── services/         ← Axios API clients
│   │   ├── store/            ← Zustand auth state
│   │   └── App.tsx
│   └── package.json
│
├── docker-compose.yml
├── LICENSE                   ← MIT
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT tokens |
| GET | `/api/stocks/{symbol}` | Stock quote + info |
| GET | `/api/prediction/{symbol}` | AI prediction + signal |
| GET | `/api/portfolio` | User portfolio |
| GET | `/api/news` | Market news + sentiment |
| GET | `/api/signals` | Trading signals |
| GET | `/health` | Health check |

> Full API docs available at `/api/docs` (Swagger UI).

---

## ML Pipeline

```
Market Data (yfinance)
    ↓
Feature Engineering (SMA, EMA, RSI, MACD, Volume...)
    ↓
┌─────────────┐    ┌──────────────┐
│  LSTM Model │    │  XGBoost     │
│  (60-day)   │    │  (features)  │
└──────┬──────┘    └──────┬───────┘
       └────────┬─────────┘
           Ensemble
              ↓
     BUY / SELL / HOLD + Confidence
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.
