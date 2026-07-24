# FinSight

> **Live**: [fin-sight-blush.vercel.app](https://fin-sight-blush.vercel.app)

Real-time market analysis + AI predictions. Fuses ICT/SMC structure with an LSTM+XGBoost ensemble — entry, target, and confidence in plain numbers.

---

## Quick peek

| What | Link |
|------|------|
| **Dashboard** | `/dashboard` — live signals, portfolio, predictions |
| **Sign in / Register** | `/login` or `/register` — auth panel on the landing page |
| **Guest access** | Click "Continue as guest" — no account needed |
| **API docs** | `finsight-backend-mnn6.onrender.com/api/docs` |

---

## Stack

**Frontend** — React 18, TypeScript, Vite, Tailwind CSS, GSAP, Lightweight Charts, Zustand  
**Backend** — Python FastAPI, SQLAlchemy, JWT + httpOnly cookies  
**Database** — PostgreSQL (Neon serverless)  
**ML** — TensorFlow LSTM, XGBoost, scikit-learn  
**Hosting** — Vercel (frontend), Render (backend), Neon (DB)  

---

## Local dev

```bash
git clone https://github.com/akshat-cs02/FinSight.git
cd FinSight

# Backend
cd backend
python -m venv venv
venv\Scripts\activate     # Windows
pip install -r requirements.txt
cp .env.example .env      # set DATABASE_URL, SECRET_KEY, etc.
uvicorn app.main:app --reload --port 8888

# Frontend (new terminal)
cd frontend
npm install
npm run dev               # opens on localhost:3000
```

---

## Project layout

```
FinSight/
├── backend/app/
│   ├── api/           route handlers
│   ├── services/      market, signals, news logic
│   ├── ml/            LSTM + XGBoost inference
│   ├── training/      dataset builder + training scripts
│   ├── database.py    models + init
│   └── main.py        entrypoint
├── frontend/
│   ├── src/pages/     route-level screens
│   ├── src/components/  charts, cards, auth UI
│   ├── src/services/  axios api clients
│   ├── src/store/     zustand auth state
│   ├── public/
│   │   └── landing.html   static landing page
│   └── package.json
├── vercel.json        rewrites for SPA + API proxy
└── README.md
```

---

## API endpoints (key ones)

| Method | Path | What |
|--------|------|------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Current user |
| GET | `/api/stocks/{symbol}` | Quote + info |
| GET | `/api/prediction/{symbol}` | AI prediction |
| GET | `/api/portfolio` | Holdings |
| GET | `/api/signals` | ICT/SMC signals |
| GET | `/api/news` | Market news + sentiment |
| GET | `/health` | Backend health check |

Swagger docs at `/api/docs` when the backend is running.

---

## ML pipeline

```
yfinance
   ↓
feature engineering (SMA, EMA, RSI, MACD, volume, ...)
   ↓
┌──────────┐   ┌──────────┐
│  LSTM    │   │ XGBoost  │
│ (60-day) │   │ (feats)  │
└────┬─────┘   └────┬─────┘
     └──────┬───────┘
         ensemble
            ↓
    BUY / SELL / confidence %
```

---

## Notes

- Render free tier spins down after inactivity — first request after a gap takes ~30s to wake up.
- Guest mode uses a local guest user — full features available without signing up.
- All API auth uses httpOnly cookies (no localStorage tokens).
