# Installation Guide

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11 (3.13 works locally; 3.11 used in Docker) |
| Node.js | 18+ |
| Docker (optional) | 24+ |

---

## Option 1 — Docker (production-ready)

```bash
git clone <repo>
cd FinSight

cp .env.example .env
# REQUIRED edits to .env:
#   SECRET_KEY    (>=32 chars, used to sign JWTs)
#   ADMIN_API_KEY (anything; used to register admin accounts)

docker-compose up --build -d
docker-compose logs -f
```

Open:
- Frontend: **http://localhost:3000**
- Backend health: http://localhost:8000/health
- API docs: http://localhost:8000/api/docs

### Stop / wipe
```bash
docker-compose down            # stop
docker-compose down -v         # stop + delete DB + models
```

### Volumes
| Volume | Holds |
|---|---|
| `finsight-data` | SQLite DB |
| `finsight-models` | Trained `.keras` + `.pkl` |
| `finsight-logs` | App logs |

---

## Option 2 — Local development

### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

> If TensorFlow install fails on Python 3.13, drop to 3.11.

Create `.env` in `backend/`:
```
SECRET_KEY=dev-secret-change-me-32chars-min
ADMIN_API_KEY=admin-api-key
DATABASE_URL=sqlite:///./finsight.db
DEBUG=true
```

Run:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Optional: edit .env.example → .env if backend is on a non-default host
echo VITE_API_URL=http://localhost:8000 > .env

npm run dev
```

Vite picks the next free port starting at 3000.

---

## First-run: create admin + verify

```bash
# Register admin (replace ADMIN_API_KEY with what you put in .env)
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@finsight.local","password":"admin12345","admin_key":"<ADMIN_API_KEY>"}'

# Login → grab access_token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@finsight.local","password":"admin12345"}'

# Health
curl http://localhost:8000/health
```

Then sign in at the frontend with the same email + password.

---

## Training models for the first time

When you call `GET /api/prediction/AAPL` for the first time, the backend will **auto-train an XGBoost model** for the symbol. Auto-training of LSTM is **not** done by request (too slow). To train LSTM:

```bash
# Inside backend container or with venv active:
python -c "from app.training.train_lstm import train_lstm_for_symbol; train_lstm_for_symbol('AAPL', period='3y', epochs=8)"
python -c "from app.training.train_xgboost import train_xgb_for_symbol; train_xgb_for_symbol('AAPL', period='3y')"
```

Or via Admin UI → click **Retrain** for each symbol.

Trained artifacts:
- `models/trained/lstm_AAPL.keras`
- `models/trained/lstm_AAPL_scalers.pkl`
- `models/trained/lstm_AAPL_meta.pkl`
- `models/trained/xgb_AAPL.pkl`

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `tensorflow` fails to install on Python 3.13 | Use Python 3.11 |
| `bcrypt 4.1+ AttributeError __about__` | `pip install bcrypt==4.0.1` (already pinned in requirements) |
| Frontend 401 loop | Token expired — log out and back in |
| WebSocket reconnects forever | Backend not on port 8000 — set `VITE_API_URL` |
| Yahoo Finance throttling | Wait 30–60s; slow down hard refreshes |
| `predictions` table column error | Drop table once: `python -c "from app.database import engine; from sqlalchemy import text; engine.connect().execute(text('DROP TABLE IF EXISTS predictions'))"` then restart backend |

---

## Reset everything (local)

```bash
# Backend
rm -rf backend/finsight.db backend/models/trained/*

# Frontend
rm -rf frontend/node_modules frontend/dist
npm install
```
