#!/usr/bin/env python3
"""Opportunity agent: scans crypto arbitrage, funding carry, merger arbitrage
and stock signals, ranks what it finds, and writes a report.

  python agent.py                 # one scan, print report
  python agent.py --ai            # + Hebrew summary written by Claude (needs ANTHROPIC_API_KEY)
  python agent.py --loop 15       # rescan every 15 minutes
  python agent.py --only crypto   # crypto | funding | triangular | stocks | mergers
  python agent.py --serve         # dashboard at http://localhost:8765 (rescans every --loop minutes, default 10)

Telegram alerts: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
"""
from __future__ import annotations

import argparse
import json
import os
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests

import scanners
import sources

HERE = Path(__file__).parent
REPORTS = HERE / "reports"

SECTION_NAMES = {
    "cross-exchange-arb": "ארביטראז' בין בורסות קריפטו",
    "triangular-arb": "ארביטראז' משולש (בינאנס)",
    "funding-carry": "Funding carry (ספוט מול חוזה עתידי) - תשואה שנתית",
    "merger-arb": "ארביטראז' מיזוגים - תשואה שנתית",
    "stock-oversold-uptrend": "מניות: מכירת יתר בתוך מגמת עלייה",
    "stock-breakout": "מניות: פריצה עם מחזור חריג",
    "stock-52w-low": "מניות: קרוב לשפל שנתי",
}
ALL_SCANS = ["crypto", "triangular", "funding", "mergers", "stocks"]


def run_scan(cfg: dict, only: list[str]) -> list[dict]:
    sources.ERRORS.clear()
    c, s = cfg["crypto"], cfg["stocks"]
    opps: list[dict] = []

    if "crypto" in only:
        books = sources.spot_books(c["exchanges"])
        opps += scanners.cross_exchange_arb(books, c["coins"], c["taker_fee_pct"],
                                            c["min_net_spread_pct"], c["suspicious_spread_pct"])
    if "triangular" in only:
        symbols, books = sources.binance_triangle_data()
        opps += scanners.triangular_arb(symbols, books, c["triangular_start"],
                                        c["triangular_fee_pct"], c["triangular_min_net_pct"])
    if "funding" in only:
        rates = sources.funding_rates(c["funding_exchanges"])
        opps += scanners.funding_carry(rates, c["funding_min_apr_pct"], c["funding_round_trip_fee_pct"])
    if "mergers" in only:
        deals_file = HERE / "deals.json"
        deals = json.loads(deals_file.read_text()) if deals_file.exists() else []
        for d in deals:
            if d["target"] == "EXAMPLE":
                continue
            t = sources.stock_history(d["target"], "5d").get("price")
            a = sources.stock_history(d["acquirer_symbol"], "5d").get("price") if d.get("acquirer_symbol") else None
            opps += scanners.merger_arb(d, t, a)
    if "stocks" in only:
        for sym in s["watchlist"]:
            opps += scanners.stock_signals(sym, sources.stock_history(sym), s)
    return opps


def format_report(opps: list[dict], top_n: int) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [f"# דו\"ח הזדמנויות - {now}", "",
             "> זה לא ייעוץ השקעות. המספרים הם הערכות מתמונת מצב רגעית, לפני מסים, "
             "עמלות העברה וסליפג'. בדוק כל הזדמנות ידנית לפני שאתה פועל.", ""]
    by_type: dict[str, list[dict]] = {}
    for o in opps:
        by_type.setdefault(o["type"], []).append(o)
    if not opps:
        lines.append("לא נמצאו הזדמנויות שעוברות את הספים שהוגדרו ב-config.json.")
    for t, items in by_type.items():
        items.sort(key=lambda o: o["edge_pct"], reverse=True)
        lines += [f"## {SECTION_NAMES.get(t, t)}", ""]
        for o in items[:top_n]:
            details = ", ".join(f"{k}={v}" for k, v in o["details"].items() if k != "spark")
            lines.append(f"- **{o['asset']}: {o['title']}** — edge {o['edge_pct']}% ({o['unit']})  \n  {details}  \n  ⚠ {'; '.join(o['risks'])}")
        lines.append("")
    if sources.ERRORS:
        lines += ["## מקורות שנכשלו", ""] + [f"- {e}" for e in sources.ERRORS[:20]] + [""]
    return "\n".join(lines)


