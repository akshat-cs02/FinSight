"""
Real market data service using yfinance.
No mock data - all from Yahoo Finance.
"""
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, wait as futures_wait, FIRST_COMPLETED
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional
import requests
import yfinance as yf
import pandas as pd

# ─── Shared thread pool for parallel market data fetches ─────────────────────
_mds_executor = ThreadPoolExecutor(max_workers=10, thread_name_prefix="mds_worker")

# ─── Quote price cache (10 s TTL) ────────────────────────────────────────────
_price_cache: dict[str, tuple[dict, float]] = {}
PRICE_CACHE_TTL: float = 10.0  # seconds

# ─── Trending stocks cache (30 s TTL, keyed per market) ──────────────────────
_trending_cache: dict[str, tuple[list[dict], float]] = {}
TRENDING_CACHE_TTL: float = 30.0  # seconds

logger = logging.getLogger(__name__)

# TradingView's public symbol search endpoint (used by its own widget).
# Way better coverage than yfinance: every NSE/BSE stock, all global exchanges,
# crypto from every venue, forex from OANDA/FX_IDC, commodities, indices.
_TV_SEARCH_URL = "https://symbol-search.tradingview.com/symbol_search/"
_TV_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Origin":     "https://www.tradingview.com",
    "Referer":    "https://www.tradingview.com/",
    "Accept":     "application/json, text/plain, */*",
}


def _strip_tv_highlight(s: str) -> str:
    """TradingView wraps matched substrings in <em>…</em>. Strip them."""
    return re.sub(r"</?em>", "", s or "")


# Map TradingView exchange code → suffix yfinance uses.
# Empty string means yfinance uses the bare ticker (NASDAQ/NYSE).
_TV_EXCHANGE_SUFFIX = {
    "NASDAQ": "", "NYSE": "", "AMEX": "", "ARCA": "", "BATS": "", "OTC": "",
    "NSE": ".NS", "BSE": ".BO",
    "LSE": ".L", "LSIN": ".L",
    "XETR": ".DE", "FWB": ".DE",
    "EURONEXT": ".PA", "EURONEXTAM": ".AS", "EURONEXTPA": ".PA",
    "MIL": ".MI", "BME": ".MC",
    "TSX": ".TO", "TSXV": ".V",
    "ASX": ".AX",
    "HKEX": ".HK",
    "TSE": ".T",
    "SSE": ".SS", "SZSE": ".SZ",
    "SWX": ".SW",
    "BMFBOVESPA": ".SA",
    "KRX": ".KS", "KOSDAQ": ".KQ",
}


def tv_to_yfinance(tv_symbol: str, tv_exchange: str = "", tv_type: str = "") -> str:
    """
    Convert a TradingView search result into a yfinance-compatible ticker.

    Examples:
        ("AAPL", "NASDAQ", "stock")        → "AAPL"
        ("RELIANCE", "NSE", "stock")       → "RELIANCE.NS"
        ("BTCUSDT", "BINANCE", "crypto")   → "BTC-USD"
        ("EURUSD", "OANDA", "forex")       → "EURUSD=X"
        ("XAUUSD", "OANDA", "forex")       → "XAUUSD"   (no yfinance equivalent; chart-only)
    """
    sym = (tv_symbol or "").upper().strip()
    exch = (tv_exchange or "").upper().strip()
    typ  = (tv_type or "").lower().strip()

    if not sym:
        return sym

    # Crypto on Binance/Coinbase/Kraken etc: BTCUSDT → BTC-USD
    if typ == "crypto" or exch in {"BINANCE", "COINBASE", "KRAKEN", "BITFINEX", "BYBIT", "OKX"}:
        m = re.match(r"^([A-Z0-9]+)(USDT|USDC|USD|BUSD)$", sym)
        if m:
            return f"{m.group(1)}-USD"
        return sym

    # Forex: OANDA:EURUSD → EURUSD=X (only majors yfinance supports)
    if typ == "forex" or exch in {"OANDA", "FX_IDC", "FOREXCOM"}:
        if re.match(r"^[A-Z]{6}$", sym):
            major = {"EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD",
                     "USDINR","EURJPY","EURGBP","GBPJPY","AUDJPY","EURCHF","CHFJPY"}
            if sym in major or sym.endswith("USD") or sym.startswith("USD"):
                return f"{sym}=X"
        return sym  # exotic FX / spot metals → chart-only

    # Equities: append yfinance suffix for the exchange
    suffix = _TV_EXCHANGE_SUFFIX.get(exch, "")
    return f"{sym}{suffix}" if suffix else sym


