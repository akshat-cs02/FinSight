# FinSight API Documentation

Complete REST API reference for FinSight platform.

**Base URL:** `http://localhost:8000/api/v1`

---

## 🔐 Authentication

All protected endpoints require JWT token in Authorization header:

```
Authorization: Bearer <your_access_token>
```

### Get Token
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

---

## 👤 Authentication Endpoints

### Register User
```
POST /auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "first_name": "John",
  "last_name": "Doe"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "first_name": "John",
  "is_admin": false,
  "subscription_tier": "free",
  "created_at": "2026-06-22T10:30:00Z"
}
```

### Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

### Get Current User
```
GET /auth/me
Authorization: Bearer <token>
```

### Refresh Token
```
POST /auth/refresh
Content-Type: application/json

{
  "token": "<refresh_token>"
}
```

### Logout
```
POST /auth/logout
Authorization: Bearer <token>
```

---

## 📈 Market Data Endpoints

### Search Stock
```
GET /market/search?symbol=AAPL
Authorization: Bearer <token>
```

**Response:**
```json
{
  "symbol": "AAPL",
  "price": 189.95,
  "change": 2.45,
  "change_percent": 1.31,
  "open": 187.50,
  "high": 190.50,
  "low": 187.00,
  "volume": 45123456,
  "market_cap": 2900000000000,
  "pe_ratio": 28.5,
  "timestamp": "2026-06-22T15:30:00Z"
}
```

### Get Stock Quote
```
GET /market/quote/{symbol}
Authorization: Bearer <token>
```

### Get Historical Data
```
GET /market/history/{symbol}?period=1y
Authorization: Bearer <token>
```

**Query Parameters:**
- `period`: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `5y`

**Response:**
```json
{
  "symbol": "AAPL",
  "data": [
    {
      "date": "2025-06-22T00:00:00Z",
      "open": 187.50,
      "high": 190.50,
      "low": 187.00,
      "close": 189.95,
      "volume": 45123456
    }
  ]
}
```

### Get Trending Stocks
```
GET /market/trending
Authorization: Bearer <token>
```

### Get Top Gainers
```
GET /market/gainers?limit=10
Authorization: Bearer <token>
```

### Get Top Losers
```
GET /market/losers?limit=10
Authorization: Bearer <token>
```

### Get Crypto Overview
```
GET /market/crypto/overview
Authorization: Bearer <token>
```

---

## 🤖 AI Predictions Endpoints

### Get Prediction
```
GET /predictions/{symbol}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "symbol": "AAPL",
  "predicted_price": 195.50,
  "confidence_score": 78.5,
  "signal": "BUY",
  "trend_direction": "UP",
  "forecast_7day": [190.2, 191.5, 192.8, 193.2, 194.1, 195.0, 195.5],
  "accuracy_metric": 75.2
}
```

### Train Model
```
POST /predictions/{symbol}/train
Authorization: Bearer <token>
```

**Note:** Admin only

### Get Backtest Results
```
GET /predictions/{symbol}/backtest
Authorization: Bearer <token>
```

### Get Trading Signals
```
GET /predictions/{symbol}/signals
Authorization: Bearer <token>
```

**Response:**
```json
{
  "symbol": "AAPL",
  "buy_signal": true,
  "sell_signal": false,
  "hold_signal": false,
  "signal_strength": 0.85,
  "recommendation": "BUY",
  "entry_price": 189.95,
  "stop_loss": 185.00,
  "take_profit": 200.00
}
```

---

## 💼 Portfolio Endpoints

### Get All Portfolios
```
GET /portfolio/
Authorization: Bearer <token>
```

### Get Single Portfolio
```
GET /portfolio/{portfolio_id}
Authorization: Bearer <token>
```

### Create Portfolio
```
POST /portfolio/?name=My Portfolio
Authorization: Bearer <token>
```

