/* Lumen — data sources shared by /api/market and /api/backtest.
 * Price data: Alpaca (official API, used when ALPACA_KEY_ID + ALPACA_SECRET_KEY are set) → else Yahoo Finance.
 * Files under api/_lib are not deployed as functions by Vercel.
 */
import { parseChart, headlineSentiment, splitSessions, nyDate, nyOpen } from "../../public/stocks/engine.js";

const UA = "Mozilla/5.0 (compatible; LumenMarketBot/1.0)";

export async function get(url, type = "json", { ms = 7000, headers = {} } = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: type === "json" ? "application/json" : "application/rss+xml, text/xml", ...headers },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return type === "json" ? r.json() : r.text();
}

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } }
  }));
  return out;
}

export function parseRss(xml, source) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const block = m[0];
    const pick = (tag) => {
      const x = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return x ? x[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : "";
    };
    const title = pick("title");
    if (title) items.push({ title, link: pick("link"), source, sentiment: headlineSentiment(title) });
  }
  return items;
}

/* ---------------- Yahoo Finance ---------------- */
const YF = (s, range, interval) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=${interval}&includePrePost=false`;

export const yahoo = {
  name: "Yahoo Finance",
  daily: (s, range = "3mo") => get(YF(s, range, "1d")).then(parseChart),
  intraday: (s, range = "1d") => get(YF(s, range, "5m")).then(parseChart),
  async quotes(symbols) {
    const out = {};
    await pool(symbols, 8, async (s) => {
      const [daily, intraday] = await Promise.all([yahoo.daily(s), yahoo.intraday(s).catch(() => null)]);
      out[s] = { daily, intraday };
    });
    return out;
  },
  async history(symbols, days = 30) {
    const out = {};
    await pool(symbols, 6, async (s) => {
      const [daily, intra] = await Promise.all([yahoo.daily(s, "6mo"), yahoo.intraday(s, days > 30 ? "60d" : "1mo")]);
      if (daily && intra) out[s] = { daily, intra };
    });
    return out;
  },
};

/* ---------------- Alpaca Market Data (optional, needs free API keys) ---------------- */
const ALPACA = "https://data.alpaca.markets";
const alpacaHeaders = () => ({ "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID, "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY });
export const hasAlpaca = () => !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);
const FEED = () => process.env.ALPACA_FEED || "iex"; // "sip" with a paid plan

async function alpacaBars(symbols, timeframe, startMs) {
  const all = Object.fromEntries(symbols.map((s) => [s, []]));
  let token = null;
  for (let page = 0; page < 40; page++) {
    const q = new URLSearchParams({ symbols: symbols.join(","), timeframe, start: new Date(startMs).toISOString(), limit: "10000", adjustment: "split", feed: FEED() });
    if (token) q.set("page_token", token);
    const j = await get(`${ALPACA}/v2/stocks/bars?${q}`, "json", { ms: 10000, headers: alpacaHeaders() });
    for (const [s, bars] of Object.entries(j.bars || {})) {
      for (const b of bars) all[s].push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    }
    token = j.next_page_token;
    if (!token) break;
  }
  return all;
}

/* Alpaca daily bars are stamped at midnight NY; move them to 09:30 so they line up with session dates. */
const toDaily = (bars, name) => ({ bars: bars.map((b) => ({ ...b, t: nyOpen(b.t + 6 * 3600e3) })), meta: { name, prevClose: bars.length > 1 ? bars[bars.length - 2].c : null } });

export const alpaca = {
  name: "Alpaca",
  async quotes(symbols, now = Date.now()) {
    const [d, m5] = await Promise.all([alpacaBars(symbols, "1Day", now - 120 * 864e5), alpacaBars(symbols, "5Min", now - 4 * 864e5)]);
    const out = {};
    for (const s of symbols) {
      if (!d[s] || d[s].length < 25) continue;
      const sessions = splitSessions(m5[s] || []);
      const keys = [...sessions.keys()].sort();
      const lastKey = keys[keys.length - 1];
      const bars = lastKey ? sessions.get(lastKey) : [];
      const daily = toDaily(d[s], s);
      // previous close = last daily close strictly before the intraday session
      const hist = daily.bars.filter((b) => !lastKey || nyDate(b.t) < lastKey);
      const prevClose = hist.length ? hist[hist.length - 1].c : null;
      const regStart = bars.length ? nyOpen(bars[0].t) : null;
      out[s] = {
        daily,
        intraday: bars.length ? { bars, meta: { prevClose, regularStart: regStart, regularEnd: regStart + 390 * 60000 } } : null,
      };
    }
    return out;
  },
  async history(symbols, days = 30, now = Date.now()) {
    const [d, m5] = await Promise.all([alpacaBars(symbols, "1Day", now - 200 * 864e5), alpacaBars(symbols, "5Min", now - (days + 2) * 864e5)]);
    const out = {};
    for (const s of symbols) if (d[s] && d[s].length > 25 && m5[s] && m5[s].length) out[s] = { daily: toDaily(d[s], s), intra: { bars: m5[s], meta: {} } };
    return out;
  },
  async news(symbols) {
    const q = new URLSearchParams({ symbols: symbols.join(","), limit: "50", start: new Date(Date.now() - 2 * 864e5).toISOString() });
    const j = await get(`${ALPACA}/v1beta1/news?${q}`, "json", { headers: alpacaHeaders() });
    return (j.news || []).map((n) => ({ title: n.headline, link: n.url, source: n.source ? n.source[0].toUpperCase() + n.source.slice(1) : "Benzinga", symbols: n.symbols || [], sentiment: headlineSentiment(n.headline) }));
  },
};

export const priceProvider = () => (hasAlpaca() ? alpaca : yahoo);
