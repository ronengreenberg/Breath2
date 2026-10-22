"""Offline tests for the scanner math, using hand-made fixture prices."""
from datetime import date

import scanners

FEES = {"a": 0.1, "b": 0.1}


def test_cross_exchange_finds_spread_after_fees():
    books = {"a": {"X": {"bid": 99, "ask": 100}}, "b": {"X": {"bid": 101, "ask": 102}}}
    [o] = scanners.cross_exchange_arb(books, ["X"], FEES, 0.3, 5)
    assert o["title"] == "X: buy on a, sell on b"
    assert abs(o["edge_pct"] - 0.8) < 1e-9  # 1% gross - 0.2% fees


def test_cross_exchange_skips_when_fees_eat_spread():
    books = {"a": {"X": {"bid": 99, "ask": 100}}, "b": {"X": {"bid": 100.1, "ask": 101}}}
    assert scanners.cross_exchange_arb(books, ["X"], FEES, 0.0, 5) == []


def test_cross_exchange_flags_suspicious_spread():
    books = {"a": {"X": {"bid": 99, "ask": 100}}, "b": {"X": {"bid": 120, "ask": 121}}}
    [o] = scanners.cross_exchange_arb(books, ["X"], FEES, 0.3, 5)
    assert "suspicious" in o["risks"][0]


def test_triangular_detects_mispriced_cycle():
    symbols = {"AUSDT": ("A", "USDT"), "BA": ("B", "A"), "BUSDT": ("B", "USDT")}
    books = {"AUSDT": {"bid": 9.99, "ask": 10.0},
             "BA": {"bid": 1.99, "ask": 2.0},
             "BUSDT": {"bid": 20.5, "ask": 20.6}}
    opps = scanners.triangular_arb(symbols, books, "USDT", 0.1, 0.0)
    best = max(opps, key=lambda o: o["edge_pct"])
    assert best["title"] == "USDT -> A -> B -> USDT"
    # 1 USDT -> 0.1 A -> 0.05 B -> 1.025 USDT, minus three 0.1% fees
    assert abs(best["edge_pct"] - ((1.025 * 0.999 ** 3) - 1) * 100) < 1e-3


def test_funding_carry_annualizes():
    rates = {"x": {"BTC": {"rate": 0.0003, "hours": 8}, "ETH": {"rate": 0.00001, "hours": 8}}}
    [o] = scanners.funding_carry(rates, 20, 0.4)
    assert abs(o["details"]["gross_apr_pct"] - 32.85) < 0.06  # 0.03% * 3 * 365
    assert "buy spot" in o["title"]


def test_merger_arb_cash_deal():
    deal = {"target": "T", "acquirer": "Q", "cash": 50, "expected_close": "2027-01-01"}
    [o] = scanners.merger_arb(deal, 48.0, None, today=date(2026, 7, 5))
    assert o["details"]["spread_pct"] == 4.17
    assert o["details"]["days_to_close"] == 180


def test_rsi_extremes():
    assert scanners.rsi(list(range(1, 40))) == 100.0
    assert scanners.rsi(list(range(40, 1, -1))) < 1


def test_stock_breakout_signal():
    closes = [100.0] * 80 + [110.0]
    vols = [1000] * 80 + [3000]
    cfg = {"rsi_oversold": 30, "breakout_volume_ratio": 2.0, "near_52w_low_pct": 5}
    types = {o["type"] for o in scanners.stock_signals("Z", {"close": closes, "volume": vols, "price": 110.0}, cfg)}
    assert "stock-breakout" in types
