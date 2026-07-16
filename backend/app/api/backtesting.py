"""
Backtesting API — ICT/SMC Professional Strategy Engine.

Endpoints:
  GET /api/backtest/{symbol}                — single strategy backtest
  GET /api/backtest/{symbol}/leaderboard    — run all 8 strategies, return ranked
  GET /api/backtest/{symbol}/live_signals   — current signal from top ICT strategies
  GET /api/backtest/universe/leaderboard    — global ranking across all asset classes
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from app.services.backtesting_service import (
    run_backtest,
    run_all_strategies,
    get_live_signal,
    run_universe_leaderboard,
    STRATEGY_REGISTRY,
    UNIVERSE,
)

router = APIRouter()

VALID_PERIODS = {"1mo", "2mo", "6mo", "1y", "2y", "3y", "5y"}
VALID_STRATEGIES = set(STRATEGY_REGISTRY.keys())
# ICT/SMC is INTRADAY ONLY. Daily TF is rejected for ICT — trades MUST open
# and close the same session. For long-term stock holding, use AI Predictions.
VALID_INTERVALS = {"15m", "30m", "1h"}


@router.get("/{symbol}")
def backtest_single(
    symbol: str,
    strategy: str = Query("BOS_FVG", description="ICT/SMC strategy name"),
    period: str = Query("2y", description="Historical period: 6mo | 1y | 2y | 3y | 5y"),
    initial_capital: float = Query(10000.0, ge=100, le=10_000_000),
    sl_atr_mult: float = Query(1.5, ge=0.5, le=5.0),
    tp_atr_mult: float = Query(2.5, ge=0.5, le=10.0),
    allow_short: bool = Query(False),
    filter_news: bool = Query(True, description="Skip entries on High/Medium impact news days"),
    interval: str = Query("15m", description="Bar interval: 15m | 30m | 1h (ICT is intraday only)"),
):
    """
    Run a single ICT/SMC strategy backtest.

    interval defaults to 1h (intraday, consistent with ICT/SMC concepts).
    For 1h/30m/15m, period is capped to yfinance limits (max 730d for 1h).

    Available strategies:
    - BOS_FVG         Break of Structure + Fair Value Gap
    - CHOCH_FVG       Change of Character + Fair Value Gap
    - MSS_OrderBlock  Market Structure Shift + Order Block (highest confidence)
    - LiqSweep_FVG    Liquidity Sweep + FVG (stop-hunt reversal)
    - SR_Bounce       Support/Resistance swing-level bounce
    - RSI_OTE         RSI in Optimal Trade Entry zone (62-79% Fibonacci)
    - PriceAction     Engulfing + Hammer/Shooting-Star patterns
    - MA_FVG          EMA 21/55 crossover + FVG confirmation
    """
    period   = period.lower()
    strategy = strategy.strip()
    interval = interval.lower()

    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid period '{period}'. Use: {', '.join(sorted(VALID_PERIODS))}",
        )
    if strategy not in VALID_STRATEGIES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown strategy '{strategy}'. Available: {', '.join(sorted(VALID_STRATEGIES))}",
        )
    if interval not in VALID_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid interval '{interval}'. Use: {', '.join(sorted(VALID_INTERVALS))}",
        )

    try:
        return run_backtest(
            symbol=symbol.upper(),
            strategy=strategy,
            period=period,
            initial_capital=initial_capital,
            sl_atr_mult=sl_atr_mult,
            tp_atr_mult=tp_atr_mult,
            allow_short=allow_short,
            filter_news=filter_news,
            interval=interval,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/universe/leaderboard")
def universe_leaderboard(
    period: str = Query("5y"),
    filter_news: bool = Query(True),
    force: bool = Query(False, description="Bypass 24h cache and recompute"),
    background_tasks: BackgroundTasks = None,
):
    """
    Run all 8 ICT strategies across ~28 symbols (US stocks, Indian stocks, Forex,
    Crypto, Commodities) and return global strategy rankings.

    First run takes 2-5 minutes. Results are cached for 24 hours.
    Set force=true to trigger recomputation.
    """
    # If cache is cold and force=False, kick off background computation and return
    # a "pending" response immediately so the client can poll.
    from app.services.backtesting_service import _universe_cache, _universe_cache_ts
    import time as _t
    from app.services.backtesting_service import UNIVERSE_CACHE_TTL

    if _universe_cache is None and not force:
        # Start computation in background
        if background_tasks:
            background_tasks.add_task(run_universe_leaderboard, period, filter_news)
        return {
            "status": "computing",
            "message": "Universe backtest started in background (~2-5 min for 28 symbols). Poll again in 30s.",
            "universe": UNIVERSE,
        }

    try:
        return run_universe_leaderboard(period=period, filter_news=filter_news, force=force)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/live_signals")
def live_signals(
    symbol: str,
    strategies: str = Query(
        None,
        description="Comma-separated strategy names. Defaults to top 3 from universe ranking.",
    ),
):
    """
    Apply ICT/SMC strategies to the most recent bars and return current live signals.

    Uses the globally best strategies (by avg Sharpe across all assets) unless
    specific strategy names are provided.
    """
    from app.services.backtesting_service import _universe_cache

    # Decide which strategies to run
    if strategies:
        requested = [s.strip() for s in strategies.split(",") if s.strip()]
        invalid = [s for s in requested if s not in STRATEGY_REGISTRY]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown strategies: {invalid}. Valid: {list(STRATEGY_REGISTRY.keys())}",
            )
        strategy_list = requested
    elif _universe_cache and _universe_cache.get("top_strategies"):
        strategy_list = _universe_cache["top_strategies"][:3]
    else:
        # Default to our historically best performers if universe hasn't been run yet
        strategy_list = ["MSS_OrderBlock", "BOS_FVG", "CHOCH_FVG"]

    results = []
    errors = []
    for strat in strategy_list:
        try:
            results.append(get_live_signal(symbol.upper(), strat))
        except Exception as e:
            errors.append({"strategy": strat, "error": str(e)})

    payload = {
        "symbol":           symbol.upper(),
        "signals":          results,
        "errors":           errors,
        "strategies_used":  strategy_list,
        "source":           "universe_top3" if _universe_cache else "defaults",
    }
    # Spot metals proxied to futures → present entry/SL/TP on the spot scale.
    from app.services.spot_pricing import scale_ict_signals
    return scale_ict_signals(symbol.upper(), payload)


@router.get("/{symbol}/leaderboard")
def backtest_leaderboard(
    symbol: str,
    period: str = Query("2y", description="Historical period: 6mo | 1y | 2y | 3y | 5y"),
    initial_capital: float = Query(10000.0, ge=100, le=10_000_000),
    sl_atr_mult: float = Query(1.5, ge=0.5, le=5.0),
    tp_atr_mult: float = Query(2.5, ge=0.5, le=10.0),
    allow_short: bool = Query(False),
    filter_news: bool = Query(True),
    interval: str = Query("15m", description="Bar interval: 15m | 30m | 1h (ICT is intraday only)"),
):
    """
    Run all 8 ICT/SMC strategies and return a leaderboard ranked by Sharpe ratio.

    interval defaults to 1h (ICT/SMC intraday discipline — no overnight holds).
    This may take 15-30 seconds as it runs 8 simulations.
    The response includes:
    - leaderboard: sorted list with metrics for each strategy
    - best_strategy: name of the highest Sharpe ratio strategy
    - equity_curve: equity curve of the best strategy
    - trades: last 100 trades of the best strategy
    """
    period   = period.lower()
    interval = interval.lower()

    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid period '{period}'. Use: {', '.join(sorted(VALID_PERIODS))}",
        )
    if interval not in VALID_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid interval '{interval}'. Use: {', '.join(sorted(VALID_INTERVALS))}",
        )

    try:
        return run_all_strategies(
            symbol=symbol.upper(),
            period=period,
            initial_capital=initial_capital,
            sl_atr_mult=sl_atr_mult,
            tp_atr_mult=tp_atr_mult,
            allow_short=allow_short,
            filter_news=filter_news,
            interval=interval,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/session-analysis")
def session_analysis(
    symbol: str,
    strategy: str = Query("MSS_OrderBlock"),
    period: str = Query("60d"),
    interval: str = Query("15m"),
    sl_atr_mult: float = Query(1.5, ge=0.5, le=5.0),
    tp_atr_mult: float = Query(2.5, ge=0.5, le=10.0),
    max_hold: int = Query(20, ge=3, le=100, description="Bars to hold before expiry"),
):
    """
    Session-by-session (kill-zone) breakdown of ICT signal performance.

    Runs `strategy` over recent intraday history, buckets every entry by the
    trading session / kill zone it fired in, and reports win rate and average
    realised R:R per bucket — i.e. which kill zones produce the best signals.
    """
    if strategy not in STRATEGY_REGISTRY:
        raise HTTPException(status_code=422, detail=f"Unknown strategy '{strategy}'")

    from app.services.backtesting_service import _fetch_ohlcv, _atr
    from app.services.signal_service import SignalEngine

    try:
        df = _fetch_ohlcv(symbol.upper(), period, interval)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    sigs = STRATEGY_REGISTRY[strategy](df)
    atr = _atr(df["high"], df["low"], df["close"])
    high, low, close = df["high"].values, df["low"].values, df["close"].values
    n = len(df)

    def _blank():
        return {"signals": 0, "wins": 0, "losses": 0, "expired": 0, "r_sum": 0.0}
    by_session: dict[str, dict] = {}
    by_killzone: dict[str, dict] = {}
    win_r = tp_atr_mult / sl_atr_mult   # R gained on a win (loss = -1R)

    for i in range(n - 1):
        sig = str(sigs.iloc[i])
        if sig not in ("BUY", "SELL"):
            continue
        a = float(atr.iloc[i] or 0)
        if a <= 0:
            continue
        entry = float(close[i])
        if sig == "BUY":
            sl, tp = entry - sl_atr_mult * a, entry + tp_atr_mult * a
        else:
            sl, tp = entry + sl_atr_mult * a, entry - tp_atr_mult * a

        outcome, r = "expired", 0.0
        for j in range(i + 1, min(i + 1 + max_hold, n)):
            if sig == "BUY":
                if low[j] <= sl:  outcome, r = "loss", -1.0; break
                if high[j] >= tp: outcome, r = "win", win_r; break
            else:
                if high[j] >= sl: outcome, r = "loss", -1.0; break
                if low[j] <= tp:  outcome, r = "win", win_r; break

        ts = df.index[i]
        session = SignalEngine.get_session(ts)
        kz = SignalEngine.get_kill_zone(ts) or "none"
        for bucket, keyed in ((by_session, session), (by_killzone, kz)):
            b = bucket.setdefault(keyed, _blank())
            b["signals"] += 1
            b["r_sum"] += r
            b[{"win": "wins", "loss": "losses", "expired": "expired"}[outcome]] += 1

    def _summ(bucket: dict) -> list[dict]:
        rows = []
        for name, b in bucket.items():
            decided = b["wins"] + b["losses"]
            rows.append({
                "session": name,
                "signals": b["signals"],
                "wins": b["wins"], "losses": b["losses"], "expired": b["expired"],
                "win_rate": round(b["wins"] / decided * 100, 1) if decided else 0.0,
                "avg_rr": round(b["r_sum"] / b["signals"], 2) if b["signals"] else 0.0,
            })
        return sorted(rows, key=lambda x: x["avg_rr"], reverse=True)

    sessions = _summ(by_session)
    killzones = _summ(by_killzone)
    best = max(killzones, key=lambda x: x["avg_rr"], default=None)

    return {
        "symbol": symbol.upper(),
        "strategy": strategy,
        "interval": interval,
        "period": period,
        "total_signals": int(sum(b["signals"] for b in by_session.values())),
        "by_session": sessions,
        "by_kill_zone": killzones,
        "best_kill_zone": best["session"] if best else None,
        "rr_config": {"sl_atr": sl_atr_mult, "tp_atr": tp_atr_mult, "max_hold_bars": max_hold},
    }
