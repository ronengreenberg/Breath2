"""Public market-data sources (no API keys needed).

Every fetcher returns plain dicts so scanners stay testable with fixture data.
A failing source returns an empty result and records the error instead of
crashing the whole run.
"""
from __future__ import annotations

import requests

TIMEOUT = 15
HEADERS = {"User-Agent": "Mozilla/5.0 (opportunity-agent)"}
ERRORS: list[str] = []


def _get(url: str, **params):
    r = requests.get(url, params=params or None, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _safe(name, fn):
    try:
        return fn()
    except Exception as e:  # network, HTTP, schema change
        ERRORS.append(f"{name}: {e}")
        return {}


# ---------- spot order books: {"BTC": {"bid": .., "ask": ..}, ...} (USDT quote) ----------

def _binance_spot():
    out = {}
    for t in _get("https://api.binance.com/api/v3/ticker/bookTicker"):
        s = t["symbol"]
        if s.endswith("USDT"):
            out[s[:-4]] = {"bid": float(t["bidPrice"]), "ask": float(t["askPrice"])}
    return out


def _okx_spot():
    out = {}
    for t in _get("https://www.okx.com/api/v5/market/tickers", instType="SPOT")["data"]:
        base, _, quote = t["instId"].partition("-")
        if quote == "USDT" and t["bidPx"] and t["askPx"]:
            out[base] = {"bid": float(t["bidPx"]), "ask": float(t["askPx"])}
    return out


def _bybit_spot():
    out = {}
    for t in _get("https://api.bybit.com/v5/market/tickers", category="spot")["result"]["list"]:
        s = t["symbol"]
        if s.endswith("USDT") and t.get("bid1Price") and t.get("ask1Price"):
            out[s[:-4]] = {"bid": float(t["bid1Price"]), "ask": float(t["ask1Price"])}
    return out


def _kucoin_spot():
    out = {}
    for t in _get("https://api.kucoin.com/api/v1/market/allTickers")["data"]["ticker"]:
        base, _, quote = t["symbol"].partition("-")
        if quote == "USDT" and t.get("buy") and t.get("sell"):
            out[base] = {"bid": float(t["buy"]), "ask": float(t["sell"])}
    return out


def _gate_spot():
    out = {}
    for t in _get("https://api.gateio.ws/api/v4/spot/tickers"):
        base, _, quote = t["currency_pair"].partition("_")
        if quote == "USDT" and t.get("highest_bid") and t.get("lowest_ask"):
            out[base] = {"bid": float(t["highest_bid"]), "ask": float(t["lowest_ask"])}
    return out


SPOT_SOURCES = {
    "binance": _binance_spot,
    "okx": _okx_spot,
    "bybit": _bybit_spot,
    "kucoin": _kucoin_spot,
    "gate": _gate_spot,
}


def spot_books(exchanges) -> dict[str, dict]:
    return {ex: _safe(ex, SPOT_SOURCES[ex]) for ex in exchanges if ex in SPOT_SOURCES}


# ---------- Binance spot market structure (for triangular arbitrage) ----------

def binance_triangle_data():
    """Returns (symbols, books): symbols = {sym: (base, quote)}, books = {sym: {bid, ask}}."""
    def fetch():
        info = _get("https://api.binance.com/api/v3/exchangeInfo")
        symbols = {
            s["symbol"]: (s["baseAsset"], s["quoteAsset"])
            for s in info["symbols"] if s["status"] == "TRADING"
        }
        books = {
            t["symbol"]: {"bid": float(t["bidPrice"]), "ask": float(t["askPrice"])}
            for t in _get("https://api.binance.com/api/v3/ticker/bookTicker")
        }
        return {"symbols": symbols, "books": books}
    d = _safe("binance-triangle", fetch)
    return d.get("symbols", {}), d.get("books", {})


# ---------- perpetual funding rates: {"BTC": rate_per_interval, ...} ----------

def _binance_funding():
    out = {}
    for t in _get("https://fapi.binance.com/fapi/v1/premiumIndex"):
        s = t["symbol"]
        if s.endswith("USDT"):
            out[s[:-4]] = {"rate": float(t["lastFundingRate"]), "hours": 8}
    return out


def _bybit_funding():
    out = {}
    for t in _get("https://api.bybit.com/v5/market/tickers", category="linear")["result"]["list"]:
        s = t["symbol"]
        if s.endswith("USDT") and t.get("fundingRate"):
            hours = int(t.get("fundingIntervalHour") or 8)
            out[s[:-4]] = {"rate": float(t["fundingRate"]), "hours": hours}
    return out


FUNDING_SOURCES = {"binance": _binance_funding, "bybit": _bybit_funding}


def funding_rates(exchanges) -> dict[str, dict]:
    return {ex: _safe(f"{ex}-funding", FUNDING_SOURCES[ex]) for ex in exchanges if ex in FUNDING_SOURCES}


# ---------- stocks (Yahoo Finance chart API) ----------

def stock_history(symbol: str, rng: str = "1y") -> dict:
    """Returns {"close": [...], "volume": [...], "price": last} or {} on failure."""
    def fetch():
        d = _get(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}", range=rng, interval="1d")
        res = d["chart"]["result"][0]
        q = res["indicators"]["quote"][0]
        rows = [(c, v) for c, v in zip(q["close"], q["volume"]) if c is not None]
        return {
            "close": [c for c, _ in rows],
            "volume": [v or 0 for _, v in rows],
            "price": res["meta"].get("regularMarketPrice") or rows[-1][0],
        }
    return _safe(f"yahoo:{symbol}", fetch)