def search_via_tradingview(query: str, max_results: int = 25) -> list[dict]:
    """
    Search TradingView's public symbol_search endpoint.
    Returns symbols pre-converted to yfinance-compatible tickers.
    """
    try:
        resp = requests.get(
            _TV_SEARCH_URL,
            params={"text": query, "hl": "1", "exchange": "", "lang": "en", "domain": "production"},
            headers=_TV_HEADERS,
            timeout=6.0,
        )
        if resp.status_code != 200:
            logger.warning(f"TV search HTTP {resp.status_code}: {resp.text[:200]}")
            return []
        data = resp.json()
    except Exception as e:
        logger.warning(f"TV search failed for {query}: {e}")
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for item in data[:max_results]:
        raw_symbol = _strip_tv_highlight(item.get("symbol", "")).upper()
        exch       = (item.get("exchange") or "").upper()
        typ        = (item.get("type") or "").lower()
        name       = _strip_tv_highlight(item.get("description", ""))
        if not raw_symbol:
            continue
        yf_sym = tv_to_yfinance(raw_symbol, exch, typ)
        if yf_sym in seen:
            continue
        seen.add(yf_sym)
        out.append({
            "symbol":   yf_sym,
            "tv_symbol": f"{exch}:{raw_symbol}" if exch else raw_symbol,
            "name":     name or raw_symbol,
            "exchange": exch,
            "type":     {
                "stock": "EQUITY",
                "crypto": "CRYPTOCURRENCY",
                "forex": "CURRENCY",
                "fund": "ETF",
                "index": "INDEX",
                "futures": "FUTURE",
                "economic": "INDEX",
            }.get(typ, (typ or "EQUITY").upper()),
        })
    return out

PERIOD_MAP = {
    "1d": ("1d", "5m"),
    "5d": ("5d", "30m"),
    "1mo": ("1mo", "1d"),
    "3mo": ("3mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y": ("1y", "1d"),
    "5y": ("5y", "1wk"),
}

# Intraday + swing timeframes. key = label the frontend sends.
# value = (yfinance period lookback, yfinance interval).
# yfinance intraday limits: 1m → 7d, <1d intervals → 60d max.
TIMEFRAME_MAP = {
    "1m":  ("5d", "1m"),
    "2m":  ("5d", "2m"),
    "5m":  ("1mo", "5m"),
    "15m": ("1mo", "15m"),
    "30m": ("2mo", "30m"),
    "1h":  ("3mo", "60m"),
    "1d":  ("1d", "5m"),
    "5d":  ("5d", "30m"),
    "1mo": ("1mo", "1d"),
    "3mo": ("3mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y":  ("1y", "1d"),
    "5y":  ("5y", "1wk"),
}

TRENDING_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX"]
INDEX_SYMBOLS = {"^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones", "^VIX": "VIX"}

# ─── Market / asset-class groups (drives the dashboard market selector) ───────
# NOTE: these list the *seed* tickers per market. The full universe is grown
# dynamically at runtime when users add symbols (see watchers/universe below).
# A bigger seed means better chance of filling the 5-slot Top Gainers/Losers
# cards, especially on weekends / quiet hours when a market is closed.
MARKET_GROUPS: dict[str, list[str]] = {
    "US":          ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX",
                    "AMD", "INTC", "JPM", "GS", "WMT", "DIS", "BA", "ORCL"],
    "INDIA":       ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS",
                    "ICICIBANK.NS", "SBIN.NS", "TATAMOTORS.NS", "WIPRO.NS",
                    "ITC.NS", "BHARTIARTL.NS", "HINDUNILVR.NS", "ADANIENT.NS"],
    "CRYPTO":      ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD",
                    "XRP-USD", "ADA-USD", "DOGE-USD", "AVAX-USD",
                    "DOT-USD", "MATIC-USD", "LTC-USD", "TRX-USD"],
    "FOREX":       ["EURUSD=X", "GBPUSD=X", "USDJPY=X", "AUDUSD=X", "USDCAD=X", "USDINR=X",
                    "NZDUSD=X", "USDCHF=X", "EURGBP=X", "EURJPY=X"],
    "COMMODITIES": ["GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F",
                    "PL=F", "PA=F", "ZC=F", "ZW=F"],
}

