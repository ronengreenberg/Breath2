"""Opportunity scanners. Pure functions over data from sources.py.

Each scanner returns a list of opportunity dicts:
  {"type", "asset", "title", "edge_pct", "unit", "details", "risks", "severity"}
edge_pct is the estimated net edge used to rank results; unit says how to read it:
  "trade" - percent per round trip, after trading fees
  "apr"   - annualized percent
  "score" - stock signals have no measurable edge, so this is a signal-strength
            score used only to rank stocks against each other
severity is "normal" or "suspicious" (looks too good to be real).
"""
from __future__ import annotations

from datetime import date
from statistics import mean


def _opp(type_, asset, title, edge, unit, details, risks, severity="normal"):
    return {"type": type_, "asset": asset, "title": title, "edge_pct": round(edge, 3), "unit": unit,
            "details": details, "risks": risks, "severity": severity}


# ---------- 1. Cross-exchange spot arbitrage ----------

def cross_exchange_arb(books: dict, coins, fees: dict, min_net_pct: float, suspicious_pct: float):
    """Buy at the cheapest ask on one exchange, sell at the richest bid on another."""
    out = []
    for coin in coins:
        quotes = {ex: b[coin] for ex, b in books.items() if coin in b and b[coin]["ask"] > 0}
        if len(quotes) < 2:
            continue
        buy_ex = min(quotes, key=lambda ex: quotes[ex]["ask"])
        sell_ex = max(quotes, key=lambda ex: quotes[ex]["bid"])
        if buy_ex == sell_ex:
            continue
        ask, bid = quotes[buy_ex]["ask"], quotes[sell_ex]["bid"]
        gross = (bid / ask - 1) * 100
        net = gross - fees.get(buy_ex, 0.1) - fees.get(sell_ex, 0.1)
        if net < min_net_pct:
            continue
        risks = ["עמלת משיכה וזמן העברה לא נכללים בחישוב",
                 "בדוק את עומק ספר הפקודות: ייתכן שברמה העליונה יש כמות קטנה"]
        severity = "normal"
        if gross >= suspicious_pct:
            severity = "suspicious"
            risks.insert(0, "פער חשוד: כנראה הפקדות או משיכות חסומות, או שזה טוקן אחר עם אותו שם")
        out.append(_opp("cross-exchange-arb", coin, f"קנייה ב-{buy_ex}, מכירה ב-{sell_ex}", net, "trade",
                        {"buy_exchange": buy_ex, "sell_exchange": sell_ex, "buy_ask": ask, "sell_bid": bid,
                         "gross_pct": round(gross, 3)}, risks, severity))
    return out


# ---------- 2. Triangular arbitrage on one exchange ----------

def triangular_arb(symbols: dict, books: dict, start: str, fee_pct: float, min_net_pct: float):
    """start -> A -> B -> start using top-of-book prices. Fee is charged on each of 3 legs."""
    # edges[x][y] = (symbol, side): how to convert asset x into asset y
    edges: dict[str, dict[str, tuple[str, str]]] = {}
    for sym, (base, quote) in symbols.items():
        if sym not in books or books[sym]["bid"] <= 0 or books[sym]["ask"] <= 0:
            continue
        edges.setdefault(quote, {})[base] = (sym, "buy")   # spend quote, get base at ask
        edges.setdefault(base, {})[quote] = (sym, "sell")  # spend base, get quote at bid

    def convert(amount, sym, side):
        b = books[sym]
        return amount / b["ask"] if side == "buy" else amount * b["bid"]

    keep = 1 - fee_pct / 100
    out = []
    for a, (s1, d1) in edges.get(start, {}).items():
        for b, (s2, d2) in edges.get(a, {}).items():
            if b == start or start not in edges.get(b, {}):
                continue
            s3, d3 = edges[b][start]
            amt = convert(1.0, s1, d1) * keep
            amt = convert(amt, s2, d2) * keep
            amt = convert(amt, s3, d3) * keep
            net = (amt - 1) * 100
            if net >= min_net_pct:
                out.append(_opp("triangular-arb", f"{a}/{b}", f"{start} → {a} → {b} → {start}", net, "trade",
                                {"legs": [f"{d1} {s1}", f"{d2} {s2}", f"{d3} {s3}"]},
                                ["המחירים זזים באלפיות שנייה: דורש ביצוע מיידי",
                                 "הכמות ברמה העליונה של הספר בדרך כלל קטנה"]))
    return out


# ---------- 3. Funding-rate carry (long spot, short perpetual) ----------

