import { test } from "node:test";
import assert from "node:assert/strict";

const call = (h, url = "/") => new Promise((ok) => h({ url }, { setHeader() {}, status: (c) => ({ json: (b) => ok({ c, b }) }) }));

test("API falls back to demo data when every source is unreachable", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const { default: market } = await import("../api/market.js");
    const { default: backtest } = await import("../api/backtest.js");
    const m = await call(market);
    assert.equal(m.c, 200); assert.equal(m.b.mode, "demo"); assert.equal(m.b.top.length, 3); assert.ok(m.b.context.length);
    const b = await call(backtest, "/api/backtest?sessions=8");
    assert.equal(b.b.mode, "demo"); assert.equal(b.b.summary.sessions, 8);
  } finally { globalThis.fetch = real; }
});
