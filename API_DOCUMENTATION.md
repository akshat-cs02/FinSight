## Key API endpoints

Base URL (production): `https://fin-sight-blush.vercel.app/api`

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | body: `{ email, password, first_name }` |
| POST | `/auth/login` | body: `{ email, password }` → sets httpOnly cookie |
| GET | `/auth/me` | Returns current user from cookie |
| POST | `/auth/logout` | Clears cookie |
| GET | `/stocks/{symbol}` | Quote + OHLCV history |
| GET | `/stocks/search?q=` | Symbol search |
| GET | `/prediction/{symbol}` | AI prediction |
| GET | `/signals` | ICT/SMC trading signals |
| GET | `/signals/activity` | Live signal feed |
| GET | `/portfolio` | User holdings |
| GET | `/news` | Market news |
| GET | `/market/status` | Market open/closed |

Swagger UI: `https://finsight-backend-mnn6.onrender.com/api/docs`
