/* Lumen — GET /api/market
 * Pulls historical + intraday bars, financial-news headlines and day-trader community chatter,
 * runs the intraday engine and returns the top-3 day-trading ideas with the reasons they were picked.
 * Falls back to a deterministic demo market if every live source is unreachable.
 */
import {
  UNIVERSE, parseChart, headlineSentiment, countMentions, analyzeSymbol, rank, marketClock, demoMarket, analyzeMarket,
} from "../public/stocks/engine.js";

const UA = "Mozilla/5.0 (compatible; LumenMarketBot/1.0)";
const TTL = 60_000;
let cache = { at: 0, body: null };

async function get(url, type = "json", ms = 7000) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: type === "json" ? "application/json" : "application/rss+xml, text/xml" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return type === "json" ? r.json() : r.text();
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } }
  }));
  return out;
}

function parseRss(xml, source) {
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

const YF = (s, range, interval) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${s}?range=${range}&interval=${interval}&includePrePost=false`;

const GENERAL_FEEDS = [
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_marketpulse"],
  ["CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664"],
  ["CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"],
  ["Nasdaq", "https://www.nasdaq.com/feed/rssoutbound?category=Stocks"],
];
const REDDIT = ["Daytrading", "wallstreetbets", "stocks", "StockMarket"];

async function buildLive(now) {
  const syms = UNIVERSE.map(([s]) => s);
  const sources = [];
  const mark = (name, kind, ok, n) => sources.push({ name, kind, ok, n });

  // 1) price history + today's 5-minute bars (Yahoo Finance)
  const charts = await pool(syms, 8, async (s) => {
    const [d, i] = await Promise.all([
      get(YF(s, "3mo", "1d")).then(parseChart),
      get(YF(s, "1d", "5m")).then(parseChart).catch(() => null),
    ]);
    return { daily: d, intraday: i };
  });
  const okCharts = charts.filter((c) => c && c.daily).length;
  mark("Yahoo Finance", "data", okCharts > 0, okCharts);
  if (okCharts < 5) return null; // no reliable price data → caller uses demo

  // 2) general economic news + 3) trader communities, in parallel
  const [feeds, reddit, trending] = await Promise.all([
    Promise.all(GENERAL_FEEDS.map(([src, url]) => get(url, "text").then((x) => parseRss(x, src)).catch(() => null))),
    Promise.all(REDDIT.map((sub) => get(`https://www.reddit.com/r/${sub}/hot.json?limit=75`).then((j) =>
      j.data.children.map((c) => `${c.data.title} ${c.data.selftext || ""}`)).catch(() => null))),
    get("https://api.stocktwits.com/api/2/trending/symbols.json").then((j) => j.symbols.map((x) => x.symbol)).catch(() => null),
  ]);
  for (const src of ["MarketWatch", "CNBC", "Nasdaq"]) {
    const got = GENERAL_FEEDS.map((f, k) => [f[0], feeds[k]]).filter(([s, v]) => s === src && v);
    mark(src, "news", got.length > 0, got.reduce((n, [, v]) => n + v.length, 0));
  }
  REDDIT.forEach((sub, k) => mark(`r/${sub}`, "traders", !!reddit[k], reddit[k] ? reddit[k].length : 0));
  mark("StockTwits", "traders", !!trending, trending ? trending.length : 0);

  const general = feeds.filter(Boolean).flat();
  const mentions = countMentions(reddit.filter(Boolean).flat(), syms);
  if (trending) trending.forEach((s, k) => { if (s in mentions) mentions[s] += Math.max(5, 30 - k * 2); });

  const data = {};
  syms.forEach((s, k) => {
    if (!charts[k] || !charts[k].daily) return;
    const name = UNIVERSE[k][1];
    const first = name.split(" ")[0].toLowerCase();
    const news = general.filter((n) => new RegExp(`\\b${s}\\b`).test(n.title) || n.title.toLowerCase().includes(first));
    data[s] = { ...charts[k], news, social: mentions[s] };
  });

  // 4) pre-rank, then enrich the strongest candidates with ticker news + StockTwits sentiment
  const pre = rank(Object.keys(data).map((s) => analyzeSymbol({ symbol: s, ...data[s], socialMax: 1, now })), 10);
  const cands = pre.top.concat(pre.watch).slice(0, 10).map((a) => a.symbol);
  let yNews = 0, stOk = 0;
  await pool(cands, 5, async (s) => {
    const [rss, st] = await Promise.all([
      get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${s}&region=US&lang=en-US`, "text").then((x) => parseRss(x, "Yahoo Finance")).catch(() => []),
      get(`https://api.stocktwits.com/api/2/streams/symbol/${s}.json`).catch(() => null),
    ]);
    yNews += rss.length;
    const seen = new Set(data[s].news.map((n) => n.title));
    data[s].news = data[s].news.concat(rss.filter((n) => !seen.has(n.title))).slice(0, 12);
    if (st && st.messages) {
      stOk++;
      const tags = st.messages.map((m) => m.entities && m.entities.sentiment && m.entities.sentiment.basic).filter(Boolean);
      if (tags.length >= 5) data[s].stBull = tags.filter((t) => t === "Bullish").length / tags.length;
      data[s].social += st.messages.length > 25 ? 10 : 0;
    }
  });
  mark("Yahoo Finance News", "news", yNews > 0, yNews);
  mark("StockTwits Sentiment", "traders", stOk > 0, stOk);

  return { ...analyzeMarket(data, now), sources };
}

export default async function handler(req, res) {
  const now = Date.now();
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  if (cache.body && now - cache.at < TTL) return res.status(200).json(cache.body);

  let live = null;
  try { live = await buildLive(now); } catch (e) { live = null; }
  const result = live || { ...analyzeMarket(demoMarket(now), now), sources: [] };
  const body = {
    mode: live ? "live" : "demo",
    generatedAt: new Date(now).toISOString(),
    clock: marketClock(now),
    ...result,
  };
  cache = { at: now, body };
  return res.status(200).json(body);
}
