## System architecture (brief)

```
Browser
  │
  ├── Vercel (frontend)
  │     ├── / → landing.html (static)
  │     ├── /login, /register → landing.html (rewrite)
  │     ├── /dashboard, /stocks, etc → app.html (React SPA)
  │     └── /api/* → proxy to Render backend
  │
  └── Render (backend)
        ├── FastAPI app
        ├── ML models (LSTM + XGBoost)
        └── Neon PostgreSQL
```

**Auth flow**: Landing page form → `POST /api/auth/login` → backend validates → sets httpOnly cookie → redirect to `/dashboard` → SPA calls `/api/auth/me` with cookie → backend returns user.

**Vercel rewrites** handle the routing so both the static landing page and the React SPA can coexist without conflicts.