# "ALL" = a curated cross-asset mix (2 from each group) so the default view
# shows something from every market.
_ALL_MIX = (
    MARKET_GROUPS["US"][:2] + MARKET_GROUPS["INDIA"][:2] + MARKET_GROUPS["CRYPTO"][:2]
    + MARKET_GROUPS["FOREX"][:2] + MARKET_GROUPS["COMMODITIES"][:2]
)


# Per-market overrides for the "Forex" and "Commodities" tabs — they share the
# same conceptual bucket in the user's mind (raw / commodities), so flipping
# between them shows the related assets too.
_MARKET_OVERLAYS: dict[str, list[str]] = {
    "FOREX":       MARKET_GROUPS["FOREX"] + MARKET_GROUPS["COMMODITIES"][:2],
    "COMMODITIES": MARKET_GROUPS["COMMODITIES"] + MARKET_GROUPS["FOREX"][:2],
}


def symbols_for_market(market: str) -> list[str]:
    """
    Return the symbol list for a market tab.
      ALL         → curated cross-asset mix (2 from each group)
      US/INDIA/CRYPTO                    → only that market
      FOREX                              → forex + 2 commodities (oil & gold)
      COMMODITIES                        → commodities + 2 forex pairs (EURUSD, GBPUSD)
    """
    m = (market or "ALL").upper()
    if m == "ALL":
        return _ALL_MIX
    if m in _MARKET_OVERLAYS:
        return _MARKET_OVERLAYS[m]
    return MARKET_GROUPS.get(m, TRENDING_SYMBOLS)

# Alias map — map TradingView-style / spot tickers to a yfinance symbol that
# actually returns OHLCV. Spot metals (XAUUSD=X) are delisted on Yahoo, so we
# proxy them to the corresponding futures contract (GC=F, SI=F, …).
SYMBOL_ALIAS = {
    # FX without =X suffix → yfinance uses =X
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X", "USDCAD": "USDCAD=X", "USDCHF": "USDCHF=X",
    "NZDUSD": "NZDUSD=X", "USDINR": "USDINR=X", "EURJPY": "EURJPY=X",
    "EURGBP": "EURGBP=X", "GBPJPY": "GBPJPY=X",
    # Spot metals → futures proxy (Yahoo has no spot OHLCV for these).
    # Both the bare and the =X form map to the future.
    "XAUUSD": "GC=F", "XAUUSD=X": "GC=F", "GOLD": "GC=F",
    "XAGUSD": "SI=F", "XAGUSD=X": "SI=F", "SILVER": "SI=F",
    "XPTUSD": "PL=F", "XPTUSD=X": "PL=F",
    "XPDUSD": "PA=F", "XPDUSD=X": "PA=F",
    "XCUUSD": "HG=F", "XCUUSD=X": "HG=F", "COPPER": "HG=F",
    # Oil / gas spot names → futures
    "USOIL": "CL=F", "WTIUSD": "CL=F", "WTI": "CL=F",
    "UKOIL": "BZ=F", "BRENTUSD": "BZ=F", "BRENT": "BZ=F",
    "NATGAS": "NG=F", "NGAS": "NG=F",
}


def resolve_symbol(symbol: str) -> str:
    """Map TradingView-style / spot tickers to yfinance equivalents."""
    s = symbol.upper().strip()
    return SYMBOL_ALIAS.get(s, s)


