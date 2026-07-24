## Installing FinSight locally

### Backend

```
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in:

```
SECRET_KEY=generate-a-random-32-char-string
DATABASE_URL=postgresql://...
ADMIN_API_KEY=your-admin-key
```

Start:

```
uvicorn app.main:app --reload --port 8888
```

### Frontend

```
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:3000`.

### Database

Default is SQLite. For production, set `DATABASE_URL` to a PostgreSQL connection string (Neon, Render, etc.).