def ai_summary(report: str) -> str:
    import anthropic  # optional dependency, only needed for --ai

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=("אתה אנליסט שוק זהיר. קרא את דו\"ח הסורק ובחר עד 5 ההזדמנויות שהכי שוות בדיקה. "
                "לכל אחת: למה היא מעניינת, מה הסיכון העיקרי, ומה צריך לבדוק ידנית לפני שפועלים "
                "(עומק ספר פקודות, סטטוס הפקדות/משיכות, חדשות). סמן בבירור הזדמנויות שנראות חשודות "
                "או טובות מכדי להיות אמיתיות. כתוב בעברית, בקצרה. אל תמציא נתונים שאינם בדו\"ח."),
        messages=[{"role": "user", "content": report}],
    )
    if response.stop_reason == "refusal":
        return "(הסיכום של Claude לא זמין עבור הדו\"ח הזה)"
    return "\n".join(b.text for b in response.content if b.type == "text")


def telegram(text: str):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return
    try:
        requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      json={"chat_id": chat, "text": text[:4000]}, timeout=15)
    except requests.RequestException as e:
        print(f"telegram failed: {e}")


def once(cfg, args):
    opps = run_scan(cfg, args.only)
    report = format_report(opps, cfg["report"]["top_n_per_type"])
    if args.ai:
        report += "\n## סיכום של Claude\n\n" + ai_summary(report) + "\n"
    print(report)
    REPORTS.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    (REPORTS / f"report-{stamp}.md").write_text(report, encoding="utf-8")
    (REPORTS / f"report-{stamp}.json").write_text(json.dumps(opps, indent=2, ensure_ascii=False), encoding="utf-8")
    alerts = [o for o in opps if o["type"] in ("cross-exchange-arb", "triangular-arb", "merger-arb")]
    if alerts:
        telegram("הזדמנויות חדשות:\n" + "\n".join(f"{o['asset']}: {o['title']} ({o['edge_pct']}%)" for o in alerts[:10]))


class Dashboard:
    """Holds the latest scan and serves web/index.html plus a small JSON API."""

    def __init__(self, cfg, args):
        self.cfg, self.args = cfg, args
        self.lock = threading.Lock()
        self.state = {"generated_at": None, "scanning": False, "opportunities": [], "errors": [],
                      "scans": args.only, "interval_min": args.loop}

    def scan(self):
        with self.lock:
            if self.state["scanning"]:
                return
            self.state["scanning"] = True
        try:
            opps = run_scan(self.cfg, self.args.only)
            with self.lock:
                self.state.update(opportunities=opps, errors=list(sources.ERRORS),
                                  generated_at=datetime.now(timezone.utc).isoformat())
        finally:
            with self.lock:
                self.state["scanning"] = False

    def scan_async(self):
        threading.Thread(target=self.scan, daemon=True).start()

    def snapshot(self):
        with self.lock:
            return json.dumps(self.state, ensure_ascii=False).encode()

    def handler(self):
        dash = self

        class H(BaseHTTPRequestHandler):
            def _send(self, code, body, ctype):
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path == "/api/latest":
                    self._send(200, dash.snapshot(), "application/json; charset=utf-8")
                elif self.path in ("/", "/index.html"):
                    page = (HERE / "web" / "index.html").read_text(encoding="utf-8")
                    doc = ('<!doctype html><html lang="he"><head><meta charset="utf-8">'
                           '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
                           '<style>body{margin:0}[hidden]{display:none!important}</style></head><body>'
                           + page + "</body></html>")
                    self._send(200, doc.encode(), "text/html; charset=utf-8")
                else:
                    self._send(404, b"not found", "text/plain")

            def do_POST(self):
                if self.path == "/api/scan":
                    dash.scan_async()
                    self._send(202, dash.snapshot(), "application/json; charset=utf-8")
                else:
                    self._send(404, b"not found", "text/plain")

            def log_message(self, *a):
                pass

        return H


def serve(cfg, args):
    dash = Dashboard(cfg, args)

    def loop():
        while True:
            dash.scan()
            time.sleep(args.loop * 60)

    threading.Thread(target=loop, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", args.serve), dash.handler())
    print(f"Dashboard: http://localhost:{args.serve}  (rescans every {args.loop:g} min, Ctrl+C to stop)")
    server.serve_forever()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", default=str(HERE / "config.json"))
    p.add_argument("--only", nargs="+", choices=ALL_SCANS, default=ALL_SCANS)
    p.add_argument("--ai", action="store_true", help="add a Hebrew summary written by Claude")
    p.add_argument("--loop", type=float, metavar="MINUTES", help="rescan every N minutes")
    p.add_argument("--serve", type=int, nargs="?", const=8765, metavar="PORT", help="run the web dashboard")
    args = p.parse_args()
    cfg = json.loads(Path(args.config).read_text())
    if args.serve:
        args.loop = args.loop or 10
        serve(cfg, args)
        return
    while True:
        once(cfg, args)
        if not args.loop:
            break
        time.sleep(args.loop * 60)


if __name__ == "__main__":
    main()