def _tv_quote_to_result(symbol: str, yf_symbol: str, q: dict | None) -> dict | None:
    """Map a tradingview_service quote to the market_data quote schema (or None)."""
    if not q or q.get("source") != "tradingview" or q.get("price") is None:
        return None
    return {
        "symbol": symbol.upper(),
        "name": q.get("name") or symbol.upper(),
        "price": q["price"],
        "change": q.get("change") or 0.0,
        "change_percent": q.get("change_percent") or 0.0,
        "open": q.get("open"),
        "high": q.get("high"),
        "low": q.get("low"),
        "previous_close": q.get("previous_close"),
        "volume": q.get("volume") or 0,
        "market_cap": q.get("market_cap"),
        "pe_ratio": q.get("pe_ratio"),
        "dividend_yield": q.get("dividend_yield"),
        "fifty_two_week_high": q.get("fifty_two_week_high"),
        "fifty_two_week_low": q.get("fifty_two_week_low"),
        "currency": q.get("currency") or guess_currency(yf_symbol),
        "exchange": q.get("exchange"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "tradingview",
    }


def prefetch_quotes(symbols: list[str]) -> None:
    """
    Warm the quote cache for many symbols in ONE TradingView batch call.
    Portfolio/watchlist call this so their per-symbol get_stock_quote() lookups
    become instant cache hits instead of N separate requests.
    """
    if not symbols:
        return
    try:
        from app.services import tradingview_service as tv
        resolved = {resolve_symbol(s): s for s in symbols}
        batch = tv.get_quotes_batch_sync(list(resolved.keys()))
        now = time.monotonic()
        for yf_sym, orig in resolved.items():
            q = batch.get(yf_sym.upper())
            result = _tv_quote_to_result(orig, yf_sym, q)
            if result is not None:
                _price_cache[yf_sym] = (result, now)
    except Exception as e:
        logger.warning("prefetch_quotes failed: %s", e)


def get_stock_quote(symbol: str) -> dict:
    """
    Latest quote for a symbol. TradingView first (fast, live), yfinance fallback.
    Results cached 10 s.
    """
    yf_symbol = resolve_symbol(symbol)
    cached = _price_cache.get(yf_symbol)
    if cached and (time.monotonic() - cached[1]) < PRICE_CACHE_TTL:
        return cached[0]

    # ── TradingView first ─────────────────────────────────────────────────────
    try:
        from app.services import tradingview_service as tv
        q = tv.get_realtime_quote_sync(yf_symbol)
        result = _tv_quote_to_result(symbol, yf_symbol, q)
        if result is not None:
            _price_cache[yf_symbol] = (result, time.monotonic())
            return result
    except Exception as e:
        logger.warning("TradingView quote failed for %s: %s — yfinance fallback", symbol, e)

    # ── yfinance fallback (full info: 52w, dividend, currency, exchange) ───────
    ticker = yf.Ticker(yf_symbol)
    try:
        future = _mds_executor.submit(lambda: ticker.history(period="5d", interval="1d"))
        done, _ = futures_wait([future], timeout=10.0, return_when=FIRST_COMPLETED)
        hist = future.result() if done else pd.DataFrame()
        if not done:
            logger.warning(f"ticker.history timed out for {symbol}")
    except Exception as e:
        logger.warning(f"ticker.history failed for {symbol}: {e}")
        hist = pd.DataFrame()

    # If empty and the user typed a bare Indian stock name (no suffix), try .NS / .BO
    if hist.empty and "." not in yf_symbol and "=" not in yf_symbol and "-" not in yf_symbol:
        for suffix in (".NS", ".BO"):
            ticker = yf.Ticker(yf_symbol + suffix)
            hist = ticker.history(period="5d", interval="1d")
            if not hist.empty:
                yf_symbol = yf_symbol + suffix
                break

    if hist.empty:
        raise ValueError(f"No data for {symbol}")

    latest = hist.iloc[-1]
    prev_close = hist.iloc[-2]["Close"] if len(hist) > 1 else latest["Open"]
    current = float(latest["Close"])
    change = current - float(prev_close)
    change_percent = (change / float(prev_close) * 100) if prev_close else 0.0

    info = {}
    try:
        future = _mds_executor.submit(lambda: ticker.info or {})
        done, _ = futures_wait([future], timeout=8.0, return_when=FIRST_COMPLETED)
        if done:
            info = future.result() or {}
        else:
            logger.warning(f"ticker.info timed out for {symbol} — using empty info")
    except Exception as e:
        logger.warning(f"info() failed for {symbol}: {e}")

    result = {
        "symbol": symbol.upper(),
        "name": info.get("shortName") or info.get("longName") or symbol.upper(),
        "price": current,
        "change": change,
        "change_percent": change_percent,
        "open": float(latest["Open"]),
        "high": float(latest["High"]),
        "low": float(latest["Low"]),
        "previous_close": float(prev_close),
        "volume": int(latest["Volume"]),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "dividend_yield": info.get("dividendYield"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "currency": info.get("currency", "USD"),
        "exchange": info.get("exchange"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "yfinance",
    }
    _price_cache[yf_symbol] = (result, time.monotonic())
    return result


def get_historical_data(symbol: str, period: str = "1y") -> dict:
    """Historical OHLCV data. `period` may be a swing period or intraday timeframe."""
    tf = TIMEFRAME_MAP.get(period) or PERIOD_MAP.get(period)
    if tf is None:
        period = "1y"
        tf = TIMEFRAME_MAP[period]
    yf_period, interval = tf

    yf_symbol = resolve_symbol(symbol)
    ticker = yf.Ticker(yf_symbol)
    hist = ticker.history(period=yf_period, interval=interval)

    # Indian stock fallback: append .NS/.BO if no suffix and no data
    if hist.empty and "." not in yf_symbol and "=" not in yf_symbol and "-" not in yf_symbol:
        for suffix in (".NS", ".BO"):
            ticker = yf.Ticker(yf_symbol + suffix)
            hist = ticker.history(period=yf_period, interval=interval)
            if not hist.empty:
                yf_symbol = yf_symbol + suffix
                break

    if hist.empty:
        raise ValueError(f"No historical data for {symbol}")

    data = []
    for idx, row in hist.iterrows():
        data.append({
            "date": idx.isoformat(),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0,
        })

    return {"symbol": symbol.upper(), "period": period, "interval": interval,
            "currency": guess_currency(symbol), "data": data}


# Map yfinance ticker suffixes → ISO currency code.
SUFFIX_CURRENCY = {
    ".NS": "INR", ".BO": "INR",      # India (NSE / BSE)
    ".L": "GBP",                       # London
    ".T": "JPY",                       # Tokyo
    ".HK": "HKD",                      # Hong Kong
    ".SS": "CNY", ".SZ": "CNY",       # Shanghai / Shenzhen
    ".PA": "EUR", ".DE": "EUR", ".AS": "EUR", ".MI": "EUR", ".MC": "EUR",
    ".TO": "CAD", ".V": "CAD",        # Canada
    ".AX": "AUD",                      # Australia
    ".SW": "CHF",                      # Switzerland
    ".SA": "BRL",                      # Brazil
    ".KS": "KRW", ".KQ": "KRW",       # Korea
}


def guess_currency(symbol: str) -> str:
    """Cheap currency guess from ticker suffix (avoids a slow info() call)."""
    s = symbol.upper()
    if s.endswith("-USD"):           # crypto pairs
        return "USD"
    for suffix, cur in SUFFIX_CURRENCY.items():
        if s.endswith(suffix):
            return cur
    return "USD"


def get_market_summary() -> dict:
    """Major indices snapshot — parallel fetches via shared executor."""
    symbols = list(INDEX_SYMBOLS.keys())

    def _fetch_index(sym):
        try:
            q = get_stock_quote(sym)
            return {
                "symbol": sym,
                "name": INDEX_SYMBOLS[sym],
                "price": q["price"],
                "change": q["change"],
                "change_percent": q["change_percent"],
            }
        except Exception as e:
            logger.warning(f"index {sym} failed: {e}")
            return None

    futures = {_mds_executor.submit(_fetch_index, sym): sym for sym in symbols}
    # Collect in original order
    results_map: dict[str, dict] = {}
    for fut in futures:
        r = fut.result()
        if r:
            results_map[r["symbol"]] = r
    indices = [results_map[s] for s in symbols if s in results_map]

    return {"indices": indices, "timestamp": datetime.now(timezone.utc).isoformat()}


def get_trending_stocks(market: str = "ALL") -> list:
    """Quotes for a market's tickers — parallel, 30-second cache per market."""
    key = (market or "ALL").upper()
    now = time.monotonic()
    cached = _trending_cache.get(key)
    if cached and (now - cached[1]) < TRENDING_CACHE_TTL:
        return cached[0]

    def _fetch_one(sym):
        try:
            return get_stock_quote(sym)
        except Exception as e:
            logger.warning(f"trending {sym} failed: {e}")
            return None

    symbols = symbols_for_market(key)
    futures = [_mds_executor.submit(_fetch_one, sym) for sym in symbols]
    results = [f.result() for f in futures]
    out = [r for r in results if r is not None]

    _trending_cache[key] = (out, time.monotonic())
    return out


def get_top_movers(direction: str = "gainers", limit: int = 5, market: str = "ALL") -> list:
    """
    Top gainers/losers within a market group.
    Gainers = stocks with positive change_percent, sorted descending.
    Losers  = stocks with negative change_percent, sorted ascending.
    If a side has fewer than `limit` items, the other side's data is returned with
    a flipped sort — keeps the cards populated even when one direction is empty.
    """
    quotes = get_trending_stocks(market)
    if direction == "gainers":
        positives = [q for q in quotes if (q.get("change_percent") or 0) > 0]
        positives.sort(key=lambda x: x["change_percent"], reverse=True)
        if len(positives) >= limit:
            return positives[:limit]
        # Pad with flatest small-positive moves so we still return `limit` rows.
        positives.extend(sorted([q for q in quotes if (q.get("change_percent") or 0) == 0],
                                key=lambda x: x["symbol"])[:limit - len(positives)])
        return positives[:limit]
    else:  # losers
        negatives = [q for q in quotes if (q.get("change_percent") or 0) < 0]
        negatives.sort(key=lambda x: x["change_percent"])  # most negative first
        if len(negatives) >= limit:
            return negatives[:limit]
        negatives.extend(sorted([q for q in quotes if (q.get("change_percent") or 0) == 0],
                                key=lambda x: x["symbol"])[:limit - len(negatives)])
        return negatives[:limit]


def search_symbol(query: str) -> list:
    """
    Symbol search — TradingView first (best coverage), Yahoo as fallback.

    TradingView returns every NSE/BSE stock, all global exchanges, crypto from
    Binance/Coinbase, FX from OANDA, commodities, indices. Results are converted
    to yfinance-compatible tickers (RELIANCE → RELIANCE.NS, BTCUSDT → BTC-USD, etc.)
    so the rest of the app (quote, prediction, ICT) works without changes.
    """
    q = query.upper().strip()

    # 1) TradingView search (primary)
    results = search_via_tradingview(query, max_results=25)
    if results:
        return results

    # 2) Yahoo fallback (TV down / network blocked)
    seen: set[str] = set()
    out: list[dict] = []
    try:
        for r in yf.Search(query, max_results=20).quotes:
            sym = r.get("symbol")
            if not sym or sym in seen:
                continue
            seen.add(sym)
            out.append({
                "symbol":   sym,
                "tv_symbol": sym,
                "name":     r.get("shortname") or r.get("longname"),
                "exchange": r.get("exchange"),
                "type":     r.get("quoteType"),
            })
    except Exception as e:
        logger.warning(f"yf.Search fallback failed for {query}: {e}")

    # 3) Direct-ticker bare-name fallback (e.g. user types "ADANIPORTS" with no .NS)
    if not out and q.isalnum() and len(q) >= 2 and "." not in q and "=" not in q and "-" not in q:
        for cand in (f"{q}.NS", f"{q}.BO", q):
            try:
                t = yf.Ticker(cand)
                if not t.history(period="5d", interval="1d").empty:
                    out.append({"symbol": cand, "tv_symbol": cand, "name": cand, "exchange": None, "type": "EQUITY"})
                    break
            except Exception:
                continue

    return out


# Equity exchanges: (key, label, IANA timezone, open (H,M), close (H,M)).
# zoneinfo handles DST automatically, so hours stay correct year-round.
_EQUITY_SESSIONS = [
    ("US",    "US",    "America/New_York", (9, 30), (16, 0)),
    ("INDIA", "India", "Asia/Kolkata",     (9, 15), (15, 30)),
]


def _next_equity_open(local, open_hm: tuple, close_hm: tuple):
    """Next open datetime (in the exchange's local tz) from `local` now."""
    from datetime import timedelta
    open_t = local.replace(hour=open_hm[0], minute=open_hm[1], second=0, microsecond=0)
    minutes = local.hour * 60 + local.minute
    open_min = open_hm[0] * 60 + open_hm[1]
    close_min = close_hm[0] * 60 + close_hm[1]
    # If it's a weekday and we're still before today's open, next open is today.
    if local.weekday() < 5 and minutes < open_min:
        return open_t
    # Otherwise roll forward to the next weekday's open.
    nxt = open_t + timedelta(days=1)
    while nxt.weekday() >= 5:   # skip Sat/Sun
        nxt += timedelta(days=1)
    return nxt


def _equity_state(key: str, label: str, tz_name: str, open_hm: tuple, close_hm: tuple, now_utc: datetime) -> dict:
    local = now_utc.astimezone(ZoneInfo(tz_name))
    minutes = local.hour * 60 + local.minute
    open_min = open_hm[0] * 60 + open_hm[1]
    close_min = close_hm[0] * 60 + close_hm[1]
    is_open = local.weekday() < 5 and open_min <= minutes < close_min
    state = {
        "key": key, "name": label,
        "is_open": is_open,
        "status": "OPEN" if is_open else "CLOSED",
        "local_time": local.strftime("%H:%M"),
    }
    if not is_open:
        nxt_local = _next_equity_open(local, open_hm, close_hm)
        state["next_open"] = nxt_local.astimezone(timezone.utc).isoformat()
        state["next_open_local"] = nxt_local.strftime("%a %H:%M")
    return state


def _next_forex_open(now_utc: datetime):
    """Next FX open (Sunday 17:00 ET) from now, as a tz-aware ET datetime."""
    from datetime import timedelta
    et = now_utc.astimezone(ZoneInfo("America/New_York"))
    # Sunday = weekday 6. Find the next Sunday 17:00 ET that is in the future.
    days_ahead = (6 - et.weekday()) % 7
    cand = (et + timedelta(days=days_ahead)).replace(hour=17, minute=0, second=0, microsecond=0)
    if cand <= et:
        cand += timedelta(days=7)
    return cand


def _forex_open(now_utc: datetime) -> bool:
    """FX trades ~24/5: opens Sun 17:00 ET, closes Fri 17:00 ET."""
    et = now_utc.astimezone(ZoneInfo("America/New_York"))
    wd, hour = et.weekday(), et.hour  # Mon=0 … Sun=6
    if wd == 5:                       # Saturday — closed
        return False
    if wd == 6:                       # Sunday — opens 17:00 ET
        return hour >= 17
    if wd == 4:                       # Friday — closes 17:00 ET
        return hour < 17
    return True                       # Mon–Thu — open


def is_market_open() -> dict:
    """
    Status across every asset class (equities, crypto, forex, commodities).

    `markets` lists each with is_open. Crypto is 24/7; forex & commodities
    run ~24/5. `is_open`/`status` = whether ANY market is open (kept for
    backward compatibility).
    """
    now = datetime.now(timezone.utc)

    markets = [_equity_state(k, lbl, tz, o, c, now) for k, lbl, tz, o, c in _EQUITY_SESSIONS]

    fx_open = _forex_open(now)
    markets.append({"key": "CRYPTO", "name": "Crypto", "is_open": True,
                    "status": "OPEN", "local_time": now.strftime("%H:%M") + " UTC"})

    fx_entry = {"key": "FOREX", "name": "Forex", "is_open": fx_open,
                "status": "OPEN" if fx_open else "CLOSED", "local_time": ""}
    # Commodity futures (CME) run nearly 24/5 — approximate with the FX window.
    cm_entry = {"key": "COMMODITIES", "name": "Commodities", "is_open": fx_open,
                "status": "OPEN" if fx_open else "CLOSED", "local_time": ""}
    if not fx_open:
        nxt = _next_forex_open(now)
        for e in (fx_entry, cm_entry):
            e["next_open"] = nxt.astimezone(timezone.utc).isoformat()
            e["next_open_local"] = nxt.astimezone(ZoneInfo("America/New_York")).strftime("%a %H:%M ET")
    markets.append(fx_entry)
    markets.append(cm_entry)

    any_open = any(m["is_open"] for m in markets)
    # When EVERYTHING is closed (weekend), surface the soonest next open so the
    # UI can show an interactive countdown.
    next_opens = [m["next_open"] for m in markets if not m["is_open"] and m.get("next_open")]
    soonest = min(next_opens) if next_opens else None
    return {
        "is_open": any_open,
        "status": "OPEN" if any_open else "CLOSED",
        "markets": markets,
        "next_open": None if any_open else soonest,
        "timestamp": now.isoformat(),
    }
