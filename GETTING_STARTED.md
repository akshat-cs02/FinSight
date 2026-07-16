# FinSight - Getting Started Guide

Quick start guide to run FinSight locally within 10 minutes.

## 🚀 Start in 3 Steps

### Step 1: Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```
✅ Backend running at: http://localhost:8000

### Step 2: Frontend Setup (new terminal)
```bash
cd frontend
npm install
npm run dev
```
✅ Frontend running at: http://localhost:3000

### Step 3: Login
- Open http://localhost:3000
- Use any email/password to test
- Start exploring!

---

## 📦 With Docker (Easiest)
```bash
docker-compose up --build
```
Then open http://localhost:3000

---

## 📁 Project Structure

```
FinSight/
├── backend/                 # FastAPI server
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── models/         # Database models
│   │   ├── schemas.py      # Pydantic validators
│   │   └── main.py         # FastAPI app
│   ├── models/             # ML models
│   └── requirements.txt
│
├── frontend/               # React.js app
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # UI components
│   │   ├── services/      # API client
│   │   ├── store/         # State management
│   │   └── App.tsx        # Root component
│   └── package.json
│
├── models/                # ML models & utilities
├── docs/                  # Documentation
└── README.md             # Full documentation
```

---

## 🎯 Key Features to Try

1. **Dashboard** - Portfolio overview & market status
2. **Stock Search** - Search any symbol (AAPL, TSLA, etc.)
3. **Predictions** - AI price forecasts with confidence
4. **Portfolio** - Track your investments
5. **News** - Financial news with sentiment analysis
6. **Technical Analysis** - 15+ indicators

---

## 🔑 Environment Variables

### Backend (.env)
```
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./finsight.db
DEBUG=True
NEWSAPI_KEY=get-from-newsapi.org
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
VITE_API_TIMEOUT=30000
```

---

## 🐛 Troubleshooting

**Port 8000/3000 in use?**
```bash
# Find process
lsof -i :8000
# Kill it
kill -9 <PID>
```

**Missing dependencies?**
```bash
# Backend
pip install --force-reinstall -r requirements.txt

# Frontend
rm -rf node_modules && npm install
```

**Database issues?**
```bash
rm backend/finsight.db
python -c "from app.database import init_db; init_db()"
```

---

## 📚 Learn More

- See `README.md` for full documentation
- See `INSTALLATION.md` for detailed setup
- See `docs/API.md` for API reference

---

## 🆘 Need Help?

1. Check the logs in the terminal
2. Review `INSTALLATION.md`
3. Check API docs at http://localhost:8000/api/docs

Enjoy FinSight! 🚀
