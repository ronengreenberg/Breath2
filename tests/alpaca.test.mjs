import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../public/stocks/engine.js";

const call = (h, url = "/") => new Promise((ok) => h({ url }, { setHeader() {}, status: (c) => ({ json: (b) => ok({ c, b }) }) }));
const DAY = 864e5;

// Alpaca-shaped responses: daily bars stamped at NY midnight, 5-minute bars incl. some pre-market noise.
function fakeAlpaca(url) {
  const u = new URL(url);
  if (u.pathname === "/v1beta1/news") {
    return { news: [{ headline: "Nvidia beats estimates as data-center sales surge", url: "https://example.com/n", source: "benzinga", symbols: ["NVDA"] }] };
  }
  const syms = u.searchParams.get("symbols").split(",");
  const tf = u.searchParams.get("timeframe");
  const start = Date.parse(u.searchParams.get("start"));
  const bars = {};
  syms.forEach((s, k) => {
    const arr = [];
    for (let t = start; t < Date.now(); t += DAY) {
      const open = E.nyOpen(t), wd = new Date(open).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (tf === "1Day") {
        const p = 100 + k + (t - start) / DAY * 0.1;
        arr.push({ t: new Date(open - 9.5 * 3600e3).toISOString(), o: p, h: p + 2, l: p - 2, c: p + 0.1, v: 1e6 });
      } else {
        for (let i = -6; i < 78; i++) {
          const bt = open + i * 300000;
          if (bt > Date.now()) break;
          const p = 100 + k + i * 0.01 * (k % 2 ? 1 : -1);
          arr.push({ t: new Date(bt).toISOString(), o: p, h: p + 0.05, l: p - 0.05, c: p, v: i < 0 ? 10 : 2e4 * (1 + k / 10) });
        }
      }
    }
    bars[s] = arr;
  });
  return { bars, next_page_token: null };
}

test("Alpaca provider feeds the engine when API keys are configured", async () => {
  process.env.ALPACA_KEY_ID = "test"; process.env.ALPACA_SECRET_KEY = "test";
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push(String(url));
    if (String(url).startsWith("https://data.alpaca.markets")) {
      assert.equal(opts.headers["APCA-API-KEY-ID"], "test");
      return new Response(JSON.stringify(fakeAlpaca(String(url))), { status: 200 });
    }
    throw new Error("offline");
  };
  try {
    const { default: market } = await import("../api/market.js");
    const { default: backtest } = await import("../api/backtest.js");
    const m = (await call(market)).b;
    assert.equal(m.mode, "live");
    assert.equal(m.provider, "Alpaca");
    assert.equal(m.top.length, 3);
    for (const a of m.top) {
      assert.ok(a.price > 90 && a.price < 140, `${a.symbol} ${a.price}`);
      assert.ok(Number.isFinite(a.score) && Number.isFinite(a.plan.stop));
    }
    const nv = m.top.concat(m.watch).find((a) => a.symbol === "NVDA");
    if (nv) assert.ok(nv.newsCount >= 1);
    assert.ok(m.sources.find((s) => s.name === "Alpaca").ok);
    const b = (await call(backtest, "/api/backtest?sessions=5")).b;
    assert.equal(b.mode, "live");
    assert.ok(b.summary.sessions >= 3, `sessions ${b.summary.sessions}`);
    assert.equal(b.summary.trades, b.summary.sessions * 3);
    assert.ok(seen.some((u) => u.includes("timeframe=5Min")));
  } finally { globalThis.fetch = real; }
});
