"""
News service using yfinance built-in news + VADER sentiment with finance-keyword post-correction.
No NewsAPI key required.

VADER handles negation, intensifiers, emojis and works much better than TextBlob on news
headlines. We additionally tilt the score using finance-specific bearish/bullish keywords
because generic English sentiment can miss things like 'surge in costs threatens margins'.
"""
import logging
import re
from datetime import datetime

import yfinance as yf
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logger = logging.getLogger(__name__)
_vader = SentimentIntensityAnalyzer()

# Finance-specific keyword lexicon: phrase → polarity shift
# Phrases are checked case-insensitively as whole words.
BEARISH_TERMS = {
    "downgrade": -0.4, "downgraded": -0.4,
    "miss": -0.3, "missed estimates": -0.5, "misses estimates": -0.5,
    "lawsuit": -0.4, "lawsuits": -0.4, "sued": -0.3,
    "probe": -0.3, "investigation": -0.3, "fraud": -0.6,
    "layoff": -0.4, "layoffs": -0.4, "cuts jobs": -0.4,
    "loss": -0.3, "losses": -0.3, "warns": -0.4, "warning": -0.3,
    "plunge": -0.5, "plunges": -0.5, "tumble": -0.4, "tumbles": -0.4,
    "slump": -0.4, "slumps": -0.4, "slide": -0.2, "slides": -0.2,
    "weak": -0.2, "weakens": -0.3, "bearish": -0.4,
    "recall": -0.4, "recalled": -0.4,
    "threat": -0.3, "threatens": -0.3, "threatened": -0.3,
    "concerns": -0.2, "concern": -0.2, "fears": -0.3,
    "shortage": -0.3, "delays": -0.2, "delay": -0.2,
    "unavoidable": -0.2, "headwind": -0.3, "headwinds": -0.3,
    "decline": -0.3, "declines": -0.3, "declined": -0.3,
    "drop": -0.3, "drops": -0.3, "dropped": -0.3,
    "cut": -0.2, "cuts": -0.2, "slashed": -0.4,
    "underperform": -0.4, "sell": -0.2, "selloff": -0.4,
    "risk": -0.15, "risks": -0.15, "risky": -0.2,
    "debt": -0.1, "loss-making": -0.4,
}
BULLISH_TERMS = {
    "upgrade": 0.4, "upgraded": 0.4,
    "beats": 0.4, "beat estimates": 0.5, "beats estimates": 0.5,
    "surge": 0.4, "surges": 0.4, "surged": 0.4,
    "soars": 0.5, "soared": 0.5, "rally": 0.4, "rallies": 0.4,
    "jumps": 0.3, "jumped": 0.3, "climb": 0.2, "climbs": 0.2,
    "record": 0.3, "all-time high": 0.5, "all time high": 0.5,
    "outperform": 0.4, "outperforms": 0.4, "outperformed": 0.4,
    "buy rating": 0.4, "strong buy": 0.5,
    "growth": 0.2, "growing": 0.2, "expanding": 0.2,
    "profit": 0.2, "profits": 0.2, "profitable": 0.3,
    "bullish": 0.4, "rebound": 0.3, "rebounds": 0.3,
    "exceed": 0.3, "exceeds": 0.3, "exceeded": 0.3,
    "raised guidance": 0.5, "raised forecast": 0.4,
    "partnership": 0.2, "deal": 0.15, "acquires": 0.2, "acquisition": 0.2,
    "approval": 0.3, "approved": 0.3,
}


def _keyword_shift(text: str) -> float:
    """Sum of polarity shifts for finance keywords present (clamped)."""
    t = text.lower()
    shift = 0.0
    for term, delta in {**BEARISH_TERMS, **BULLISH_TERMS}.items():
        if re.search(r"\b" + re.escape(term) + r"\b", t):
            shift += delta
    return max(-1.0, min(1.0, shift))


def _analyze_sentiment(text: str) -> dict:
    if not text:
        return {"sentiment": "NEUTRAL", "score": 0.0}
    vs = _vader.polarity_scores(text)
    base = vs["compound"]  # range -1..+1
    fin = _keyword_shift(text)
    # Combine: VADER is the base, finance keywords nudge it
    score = max(-1.0, min(1.0, 0.6 * base + 0.4 * fin))

    # Tighter thresholds since we now have stronger signal
    if score >= 0.15:
        label = "POSITIVE"
    elif score <= -0.15:
        label = "NEGATIVE"
    else:
        label = "NEUTRAL"
    return {"sentiment": label, "score": round(float(score), 3)}


def _normalize_article(raw: dict, symbol: str = None) -> dict:
    # yfinance news structure changed; handle both formats
    content = raw.get("content", raw)
    title = content.get("title") or raw.get("title", "")
    summary = content.get("summary") or content.get("description") or raw.get("summary", "")
    pub_date = content.get("pubDate") or raw.get("providerPublishTime")
    if isinstance(pub_date, int):
        pub_date = datetime.fromtimestamp(pub_date).isoformat()

    url = ""
    if isinstance(content.get("canonicalUrl"), dict):
        url = content["canonicalUrl"].get("url", "")
    if not url:
        url = content.get("link") or raw.get("link", "")

    provider = content.get("provider", {})
    source = provider.get("displayName") if isinstance(provider, dict) else raw.get("publisher", "Yahoo Finance")

    thumbnail = ""
    thumb = content.get("thumbnail")
    if isinstance(thumb, dict):
        resolutions = thumb.get("resolutions", [])
        if resolutions:
            thumbnail = resolutions[0].get("url", "")
    elif isinstance(raw.get("thumbnail"), dict):
        resolutions = raw["thumbnail"].get("resolutions", [])
        if resolutions:
            thumbnail = resolutions[0].get("url", "")

    full_text = f"{title}. {summary}"
    sentiment = _analyze_sentiment(full_text)

    return {
        "title": title,
        "summary": summary,
        "source": source or "Yahoo Finance",
        "url": url,
        "published_at": pub_date,
        "thumbnail": thumbnail,
        "symbol": symbol,
        "sentiment": sentiment["sentiment"],
        "sentiment_score": sentiment["score"],
    }


def get_stock_news(symbol: str, limit: int = 10) -> list:
    """News for a specific symbol with sentiment."""
    ticker = yf.Ticker(symbol)
    try:
        news = ticker.news or []
    except Exception as e:
        logger.warning(f"news failed for {symbol}: {e}")
        return []

    articles = []
    for n in news[:limit]:
        try:
            articles.append(_normalize_article(n, symbol=symbol))
        except Exception as e:
            logger.warning(f"normalize failed: {e}")
    return articles


def get_general_news(limit: int = 20) -> list:
    """Aggregate news from popular tickers."""
    aggregate = []
    seen_urls = set()
    seen_titles = set()
    for sym in ["AAPL", "MSFT", "GOOGL", "TSLA", "AMZN", "NVDA", "META", "NFLX", "SPY"]:
        if len(aggregate) >= limit:
            break
        try:
            arts = get_stock_news(sym, limit=5)
        except Exception:
            continue
        for art in arts:
            if not art.get("title"):
                continue
            key = art.get("url") or art["title"]
            if key in seen_urls or art["title"] in seen_titles:
                continue
            seen_urls.add(key)
            seen_titles.add(art["title"])
            aggregate.append(art)
            if len(aggregate) >= limit:
                break
    return aggregate[:limit]


def analyze_text_sentiment(text: str) -> dict:
    s = _analyze_sentiment(text)
    return {"text": text, **s}
