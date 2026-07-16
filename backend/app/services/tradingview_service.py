"""
TradingView data service — primary market-data source with yfinance fallback.

Uses TradingView's internal (undocumented) HTTP endpoints — no API key needed:
  • Scanner  : https://scanner.tradingview.com/global/scan   (quotes, batch, overview)
  • Screener : https://scanner.tradingview.com/america/scan  (top movers)
  • Search   : https://symbol-search.tradingview.com/symbol_search/v3/
  • History  : TradingView chart WebSocket (fragile) → yfinance fallback

Design notes
------------
* Core logic is SYNC (`requests`) so the existing synchronous callers
  (market_data_service, backtesting_service, …) can use it directly via the
  ``*_sync`` helpers. Async wrappers (spec names: get_realtime_quote, …) run the
  sync core in a thread so ``asyncio.run(get_realtime_quote("AAPL"))`` works.
* Rate limited to ≤10 req/s (token-bucket). Cached: quotes 5 s, history 60 s,
  search 1 h. Every TradingView call is logged.
* EVERY public function falls back to yfinance on any TradingView failure.
  yfinance is called with the ORIGINAL (yfinance-style) symbol, so no mapping
  round-trip is needed on the fallback path.

NOTE: These are internal endpoints and may change without notice — the yfinance
fallback is what keeps the app working if TradingView shifts or blocks them.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from typing import Optional

import requests
import yfinance as yf

logger = logging.getLogger(__name__)

# ── Endpoints ────────────────────────────────────────────────────────────────
_SCAN_GLOBAL = "https://scanner.tradingview.com/global/scan"
_SCAN_US     = "https://scanner.tradingview.com/america/scan"
_SEARCH_URL  = "https://symbol-search.tradingview.com/symbol_search/v3/"
_WS_URL      = "wss://data.tradingview.com/socket.io/websocket?from=chart%2F"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Origin":  "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
    "Accept":  "application/json",
    "Content-Type": "application/json",
}

# Columns requested from the scanner, in order (index → field).
_QUOTE_COLUMNS = [
    "name", "close", "change", "change_abs", "volume",
    "market_cap_basic", "price_earnings_ttm", "high", "low", "open",
    "price_52_week_high", "price_52_week_low", "dividends_yield",
    "currency", "exchange", "description",
]


# ── Rate limiter: ≤ N requests/second (token bucket, thread-safe) ─────────────
class _RateLimiter:
    def __init__(self, rate_per_sec: int = 10):
        self._min_interval = 1.0 / rate_per_sec
        self._lock = threading.Lock()
        self._next_at = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = max(0.0, self._next_at - now)
            self._next_at = max(now, self._next_at) + self._min_interval
        if wait > 0:
            time.sleep(wait)


_limiter = _RateLimiter(rate_per_sec=10)


# ── TTL cache (thread-safe) ───────────────────────────────────────────────────
class _TTLCache:
    def __init__(self, ttl: float):
        self._ttl = ttl
        self._store: dict[str, tuple[object, float]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            hit = self._store.get(key)
            if hit and (time.monotonic() - hit[1]) < self._ttl:
                return hit[0]
        return None

    def set(self, key: str, value) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic())


_quote_cache  = _TTLCache(ttl=5.0)      # quotes: 5 s
_hist_cache   = _TTLCache(ttl=60.0)     # historical: 1 min
_search_cache = _TTLCache(ttl=3600.0)   # search: 1 hr
_movers_cache = _TTLCache(ttl=30.0)     # movers/overview: 30 s

# TradingView's chart WebSocket (the ONLY source of historical OHLCV) now
# requires an authenticated handshake that isn't publicly stable — an
# unauthorized session connects but receives no data. So historical OHLCV is
# served by yfinance (which is also what the ML models train on → consistent).
# Flip to True if a working TradingView chart token/handshake becomes available;
# the websocket implementation below is kept ready for that.
_TV_HISTORY_ENABLED = False
_us_exchange_cache: dict[str, str] = {}  # resolved US ticker → exchange (persistent)


# ── Symbol mapping: yfinance-style → TradingView "EXCHANGE:TICKER" ────────────
_FUTURES_MAP = {
    "GC=F": "COMEX:GC1!", "SI=F": "COMEX:SI1!", "HG=F": "COMEX:HG1!",
    "PL=F": "NYMEX:PL1!", "PA=F": "NYMEX:PA1!",
    "CL=F": "NYMEX:CL1!", "BZ=F": "NYMEX:BZ1!", "NG=F": "NYMEX:NG1!",
    "ZW=F": "CBOT:ZW1!", "ZC=F": "CBOT:ZC1!",
    "ES=F": "CME:ES1!", "NQ=F": "CME:NQ1!", "YM=F": "CBOT:YM1!", "RTY=F": "CME:RTY1!",
}
_INDEX_MAP = {
    "^GSPC": "SP:SPX", "^IXIC": "NASDAQ:IXIC", "^DJI": "DJ:DJI",
    "^RUT": "TVC:RUT", "^VIX": "TVC:VIX", "^FTSE": "TVC:UKX",
    "^N225": "TVC:NI225", "^HSI": "TVC:HSI", "^GDAXI": "XETR:DAX",
    "^NSEI": "NSE:NIFTY", "^BSESN": "BSE:SENSEX", "^NSEBANK": "NSE:BANKNIFTY",
}
_SUFFIX_EXCHANGE = {
    ".NS": "NSE", ".BO": "BSE", ".L": "LSE", ".T": "TSE", ".HK": "HKEX",
    ".AX": "ASX", ".TO": "TSX", ".V": "TSXV", ".SS": "SSE", ".SZ": "SZSE",
    ".DE": "XETR", ".PA": "EURONEXT", ".AS": "EURONEXT", ".MI": "MIL",
    ".MC": "BME", ".SW": "SIX", ".SA": "BMFBOVESPA", ".KS": "KRX",
}
# Spot metals/energy → futures proxy (aligns with the rest of the app).
_SPOT_MAP = {
    "XAUUSD": "COMEX:GC1!", "XAUUSD=X": "COMEX:GC1!",
    "XAGUSD": "COMEX:SI1!", "XAGUSD=X": "COMEX:SI1!",
    "USOIL": "NYMEX:CL1!", "WTIUSD": "NYMEX:CL1!",
    "UKOIL": "NYMEX:BZ1!", "BRENT": "NYMEX:BZ1!", "NATGAS": "NYMEX:NG1!",
}


def _resolve_us_exchange(ticker: str) -> str:
    """Resolve a bare US ticker to its TradingView exchange (cached forever)."""
    if ticker in _us_exchange_cache:
        return _us_exchange_cache[ticker]
    try:
        for r in _search_core(ticker):
            if r["symbol"].upper() == ticker and r.get("exchange"):
                _us_exchange_cache[ticker] = r["exchange"]
                return r["exchange"]
    except Exception:
        pass
    return "NASDAQ"  # best-effort default; scanner-empty → yfinance fallback anyway


def to_tv_symbol(symbol: str) -> str:
    """Map a yfinance-style symbol to a TradingView 'EXCHANGE:TICKER' string."""
    s = (symbol or "").upper().strip()
    if ":" in s:                       # already TradingView-formatted
        return s
    if s in _SPOT_MAP:
        return _SPOT_MAP[s]
    if s in _FUTURES_MAP:
        return _FUTURES_MAP[s]
    if s in _INDEX_MAP:
        return _INDEX_MAP[s]
    if s.endswith("-USD"):             # crypto: BTC-USD → BINANCE:BTCUSDT
        return f"BINANCE:{s[:-4]}USDT"
    if s.endswith("=X"):               # forex: EURUSD=X → FX:EURUSD
        return f"FX:{s[:-2]}"
    if s.endswith("=F"):               # unmapped future → strip, best-effort
        return s[:-2]
    for suf, exch in _SUFFIX_EXCHANGE.items():
        if s.endswith(suf):
            return f"{exch}:{s[:-len(suf)]}"
    if s.startswith("^"):
        return s[1:]
    # Bare US ticker — resolve the exchange (NASDAQ/NYSE/…).
    return f"{_resolve_us_exchange(s)}:{s}"


# ── Low-level scanner call ────────────────────────────────────────────────────
def _post(url: str, payload: dict, timeout: float = 10.0) -> dict:
    _limiter.wait()
    resp = requests.post(url, json=payload, headers=_HEADERS, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _scan(tickers: list[str], columns: list[str]) -> dict[str, list]:
    """Batch scanner lookup → {tv_ticker: [col values]}."""
    payload = {"symbols": {"tickers": tickers, "query": {"types": []}}, "columns": columns}
    logger.info("TradingView scan: %d ticker(s) %s", len(tickers), tickers[:5])
    data = _post(_SCAN_GLOBAL, payload)
    return {row["s"]: row["d"] for row in data.get("data", [])}


def _row_to_quote(symbol: str, d: list) -> dict:
    """Map a _QUOTE_COLUMNS row to the public quote schema."""
    def g(i):
        return d[i] if i < len(d) else None
    close, chg_abs = g(1), g(3)
    prev = (close - chg_abs) if (close is not None and chg_abs is not None) else None
    div = g(12)
    return {
        "symbol":       symbol.upper(),
        "name":         g(15) or g(0) or symbol.upper(),
        "price":        close,
        "change":       chg_abs,                 # absolute
        "change_pct":   g(2),                    # percent
        "change_percent": g(2),                  # alias used across the app
        "volume":       int(g(4)) if g(4) else 0,
        "market_cap":   g(5),
        "pe_ratio":     g(6),
        "high":         g(7),
        "low":          g(8),
        "open":         g(9),
        "prev_close":   prev,
        "previous_close": prev,
        "fifty_two_week_high": g(10),
        "fifty_two_week_low":  g(11),
        "dividend_yield": (div / 100.0) if isinstance(div, (int, float)) else None,
        "currency":     g(13),
        "exchange":     g(14),
        "source":       "tradingview",
    }


# ── yfinance fallbacks (called with ORIGINAL yfinance symbol) ─────────────────
def _yf_quote(symbol: str) -> dict:
    logger.warning("TradingView quote failed for %s — falling back to yfinance", symbol)
    t = yf.Ticker(symbol)
    hist = t.history(period="5d", interval="1d")
    if hist.empty:
        raise ValueError(f"No data for {symbol}")
    last = hist.iloc[-1]
    prev = hist.iloc[-2]["Close"] if len(hist) > 1 else last["Open"]
    price = float(last["Close"])
    change = price - float(prev)
    info = {}
    try:
        info = t.info or {}
    except Exception:
        pass
    return {
        "symbol": symbol.upper(),
        "name": info.get("shortName") or info.get("longName") or symbol.upper(),
        "price": price, "change": change,
        "change_pct": (change / float(prev) * 100) if prev else 0.0,
        "change_percent": (change / float(prev) * 100) if prev else 0.0,
        "volume": int(last["Volume"]) if last["Volume"] == last["Volume"] else 0,
        "market_cap": info.get("marketCap"), "pe_ratio": info.get("trailingPE"),
        "high": float(last["High"]), "low": float(last["Low"]), "open": float(last["Open"]),
        "prev_close": float(prev), "previous_close": float(prev),
        "source": "yfinance",
    }


_YF_INTERVAL = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "60m",
    "4h": "60m", "1d": "1d", "1W": "1wk", "1M": "1mo",
}
_YF_PERIOD = {
    "1D": "1d", "5D": "5d", "1M": "1mo", "3M": "3mo",
    "6M": "6mo", "1Y": "1y", "5Y": "5y", "MAX": "max",
}
# TradingView chart resolution + bar counts per range.
_TV_RESOLUTION = {
    "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60",
    "4h": "240", "1d": "1D", "1W": "1W", "1M": "1M",
}
_RANGE_BARS = {
    "1D": 400, "5D": 500, "1M": 500, "3M": 700,
    "6M": 900, "1Y": 1200, "5Y": 2500, "MAX": 5000,
}


def _yf_ohlcv(symbol: str, interval: str, rng: str) -> list[dict]:
    logger.info("OHLCV via yfinance: %s (%s/%s)", symbol, interval, rng)
    yf_int = _YF_INTERVAL.get(interval, "1d")
    yf_per = _YF_PERIOD.get(rng, "1y")
    # yfinance intraday caps: 1m → 7d, other intraday → 60d.
    if yf_int == "1m" and yf_per not in ("1d", "5d"):
        yf_per = "5d"
    elif yf_int in ("5m", "15m", "30m", "60m") and yf_per in ("1y", "5y", "max"):
        yf_per = "60d"
    df = yf.Ticker(symbol).history(period=yf_per, interval=yf_int)
    if df.empty:
        raise ValueError(f"No history for {symbol}")
    out = []
    for idx, row in df.iterrows():
        out.append({
            "time": int(idx.timestamp()),
            "open": float(row["Open"]), "high": float(row["High"]),
            "low": float(row["Low"]), "close": float(row["Close"]),
            "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
        })
    return out


# ══════════════════════════════════════════════════════════════════════════════
# SYNC CORE (used directly by synchronous callers)
# ══════════════════════════════════════════════════════════════════════════════
def get_realtime_quote_sync(symbol: str) -> dict:
    """Real-time quote. TradingView first, yfinance fallback. Cached 5 s."""
    cached = _quote_cache.get(symbol.upper())
    if cached:
        return cached
    try:
        tv = to_tv_symbol(symbol)
        rows = _scan([tv], _QUOTE_COLUMNS)
        d = rows.get(tv)
        if not d or d[1] is None:
            raise ValueError(f"empty TradingView row for {tv}")
        quote = _row_to_quote(symbol, d)
    except Exception as exc:
        logger.warning("TradingView quote error for %s: %s", symbol, exc)
        quote = _yf_quote(symbol)
    _quote_cache.set(symbol.upper(), quote)
    return quote


def get_quotes_batch_sync(symbols: list[str]) -> dict[str, dict]:
    """Batch quotes in ONE scanner call. Per-symbol yfinance fallback on misses."""
    if not symbols:
        return {}
    tv_map = {to_tv_symbol(s): s for s in symbols}
    result: dict[str, dict] = {}
    try:
        rows = _scan(list(tv_map.keys()), _QUOTE_COLUMNS)
        for tv, orig in tv_map.items():
            d = rows.get(tv)
            if d and d[1] is not None:
                q = _row_to_quote(orig, d)
                result[orig.upper()] = q
                _quote_cache.set(orig.upper(), q)
    except Exception as exc:
        logger.warning("TradingView batch error: %s", exc)
    # Fill any misses individually (uses per-symbol cache / yfinance).
    for orig in symbols:
        if orig.upper() not in result:
            try:
                result[orig.upper()] = get_realtime_quote_sync(orig)
            except Exception as e:
                logger.warning("batch fallback failed for %s: %s", orig, e)
    return result


def _search_core(query: str) -> list[dict]:
    cached = _search_cache.get(query.lower())
    if cached is not None:
        return cached
    logger.info("TradingView search: %r", query)
    _limiter.wait()
    resp = requests.get(
        _SEARCH_URL,
        params={"text": query, "hl": "0", "exchange": "", "lang": "en",
                "search_type": "undefined", "domain": "production"},
        headers=_HEADERS, timeout=8.0,
    )
    resp.raise_for_status()
    data = resp.json()
    out = []
    for item in data.get("symbols", []):
        raw = (item.get("symbol") or "").replace("<em>", "").replace("</em>", "")
        desc = (item.get("description") or "").replace("<em>", "").replace("</em>", "")
        if not raw:
            continue
        out.append({
            "symbol": raw,
            "name": desc or raw,
            "exchange": item.get("exchange", ""),
            "type": item.get("type", ""),
        })
    _search_cache.set(query.lower(), out)
    return out


def search_symbols_sync(query: str) -> list[dict]:
    try:
        return _search_core(query)
    except Exception as exc:
        logger.warning("TradingView search failed for %r: %s — yfinance fallback", query, exc)
        try:
            out, seen = [], set()
            for r in yf.Search(query, max_results=20).quotes:
                sym = r.get("symbol")
                if not sym or sym in seen:
                    continue
                seen.add(sym)
                out.append({"symbol": sym, "name": r.get("shortname") or r.get("longname") or sym,
                            "exchange": r.get("exchange", ""), "type": r.get("quoteType", "")})
            return out
        except Exception:
            return []


def get_top_movers_sync(direction: str = "gainers", limit: int = 10) -> list[dict]:
    """Top gainers/losers among liquid US names (mcap>1B, price>5)."""
    key = f"{direction}:{limit}"
    cached = _movers_cache.get(key)
    if cached is not None:
        return cached
    order = "desc" if direction == "gainers" else "asc"
    payload = {
        "filter": [
            {"left": "market_cap_basic", "operation": "egreater", "right": 1_000_000_000},
            {"left": "close", "operation": "egreater", "right": 5},
            {"left": "volume", "operation": "egreater", "right": 500_000},
        ],
        "options": {"lang": "en"},
        "sort": {"sortBy": "change", "sortOrder": order},
        "range": [0, max(1, min(limit, 50))],
        "columns": ["name", "close", "change"],
    }
    try:
        logger.info("TradingView movers: %s (limit=%d)", direction, limit)
        data = _post(_SCAN_US, payload)
        out = [
            {"symbol": row["d"][0], "price": row["d"][1], "change_pct": row["d"][2]}
            for row in data.get("data", [])
        ]
        _movers_cache.set(key, out)
        return out
    except Exception as exc:
        logger.warning("TradingView movers failed: %s", exc)
        return []


# Market-overview index + sector definitions.
_OVERVIEW_INDICES = [
    ("SP:SPX", "S&P 500"), ("NASDAQ:IXIC", "Nasdaq"), ("DJ:DJI", "Dow Jones"),
    ("TVC:VIX", "VIX"), ("NSE:NIFTY", "Nifty 50"), ("BSE:SENSEX", "Sensex"),
]
_OVERVIEW_SECTORS = [
    ("AMEX:XLK", "Technology"), ("AMEX:XLF", "Financials"), ("AMEX:XLE", "Energy"),
    ("AMEX:XLV", "Health Care"), ("AMEX:XLY", "Consumer Disc."), ("AMEX:XLI", "Industrials"),
]


def get_market_overview_sync() -> dict:
    cached = _movers_cache.get("overview")
    if cached is not None:
        return cached
    tickers = [t for t, _ in _OVERVIEW_INDICES] + [t for t, _ in _OVERVIEW_SECTORS]
    names = dict(_OVERVIEW_INDICES + _OVERVIEW_SECTORS)
    try:
        rows = _scan(tickers, ["close", "change"])
        indices = [
            {"symbol": t, "name": names[t],
             "price": rows[t][0], "change_percent": rows[t][1]}
            for t, _ in _OVERVIEW_INDICES if t in rows and rows[t][0] is not None
        ]
        sectors = [
            {"symbol": t, "name": names[t],
             "price": rows[t][0], "change_percent": rows[t][1]}
            for t, _ in _OVERVIEW_SECTORS if t in rows and rows[t][0] is not None
        ]
        result = {"indices": indices, "sectors": sectors}
        _movers_cache.set("overview", result)
        return result
    except Exception as exc:
        logger.warning("TradingView overview failed: %s", exc)
        return {"indices": [], "sectors": []}


# ── Historical OHLCV: TradingView WebSocket, else yfinance ────────────────────
def _tv_ws_history(tv_symbol: str, interval: str, rng: str) -> list[dict]:
    """
    Pull OHLCV via TradingView's chart WebSocket. Fragile by nature — any
    protocol hiccup raises so the caller falls back to yfinance.
    """
    import websockets  # local import: only needed on the TV history path

    resolution = _TV_RESOLUTION.get(interval, "1D")
    n_bars = _RANGE_BARS.get(rng, 1200)

    def _frame(msg: str) -> str:
        return f"~m~{len(msg)}~m~{msg}"

    def _msg(method: str, params: list) -> str:
        return _frame(json.dumps({"m": method, "p": params}))

    def _connect():
        # websockets ≥12 renamed extra_headers → additional_headers.
        hdrs = {"Origin": "https://www.tradingview.com", "User-Agent": _HEADERS["User-Agent"]}
        try:
            return websockets.connect(_WS_URL, additional_headers=hdrs,
                                      open_timeout=8, close_timeout=3, max_size=None)
        except TypeError:
            return websockets.connect(_WS_URL, extra_headers=hdrs,
                                      open_timeout=8, close_timeout=3, max_size=None)

    async def _run() -> list[dict]:
        chart_sess = "cs_finsight01"
        async with _connect() as ws:
            await ws.recv()  # server hello
            await ws.send(_msg("set_auth_token", ["unauthorized_user_token"]))
            await ws.send(_msg("chart_create_session", [chart_sess, ""]))
            await ws.send(_msg("resolve_symbol", [
                chart_sess, "sym_1",
                json.dumps({"symbol": tv_symbol, "adjustment": "splits"}),
            ]))
            await ws.send(_msg("create_series", [
                chart_sess, "s1", "s1", "sym_1", resolution, n_bars, "",
            ]))

            bars: list[dict] = []
            deadline = time.monotonic() + 12.0
            while time.monotonic() < deadline:
                raw = await asyncio.wait_for(ws.recv(), timeout=6.0)
                # Heartbeat: ~m~<n>~m~~h~<n>  → echo back.
                if "~h~" in raw:
                    await ws.send(raw)
                    continue
                for part in raw.split("~m~"):
                    if not part or part.isdigit():
                        continue
                    try:
                        obj = json.loads(part)
                    except Exception:
                        continue
                    if isinstance(obj, dict) and obj.get("m") in ("timescale_update", "du"):
                        p = obj.get("p", [])
                        for seg in p:
                            if isinstance(seg, dict) and "s1" in seg:
                                for pt in seg["s1"].get("s", []):
                                    v = pt.get("v")
                                    if v and len(v) >= 6:
                                        bars.append({
                                            "time": int(v[0]), "open": float(v[1]),
                                            "high": float(v[2]), "low": float(v[3]),
                                            "close": float(v[4]), "volume": int(v[5]),
                                        })
                if bars:
                    break
            if not bars:
                raise ValueError("no bars from TradingView websocket")
            bars.sort(key=lambda b: b["time"])
            return bars

    return asyncio.run(_run())


def get_historical_ohlcv_sync(symbol: str, interval: str = "1d", rng: str = "1Y") -> list[dict]:
    """Historical OHLCV. TradingView websocket first, yfinance fallback. Cached 1 min."""
    key = f"{symbol.upper()}:{interval}:{rng}"
    cached = _hist_cache.get(key)
    if cached is not None:
        return cached
    bars = None
    if _TV_HISTORY_ENABLED:
        try:
            tv = to_tv_symbol(symbol)
            logger.info("TradingView history: %s (%s/%s)", tv, interval, rng)
            bars = _tv_ws_history(tv, interval, rng)
        except Exception as exc:
            logger.warning("TradingView history error for %s: %s", symbol, exc)
            bars = None
    if not bars:
        bars = _yf_ohlcv(symbol, interval, rng)  # reliable primary for OHLCV
    _hist_cache.set(key, bars)
    return bars


# ══════════════════════════════════════════════════════════════════════════════
# ASYNC PUBLIC API (spec names) — run the sync core off-thread
# ══════════════════════════════════════════════════════════════════════════════
async def get_realtime_quote(symbol: str) -> dict:
    return await asyncio.to_thread(get_realtime_quote_sync, symbol)


async def get_historical_ohlcv(symbol: str, interval: str = "1d", range: str = "1Y") -> list[dict]:  # noqa: A002
    return await asyncio.to_thread(get_historical_ohlcv_sync, symbol, interval, range)


async def search_symbols(query: str) -> list[dict]:
    return await asyncio.to_thread(search_symbols_sync, query)


async def get_market_overview() -> dict:
    return await asyncio.to_thread(get_market_overview_sync)


async def get_top_movers(direction: str = "gainers", limit: int = 10) -> list[dict]:
    return await asyncio.to_thread(get_top_movers_sync, direction, limit)


async def get_quotes_batch(symbols: list[str]) -> dict[str, dict]:
    return await asyncio.to_thread(get_quotes_batch_sync, symbols)


# ── DataFrame helper for OHLCV consumers (dataset_builder, backtesting) ───────
_PERIOD_TO_RANGE = {
    "1d": "1D", "5d": "5D", "1mo": "1M", "3mo": "3M", "6mo": "6M",
    "1y": "1Y", "2y": "1Y", "3y": "5Y", "5y": "5Y", "10y": "MAX", "max": "MAX",
    "30d": "1M", "60d": "3M", "730d": "5Y",
}
_YF_TO_TV_INTERVAL = {
    "1m": "1m", "2m": "5m", "5m": "5m", "15m": "15m", "30m": "30m",
    "60m": "1h", "90m": "1h", "1h": "1h", "1d": "1d", "1wk": "1W", "1mo": "1M",
}


def get_ohlcv_df(symbol: str, period: str = "1y", interval: str = "1d"):
    """
    yfinance-`.history()`-compatible OHLCV fetch, routed through this service so
    callers get TradingView automatically once _TV_HISTORY_ENABLED is on. Today
    it returns yfinance data (TV chart history requires an unstable auth token),
    keeping OHLCV reliable and consistent with the trained ML models.

    Returns a DataFrame with the SAME shape as ``yf.Ticker(sym).history(...)``.
    """
    import pandas as pd

    if _TV_HISTORY_ENABLED:
        try:
            tv = to_tv_symbol(symbol)
            rng = _PERIOD_TO_RANGE.get(period, "1Y")
            tvi = _YF_TO_TV_INTERVAL.get(interval, interval)
            bars = _tv_ws_history(tv, tvi, rng)
            if bars:
                df = pd.DataFrame(bars)
                df["Date"] = pd.to_datetime(df["time"], unit="s", utc=True)
                df = df.set_index("Date").rename(columns={
                    "open": "Open", "high": "High", "low": "Low",
                    "close": "Close", "volume": "Volume",
                })
                return df[["Open", "High", "Low", "Close", "Volume"]]
        except Exception as exc:
            logger.warning("TradingView OHLCV df failed for %s: %s", symbol, exc)

    logger.info("OHLCV df via yfinance: %s (%s/%s)", symbol, period, interval)
    return yf.Ticker(symbol).history(period=period, interval=interval)
