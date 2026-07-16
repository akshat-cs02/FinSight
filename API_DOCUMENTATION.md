# FinSight API Documentation

**Base URL** (local): `http://localhost:8000/api`
**Interactive Swagger UI**: `http://localhost:8000/api/docs`
**OpenAPI JSON**: `http://localhost:8000/api/openapi.json`

All non-public endpoints require:
```
Authorization: Bearer <access_token>
```

---

## Auth

### `POST /api/auth/register`
Create a new account. Pass `admin_key` matching `ADMIN_API_KEY` env to register as admin.

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "strongpass1",
  "first_name": "Alice",
  "last_name": "Doe",
  "admin_key": null
}
```
**201** → user object (no token).

### `POST /api/auth/login`
JSON body: `{ "email": "...", "password": "..." }`
**200** → `{ access_token, refresh_token, token_type: "bearer", expires_in: 3600 }`

### `POST /api/auth/login/form`
OAuth2 password form (used by Swagger UI "Authorize" button). Fields: `username`, `password`.

### `POST /api/auth/refresh?token=<refresh_token>`
Returns a new access + refresh token pair.

### `GET /api/auth/me`  *(auth required)*
Current user object.

### `POST /api/auth/logout`  *(auth required)*
Acknowledges; JWT is stateless so just discard the token client-side.

---

## Stocks (public — no auth)

### `GET /api/stocks/search?q=<query>`
Symbol lookup via yfinance. Returns `{ query, results: [{symbol, name, exchange, type}] }`.

### `GET /api/stocks/{symbol}`
Live quote.
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "price": 297.01,
  "change": -1.0,
  "change_percent": -0.34,
  "open": 297.31, "high": 302.42, "low": 296.76,
  "previous_close": 298.01,
  "volume": 44812800,
  "market_cap": 4400000000000,
  "pe_ratio": 31.2,
  "fifty_two_week_high": 320.15,
  "fifty_two_week_low": 175.55,
  "currency": "USD",
  "exchange": "NMS",
  "timestamp": "2026-06-23T..."
}
```

### `GET /api/stocks/{symbol}/history?period=1y`
Period one of `1d, 5d, 1mo, 3mo, 6mo, 1y, 5y`.
Returns `{ symbol, period, interval, data: [{date, open, high, low, close, volume}, …] }`.

### `GET /api/stocks/{symbol}/indicators?period=6mo`
Returns SMA 20/50/200, EMA 12/26, RSI 14, MACD line/signal/histogram, Bollinger upper/middle/lower, plus a `signal` field (BUY / SELL / HOLD).

---

## Market (public)

| Endpoint | Description |
|---|---|
| `GET /api/market/summary` | S&P 500, NASDAQ, Dow, VIX snapshots |
| `GET /api/market/trending` | 8 trending tickers |
| `GET /api/market/gainers?limit=5` | Top % gainers |
| `GET /api/market/losers?limit=5` | Top % losers |
| `GET /api/market/status` | `{ is_open, status, timestamp }` |

---

## News + Sentiment (public)

### `GET /api/news?limit=20`
Aggregated news across major tickers, each scored by TextBlob.

### `GET /api/news/stock/{symbol}?limit=10`
News for a specific symbol.

### `POST /api/news/sentiment/analyze`
Body: `{ "text": "..." }` → `{ sentiment: POSITIVE|NEGATIVE|NEUTRAL, score: -1..1 }`.

---

## Portfolio  *(auth required)*

### `GET /api/portfolio/summary`
Live valuation:
```json
{
  "total_invested": 4000.0,
  "total_value": 4520.5,
  "total_gain_loss": 520.5,
  "total_gain_loss_percent": 13.01,
  "today_profit_loss": -1.0,
  "holdings_count": 1,
  "allocation": [{ "symbol": "AAPL", "value": 4520.5, "percentage": 100.0 }],
  "holdings": [...]
}
```

### `GET /api/portfolio/holdings`
List holdings (current price + P/L per holding).

### `POST /api/portfolio/holdings`
```json
{ "symbol": "AAPL", "quantity": 10, "purchase_price": 250.0,
  "purchase_date": "2026-01-15T00:00:00", "notes": "..." }
```

### `PATCH /api/portfolio/holdings/{id}`
Partial update — any of `quantity`, `purchase_price`, `notes`.

### `DELETE /api/portfolio/holdings/{id}`
Remove a holding.

---

## AI Prediction

### `GET /api/prediction/`
Model status across all supported symbols.

### `GET /api/prediction/{symbol}?forecast_days=7&persist=true`
Runs ensemble prediction. Returns:
```json
{
  "symbol": "AAPL",
  "current_price": 297.01,
  "predicted_price": 276.29,
  "change_percent": -6.98,
  "confidence": 85.25,
  "trend": "BEARISH",
  "signal": "SELL",
  "rsi": 49.93,
  "model_predictions": { "xgb": 265.10, "lstm": 287.48 },
  "models_used": ["xgb", "lstm"],
  "forecast_7day": [
    { "day": 1, "date": "2026-06-24", "price": 287.48 },
    { "day": 2, "date": "2026-06-25", "price": 287.15 },
    ...
  ],
  "generated_at": "2026-06-23T11:00:00",
  "id": 42
}
```
Persists to `predictions` table (linked to authenticated user if logged in).

### `GET /api/prediction/{symbol}/history?limit=20`
Past predictions, newest first.

### `POST /api/prediction/train`  *(admin)*
Body: `{ symbol, period, lstm_epochs, skip_lstm, skip_xgb }` — kicks off training in background.

---

## Reports  *(auth required for portfolio, public for stock)*

| Endpoint | Output |
|---|---|
| `GET /api/reports/portfolio/pdf` | Downloadable PDF |
| `GET /api/reports/portfolio/csv` | CSV |
| `GET /api/reports/stock/{symbol}/pdf` | Stock analysis PDF (quote + indicators) |
| `GET /api/reports/stock/{symbol}/csv?period=1y` | Historical OHLCV |

---

## Admin  *(admin only)*

| Endpoint | Description |
|---|---|
| `GET /api/admin/users` | List all users |
| `PATCH /api/admin/users/{id}/toggle-active` | Enable/disable user |
| `DELETE /api/admin/users/{id}` | Delete user + their portfolios |
| `GET /api/admin/models` | Full metadata for every trained symbol (metrics, training date, feature importance) |
| `GET /api/admin/models/{symbol}/metrics` | Detailed metrics for one symbol |
| `POST /api/admin/models/retrain` | Trigger background retraining |
| `GET /api/admin/stats` | System-wide counters |
| `GET /api/admin/logs?limit=100` | Audit logs |

---

## WebSocket

### `WS /ws/market?symbols=AAPL,MSFT&interval=5`
Pushes a frame every `interval` seconds (3 ≤ interval ≤ 60).

Frame:
```json
{
  "type": "quote_update",
  "timestamp": "2026-06-23T11:00:00",
  "quotes": [
    { "symbol": "AAPL", "price": 297.01, "change": -1.0, "change_percent": -0.34, "volume": 44812800 },
    ...
  ]
}
```

Initial frame is sent immediately on connect; auto-reconnects from frontend on disconnect.

---

## Errors

All errors return:
```json
{ "detail": "human-readable message" }
```

| Status | Meaning |
|---|---|
| 400 | Validation / invalid input |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but not authorized (admin endpoints, disabled account) |
| 404 | Resource not found (unknown symbol, missing holding) |
| 500 | Server / yfinance / model error |
