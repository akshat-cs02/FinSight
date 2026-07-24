## FinSight

**Live**: [fin-sight-blush.vercel.app](https://fin-sight-blush.vercel.app)

### How to use

**Guest mode** — hit "Continue as guest" on the homepage. Full dashboard, no signup.

**Register** — click "Create account" on `/register`. Email + password + name. Done.

**Sign in** — `/login`. Email + password.

### Pages

| Route | What |
|-------|------|
| `/` | Landing page |
| `/login` / `/register` | Auth panel |
| `/dashboard` | Main dashboard — signals, portfolio, predictions |
| `/stocks` / `/stocks/{symbol}` | Stock details + charts |
| `/predictions` | AI prediction history |
| `/backtesting` | Walk-forward backtest engine |
| `/portfolio` | Holdings, P&L, rebalancing |
| `/news` | Market news + sentiment |
| `/admin` | User + model management (admin only) |

### Guest mode

Creates a temporary user. Session lasts for the browser tab. Data resets on next visit. All dashboard features available.