def funding_carry(rates: dict, min_apr_pct: float, fee_pct_round_trip: float):
    out = []
    for ex, by_coin in rates.items():
        for coin, f in by_coin.items():
            per_year = 24 / f["hours"] * 365
            apr = f["rate"] * per_year * 100
            if abs(apr) < min_apr_pct:
                continue
            if apr > 0:
                title = f"ספוט לונג + שורט חוזה ב-{ex}"
            else:
                title = f"ספוט שורט (בהשאלה) + לונג חוזה ב-{ex}"
            out.append(_opp("funding-carry", coin, title, abs(apr) - fee_pct_round_trip, "apr",
                            {"exchange": ex, "funding_per_interval_pct": round(f["rate"] * 100, 4),
                             "interval_hours": f["hours"], "gross_apr_pct": round(apr, 1)},
                            ["ה-funding משתנה בכל תקופה: התשואה השנתית היא תמונת מצב",
                             "השורט על החוזה עלול להיחסל בקפיצה חדה אם אין מספיק בטחונות"]))
    return out


# ---------- 4. Stock technical signals ----------

def rsi(closes, period=14):
    if len(closes) <= period:
        return None
    gains, losses = [], []
    for prev, cur in zip(closes[:-1], closes[1:]):
        ch = cur - prev
        gains.append(max(ch, 0))
        losses.append(max(-ch, 0))
    avg_g, avg_l = mean(gains[:period]), mean(losses[:period])
    for g, l in zip(gains[period:], losses[period:]):  # Wilder smoothing
        avg_g = (avg_g * (period - 1) + g) / period
        avg_l = (avg_l * (period - 1) + l) / period
    if avg_l == 0:
        return 100.0
    return 100 - 100 / (1 + avg_g / avg_l)


def stock_signals(symbol: str, hist: dict, cfg: dict):
    closes, vols = hist.get("close", []), hist.get("volume", [])
    if len(closes) < 60:
        return []
    price = hist["price"]
    out = []
    r = rsi(closes)
    sma200 = mean(closes[-200:]) if len(closes) >= 200 else None
    hi52, lo52 = max(closes[-252:]), min(closes[-252:])
    avg_vol = mean(vols[-21:-1]) or 1
    vol_ratio = vols[-1] / avg_vol
    base = {"price": round(price, 2), "rsi14": round(r, 1) if r else None,
            "pct_from_52w_high": round((price / hi52 - 1) * 100, 1),
            "volume_vs_20d": round(vol_ratio, 2), "spark": [round(c, 2) for c in closes[-60:]]}

    if r is not None and r <= cfg["rsi_oversold"] and sma200 and price > sma200:
        out.append(_opp("stock-oversold-uptrend", symbol, f"מכירת יתר (RSI {r:.0f}) בתוך מגמת עלייה",
                         cfg["rsi_oversold"] - r, "score", base,
                         ["מכירת יתר יכולה להימשך: בדוק חדשות שהסבירו את הירידה"]))
    if price >= max(closes[-21:-1]) and vol_ratio >= cfg["breakout_volume_ratio"]:
        out.append(_opp("stock-breakout", symbol, f"פריצת שיא 20 יום במחזור פי {vol_ratio:.1f}",
                         vol_ratio, "score", base, ["פריצות נכשלות לא מעט: שים סטופ מתחת לטווח"]))
    if price <= lo52 * (1 + cfg["near_52w_low_pct"] / 100):
        out.append(_opp("stock-52w-low", symbol, f"במרחק עד {cfg['near_52w_low_pct']}% משפל שנתי",
                         (hi52 / price - 1) * 100, "score", base,
                         ["מניה זולה יכולה להיות זולה מסיבה טובה (מלכודת ערך)"]))
    return out


# ---------- 5. Merger arbitrage (deals you list in deals.json) ----------

def merger_arb(deal: dict, target_price: float | None, acquirer_price: float | None, today: date | None = None):
    today = today or date.today()
    if not target_price:
        return []
    value = deal.get("cash", 0) + deal.get("stock_ratio", 0) * (acquirer_price or 0)
    if deal.get("stock_ratio") and not acquirer_price:
        return []
    spread = (value / target_price - 1) * 100
    days = max((date.fromisoformat(deal["expected_close"]) - today).days, 1)
    annual = spread * 365 / days
    return [_opp("merger-arb", deal["target"], f"נרכשת על ידי {deal.get('acquirer', '?')}", annual, "apr",
                 {"deal_value": round(value, 2), "target_price": target_price,
                  "spread_pct": round(spread, 2), "days_to_close": days,
                  "annualized_pct": round(annual, 1), "note": deal.get("note", "")},
                 ["אם העסקה מתבטלת המניה עלולה לרדת חזרה למחיר שלפני ההכרזה",
                  "עיכובים רגולטוריים מורידים את התשואה השנתית"])]