### Add Stock to Portfolio
```
POST /portfolio/{portfolio_id}/add
Authorization: Bearer <token>
Content-Type: application/json

{
  "symbol": "AAPL",
  "quantity": 10,
  "purchase_price": 185.50,
  "purchase_date": "2026-06-22T00:00:00Z",
  "notes": "Long-term investment"
}
```

### Remove Stock from Portfolio
```
DELETE /portfolio/{portfolio_id}/remove/{stock_id}
Authorization: Bearer <token>
```

### Get Portfolio Performance
```
GET /portfolio/{portfolio_id}/performance
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_value": 45230.50,
  "total_invested": 40000.00,
  "total_gain_loss": 5230.50,
  "total_gain_loss_percent": 13.08,
  "best_performer": "NVDA",
  "worst_performer": "INTC",
  "roi": 13.08
}
```

### Get Asset Allocation
```
GET /portfolio/{portfolio_id}/allocation
Authorization: Bearer <token>
```

---

## 📰 News & Sentiment Endpoints

### Get Latest News
```
GET /sentiment/latest?limit=20
Authorization: Bearer <token>
```

### Get Stock Sentiment
```
GET /sentiment/{symbol}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "symbol": "AAPL",
  "overall_sentiment": "POSITIVE",
  "sentiment_score": 67.5,
  "positive_articles": 15,
  "negative_articles": 5,
  "neutral_articles": 10,
  "latest_articles": [
    {
      "title": "Apple Announces New Products",
      "source": "Reuters",
      "sentiment": "POSITIVE",
      "sentiment_score": 0.85
    }
  ]
}
```

### Analyze Sentiment
```
POST /sentiment/analyze
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Apple's Q3 earnings exceed expectations."
}
```

### Get Market Sentiment
```
GET /sentiment/market/overview
Authorization: Bearer <token>
```

---

## 👨‍💼 Admin Endpoints

### List Users
```
GET /admin/users
Authorization: Bearer <admin_token>
```

### Get User Details
```
GET /admin/users/{user_id}
Authorization: Bearer <admin_token>
```

### Delete User
```
DELETE /admin/users/{user_id}
Authorization: Bearer <admin_token>
```

### Toggle User Active Status
```
PATCH /admin/users/{user_id}/toggle-active
Authorization: Bearer <admin_token>
```

### Retrain Models
```
POST /admin/models/retrain
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "symbols": ["AAPL", "MSFT", "GOOGL"]
}
```

### Get Audit Logs
```
GET /admin/logs?limit=100
Authorization: Bearer <admin_token>
```

### Get System Stats
```
GET /admin/stats
Authorization: Bearer <admin_token>
```

---

## ❌ Error Responses

All errors follow this format:

```json
{
  "detail": "Error message",
  "error_code": "ERROR_CODE",
  "timestamp": "2026-06-22T15:30:00Z"
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| INVALID_CREDENTIALS | 401 | Email or password is incorrect |
| TOKEN_EXPIRED | 401 | Access token has expired |
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource already exists |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## 🔄 Rate Limiting

- **Limit:** 100 requests per minute per API key
- **Headers:** 
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 95`
  - `X-RateLimit-Reset: 1624360200`

---

## 📋 Pagination

For endpoints returning lists, use:
- `skip`: Number of items to skip (default: 0)
- `limit`: Number of items to return (default: 100, max: 1000)

Example:
```
GET /admin/users?skip=0&limit=50
```

---

## 🧪 Example Requests

### JavaScript (Axios)
```javascript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})

// Get stock quote
const quote = await api.get('/market/quote/AAPL')
console.log(quote.data)
```

### Python (Requests)
```python
import requests

headers = {'Authorization': f'Bearer {token}'}
response = requests.get(
    'http://localhost:8000/api/v1/market/quote/AAPL',
    headers=headers
)
print(response.json())
```

### cURL
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8000/api/v1/market/quote/AAPL
```

---

## 📚 Additional Resources

- Interactive API Docs: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- Source Code: GitHub repository

---

**API Version:** 1.0.0  
**Last Updated:** June 2026
