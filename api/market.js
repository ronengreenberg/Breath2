/* Lumen — GET /api/market
 * Pulls historical + intraday bars, financial-news headlines and day-trader community chatter,
 * runs the intraday engine and returns the top-3 day-trading ideas with the reasons they were picked.
 * Falls back to a deterministic demo market if price data is unreachable.
 */
import {
  UNIVERSE, CONTEXT, countMentions, analyzeSymbol, rank, marketClock, demoMarket, demoContext, analyzeMarket, contextTile,
} from "../public/stocks/engine.js";
import { get, pool, parseRss, yahoo, alpaca, hasAlpaca, priceProvider } from "./_lib/sources.js";

const TTL = 60_000;
let cache = { at: 0, body: null };

const GENERAL_FEEDS = [
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_marketpulse"],
  ["CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664"],
  ["CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"],
  ["Nasdaq", "https://www.nasdaq.com/feed/rssoutbound?category=Stocks"],
];
const REDDIT = ["Daytrading", "wallstreetbets", "stocks", "StockMarket"];

async function marketContext(provider, now) {
  const tiles = await Promise.all(CONTEXT.map(([s, label]) => yahoo.intraday(s).then((p) => contextTile(s, label, p)).catch(() => null)));
  if (tiles.some(Boolean) || provider !== alpaca) return tiles.filter(Boolean);
  const q = await alpaca.quotes(["SPY", "QQQ", "IWM"], now).catch(() => ({}));
  return CONTEXT.map(([s, label]) => q[s] && contextTile(s, label, q[s].intraday)).filter(Boolean);
}

async function buildLive(now) {
  const syms = UNIVERSE.map(([s]) => s);
  const sources = [];
  const mark = (name, kind, ok, n) => sources.push({ name, kind, ok, n });
  const provider = priceProvider();

  // 1) price history + today's 5-minute bars
  const quotes = await provider.quotes(syms, now).catch(() => ({}));
  const okCharts = syms.filter((s) => quotes[s] && quotes[s].daily).length;
  mark(provider.name, "data", okCharts > 0, okCharts);
  if (okCharts < 5) return null; // no reliable price data → caller uses demo

  // 2) economic news, 3) trader communities, 4) index context — in parallel
  const [feeds, reddit, trending, context, alpacaNews] = await Promise.all([
    Promise.all(GENERAL_FEEDS.map(([src, url]) => get(url, "text").then((x) => parseRss(x, src)).catch(() => null))),
    Promise.all(REDDIT.map((sub) => get(`https://www.reddit.com/r/${sub}/hot.json?limit=75`).then((j) =>
      j.data.children.map((c) => `${c.data.title} ${c.data.selftext || ""}`)).catch(() => null))),
    get("https://api.stocktwits.com/api/2/trending/symbols.json").then((j) => j.symbols.map((x) => x.symbol)).catch(() => null),
    marketContext(provider, now).catch(() => []),
    hasAlpaca() ? alpaca.news(syms).catch(() => null) : Promise.resolve(null),
  ]);
  for (const src of ["MarketWatch", "CNBC", "Nasdaq"]) {
    const got = GENERAL_FEEDS.map((f, k) => [f[0], feeds[k]]).filter(([s, v]) => s === src && v);
    mark(src, "news", got.length > 0, got.reduce((n, [, v]) => n + v.length, 0));
  }
  if (hasAlpaca()) mark("Benzinga (Alpaca)", "news", !!alpacaNews, alpacaNews ? alpacaNews.length : 0);
  REDDIT.forEach((sub, k) => mark(`r/${sub}`, "traders", !!reddit[k], reddit[k] ? reddit[k].length : 0));
  mark("StockTwits", "traders", !!trending, trending ? trending.length : 0);

  const general = feeds.filter(Boolean).flat();
  const mentions = countMentions(reddit.filter(Boolean).flat(), syms);
  if (trending) trending.forEach((s, k) => { if (s in mentions) mentions[s] += Math.max(5, 30 - k * 2); });

  const data = {};
  UNIVERSE.forEach(([s, name]) => {
    if (!quotes[s] || !quotes[s].daily) return;
    const first = name.split(" ")[0].toLowerCase();
    const news = general.filter((n) => new RegExp(`\\b${s}\\b`).test(n.title) || n.title.toLowerCase().includes(first))
      .concat((alpacaNews || []).filter((n) => n.symbols.includes(s)));
    data[s] = { ...quotes[s], news, social: mentions[s] };
  });

  // 5) pre-rank, then enrich the strongest candidates with ticker news + StockTwits sentiment
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

  return { ...analyzeMarket(data, now), context, sources, provider: provider.name };
}

export default async function handler(req, res) {
  const now = Date.now();
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  if (cache.body && now - cache.at < TTL) return res.status(200).json(cache.body);

  let live = null;
  try { live = await buildLive(now); } catch (e) { live = null; }
  const result = live || { ...analyzeMarket(demoMarket(now), now), context: demoContext(now), sources: [], provider: "demo" };
  const body = { mode: live ? "live" : "demo", generatedAt: new Date(now).toISOString(), clock: marketClock(now), ...result };
  cache = { at: now, body };
  return res.status(200).json(body);
}
