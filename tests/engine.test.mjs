import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../public/stocks/engine.js";

const DAY = 864e5;
const MONDAY = E.nyOpen(Date.UTC(2026, 10, 16, 15)); // Mon 16 Nov 2026, 09:30 NY
function dailyBars(n, { start = 100, step = 0, vol = 1e6, range = 2 } = {}) {
  const out = []; let p = start;
  const t0 = MONDAY - n * DAY;
  for (let i = 0; i < n; i++) { const c = p + step; out.push({ t: t0 + i * DAY, o: p, h: Math.max(p, c) + range / 2, l: Math.min(p, c) - range / 2, c, v: vol }); p = c; }
  return out;
}
function session(open, start, n, { step = 0, vol = 1e4, wick = 0.05 } = {}) {
  const out = []; let p = start;
  for (let i = 0; i < n; i++) { const c = p + step; out.push({ t: open + i * 300000, o: p, h: Math.max(p, c) + wick, l: Math.min(p, c) - wick, c, v: vol }); p = c; }
  return out;
}

test("indicators", () => {
  assert.deepEqual(E.ema([1, 1, 1], 3), [1, 1, 1]);
  assert.equal(E.rsi(Array.from({ length: 30 }, (_, i) => i)), 100);
  assert.ok(E.rsi(Array.from({ length: 30 }, (_, i) => 30 - i)) < 1);
  const b = dailyBars(20, { range: 2 });
  assert.equal(E.atr(b.map((x) => x.h), b.map((x) => x.l), b.map((x) => x.c)), 2);
});

test("parseChart skips null bars and reads meta", () => {
  const j = { chart: { result: [{ meta: { regularMarketPrice: 10, chartPreviousClose: 9, shortName: "X", currentTradingPeriod: { regular: { start: 100, end: 200 } } },
    timestamp: [1, 2, 3], indicators: { quote: [{ open: [1, null, 3], high: [1, null, 3], low: [1, null, 3], close: [1, null, 3], volume: [5, null, 7] }] } }] } };
  const p = E.parseChart(j);
  assert.equal(p.bars.length, 2);
  assert.equal(p.meta.prevClose, 9);
  assert.equal(p.meta.regularStart, 100000);
  assert.equal(E.parseChart({}), null);
});

test("sentiment and mentions", () => {
  assert.ok(E.headlineSentiment("Nvidia beats estimates, shares surge") > 0);
  assert.ok(E.headlineSentiment("Tesla misses, stock plunges on weak demand") < 0);
  const m = E.countMentions(["$BA up, BA is a word", "TSLA to the moon $TSLA", "AMD"], ["BA", "TSLA", "AMD"]);
  assert.deepEqual(m, { BA: 1, TSLA: 2, AMD: 0 }); // tickers of ≤3 letters need the $ prefix
});

test("New York calendar handles daylight saving", () => {
  assert.equal(new Date(E.nyOpen(Date.UTC(2026, 6, 1, 18))).toISOString(), "2026-07-01T13:30:00.000Z");
  assert.equal(new Date(E.nyOpen(Date.UTC(2026, 11, 1, 18))).toISOString(), "2026-12-01T14:30:00.000Z");
  assert.equal(E.nyDate(Date.UTC(2026, 11, 2, 3)), "2026-12-01");
  assert.equal(E.marketClock(Date.UTC(2026, 10, 16, 15)).state, "open"); // Mon 10:00 NY
  assert.equal(E.marketClock(Date.UTC(2026, 10, 14, 15)).state, "closed"); // Saturday
});

test("analyzeSymbol prefers a high-volume trending mover over a quiet stock", () => {
  const hist = dailyBars(40, { start: 100, step: 0.3, vol: 1e7, range: 3 });
  const open = MONDAY;
  const now = open + 60 * 60000;
  const meta = { regularStart: open, regularEnd: open + 390 * 60000 };
  const last = hist[hist.length - 1].c;
  const hot = E.analyzeSymbol({ symbol: "HOT", daily: { bars: hist, meta: {} }, now,
    intraday: { bars: session(open, last * 1.03, 12, { step: 0.15, vol: 1.2e6 }), meta } });
  const quiet = E.analyzeSymbol({ symbol: "QT", daily: { bars: hist, meta: {} }, now,
    intraday: { bars: session(open, last, 12, { step: 0, vol: 1e5 }), meta } });
  assert.equal(hot.direction, "long");
  assert.ok(hot.rvol > 2, `rvol ${hot.rvol}`);
  assert.ok(hot.score > quiet.score + 15, `${hot.score} vs ${quiet.score}`);
  assert.ok(hot.plan.stop < hot.price && hot.plan.target1 > hot.price && hot.plan.target2 > hot.plan.target1);
  assert.ok(hot.reasons.length >= 3);
});

test("backtest: one decision per day, stop wins ties, no look-ahead", () => {
  const hist = dailyBars(40, { start: 100, step: 0.2, vol: 1e7, range: 3 });
  const open = E.nyOpen(hist[hist.length - 1].t + DAY);
  // every symbol trends up into 10:00, then one huge bar touches both stop and target → must count as a stop
  const dataset = {};
  for (const [s] of E.UNIVERSE) {
    const pre = session(open, 108, 6, { step: 0.2, vol: 2e6 });
    const post = session(open + 6 * 300000, 109.2, 72, { step: 0, vol: 1e5, wick: 0.01 });
    post[0] = { ...post[0], h: 130, l: 90 };
    dataset[s] = { daily: { bars: hist, meta: {} }, intra: { bars: pre.concat(post) } };
  }
  const bt = E.backtest(dataset, { sessions: 5 });
  assert.equal(bt.summary.sessions, 1);
  assert.equal(bt.trades.length, 3);
  for (const t of bt.trades) { assert.equal(t.outcome, "stop"); assert.equal(t.R, -1); assert.equal(t.entry, 109.2); }
});

test("demo market and backtest are deterministic and well-formed", () => {
  const now = Date.UTC(2026, 10, 13, 22);
  const a = E.analyzeMarket(E.demoMarket(now), now), b = E.analyzeMarket(E.demoMarket(now), now);
  assert.equal(a.top.length, 3);
  assert.deepEqual(a.top.map((x) => x.symbol), b.top.map((x) => x.symbol));
  for (const x of a.top) assert.ok(x.price > 1 && x.price < 3000);
  assert.equal(E.demoContext(now).length, 4);
  const bt = E.backtest(E.demoBacktestData(now, 12), { sessions: 10 });
  assert.equal(bt.summary.sessions, 10);
  assert.equal(bt.summary.trades, 30);
});
