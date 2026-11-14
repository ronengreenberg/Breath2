/* Lumen — intraday analysis engine (isomorphic: runs in the Vercel function and in the browser).
 * Pure functions only: no network, no DOM. Feed it bars + news + social mentions, get ranked ideas.
 */

export const UNIVERSE = [
  ["NVDA", "NVIDIA"], ["TSLA", "Tesla"], ["AMD", "Advanced Micro Devices"], ["AAPL", "Apple"],
  ["META", "Meta Platforms"], ["AMZN", "Amazon"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"],
  ["PLTR", "Palantir"], ["COIN", "Coinbase"], ["MSTR", "MicroStrategy"], ["SMCI", "Super Micro"],
  ["AVGO", "Broadcom"], ["MU", "Micron"], ["NFLX", "Netflix"], ["SOFI", "SoFi"],
  ["HOOD", "Robinhood"], ["MARA", "MARA Holdings"], ["RIVN", "Rivian"], ["UBER", "Uber"],
  ["SHOP", "Shopify"], ["ARM", "Arm Holdings"], ["CRWD", "CrowdStrike"], ["SNOW", "Snowflake"],
  ["INTC", "Intel"], ["BA", "Boeing"], ["DKNG", "DraftKings"], ["RBLX", "Roblox"],
  ["AFRM", "Affirm"], ["NIO", "NIO"],
];

/* ---------- math helpers ---------- */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

export function rsi(closes, period = 14) {
  if (closes.length <= period) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function atr(highs, lows, closes, period = 14) {
  const tr = [];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return avg(tr.slice(-period));
}

/* ---------- Yahoo chart JSON → bars ---------- */
export function parseChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null || q.open[i] == null) continue;
    bars.push({ t: r.timestamp[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 });
  }
  const reg = r.meta.currentTradingPeriod && r.meta.currentTradingPeriod.regular;
  return {
    bars,
    meta: {
      price: r.meta.regularMarketPrice,
      prevClose: r.meta.chartPreviousClose ?? r.meta.previousClose,
      name: r.meta.longName || r.meta.shortName,
      regularStart: reg ? reg.start * 1000 : null,
      regularEnd: reg ? reg.end * 1000 : null,
    },
  };
}

/* ---------- headline sentiment (compact finance lexicon) ---------- */
const POS = ["beat", "beats", "surge", "surges", "soar", "soars", "jump", "jumps", "rally", "rallies", "upgrade", "upgraded",
  "record", "strong", "growth", "raises", "raised", "bullish", "outperform", "buy", "gain", "gains", "tops", "wins",
  "approval", "approved", "partnership", "deal", "expands", "breakout", "higher", "boost", "rebound"];
const NEG = ["miss", "misses", "plunge", "plunges", "drop", "drops", "fall", "falls", "slump", "downgrade", "downgraded",
  "cut", "cuts", "weak", "lawsuit", "probe", "investigation", "bearish", "underperform", "sell", "loss", "losses",
  "recall", "warning", "warns", "lower", "tumble", "tumbles", "crash", "fraud", "delay", "layoffs", "sinks"];

export function headlineSentiment(text) {
  const words = String(text).toLowerCase().match(/[a-z]+/g) || [];
  let s = 0;
  for (const w of words) { if (POS.includes(w)) s++; else if (NEG.includes(w)) s--; }
  return clamp(s / 2, -1, 1);
}

/** Count ticker mentions ($TSLA, or bare TSLA as a word) in a list of texts. */
export function countMentions(texts, tickers) {
  const counts = Object.fromEntries(tickers.map((t) => [t, 0]));
  for (const raw of texts) {
    const text = String(raw);
    for (const t of tickers) {
      const re = t.length <= 3 ? new RegExp(`\\$${t}\\b`, "g") : new RegExp(`(\\$|\\b)${t}\\b`, "g");
      const m = text.match(re);
      if (m) counts[t] += m.length;
    }
  }
  return counts;
}

/* ---------- per-symbol analysis ---------- */
export function analyzeSymbol({ symbol, name, daily, intraday, news = [], social = 0, socialMax = 1, stBull = null, now = Date.now() }) {
  if (!daily || daily.bars.length < 25) return null;
  const d = daily.bars;
  const closes = d.map((b) => b.c), highs = d.map((b) => b.h), lows = d.map((b) => b.l);

  // separate "today" from history using the intraday session
  const iBars = intraday ? intraday.bars : [];
  const regStart = intraday && intraday.meta.regularStart;
  const regEnd = intraday && intraday.meta.regularEnd;
  const session = regStart ? iBars.filter((b) => b.t >= regStart && b.t < (regEnd || Infinity)) : iBars;
  const hasSession = session.length > 0;

  const lastDailyIsToday = hasSession && Math.abs(d[d.length - 1].t - session[0].t) < 20 * 3600e3;
  const hist = lastDailyIsToday ? d.slice(0, -1) : d;
  const hCloses = hist.map((b) => b.c);
  const prevClose = hCloses[hCloses.length - 1];

  const price = hasSession ? session[session.length - 1].c : closes[closes.length - 1];
  const dayOpen = hasSession ? session[0].o : d[d.length - 1].o;
  const dayHigh = hasSession ? Math.max(...session.map((b) => b.h)) : d[d.length - 1].h;
  const dayLow = hasSession ? Math.min(...session.map((b) => b.l)) : d[d.length - 1].l;
  const dayVol = hasSession ? session.reduce((s, b) => s + b.v, 0) : d[d.length - 1].v;

  // VWAP of the session
  let pv = 0, vv = 0;
  for (const b of session) { const tp = (b.h + b.l + b.c) / 3; pv += tp * b.v; vv += b.v; }
  const vwap = vv ? pv / vv : (dayHigh + dayLow + price) / 3;

  // historical context
  const atr14 = atr(hist.map((b) => b.h), hist.map((b) => b.l), hCloses, 14);
  const atrPct = (atr14 / prevClose) * 100;
  const avgVol20 = avg(hist.slice(-20).map((b) => b.v));
  const avgDollarVol = avg(hist.slice(-20).map((b) => b.v * b.c));
  const rsi14 = rsi(hCloses.concat(price), 14);
  const e9 = ema(hCloses.concat(price), 9), e20 = ema(hCloses.concat(price), 20);
  const ema9 = e9[e9.length - 1], ema20 = e20[e20.length - 1];
  const ret5 = (price / hCloses[hCloses.length - 6] - 1) * 100;

  // time-adjusted relative volume (U-shaped intraday volume curve approximation)
  let elapsed = 1;
  if (hasSession && regStart && marketClock(now).state === "open") {
    const mins = clamp((Math.min(now, regEnd || now) - regStart) / 60000, 5, 390);
    const x = mins / 390;
    elapsed = clamp(0.62 * x + 0.38 * (1 - (1 - x) ** 3), 0.06, 1); // front-loaded volume
  }
  const rvol = avgVol20 ? dayVol / (avgVol20 * elapsed) : 1;

  const gapPct = ((dayOpen - prevClose) / prevClose) * 100;
  const changePct = ((price - prevClose) / prevClose) * 100;
  const fromOpenPct = ((price - dayOpen) / dayOpen) * 100;
  const rangePos = dayHigh > dayLow ? (price - dayLow) / (dayHigh - dayLow) : 0.5;

  // opening range (first 30 minutes)
  const orBars = session.slice(0, 6);
  const orHigh = orBars.length ? Math.max(...orBars.map((b) => b.h)) : dayHigh;
  const orLow = orBars.length ? Math.min(...orBars.map((b) => b.l)) : dayLow;
  const last6 = session.slice(-6);
  const momo30 = last6.length > 1 ? ((last6[last6.length - 1].c - last6[0].o) / last6[0].o) * 100 : fromOpenPct;

  // news
  const newsSent = news.length ? avg(news.map((n) => n.sentiment)) : 0;

  /* ---- direction vote ---- */
  let vote = 0;
  vote += price > vwap ? 1 : -1;
  vote += price > ema9 ? 1 : -1;
  vote += ema9 > ema20 ? 0.5 : -0.5;
  vote += fromOpenPct > 0 ? 0.5 : -0.5;
  vote += momo30 > 0 ? 0.5 : -0.5;
  vote += newsSent * 1.5;
  if (stBull != null) vote += (stBull - 0.5) * 2;
  if (rsi14 > 78) vote -= 0.8; // stretched
  if (rsi14 < 22) vote += 0.8;
  const direction = vote >= 0 ? "long" : "short";
  const sign = direction === "long" ? 1 : -1;
  const alignment = clamp(Math.abs(vote) / 4.5); // how unanimous the signals are

  /* ---- factor scores (each 0..1) ---- */
  const f = {
    rvol: clamp((rvol - 0.9) / 2.1),
    volatility: atrPct < 1.2 ? atrPct / 4 : atrPct <= 7 ? clamp(0.55 + (atrPct - 1.2) / 3.5) : clamp(1 - (atrPct - 7) / 8),
    momentum: clamp((sign * fromOpenPct) / 3) * 0.5 + clamp((sign * (price - vwap) / vwap) * 100 / 1.5) * 0.3 + (sign * (rangePos - 0.5) > 0 ? 0.2 * Math.abs(rangePos - 0.5) * 2 : 0),
    gap: clamp(Math.abs(gapPct) / 4) * (Math.sign(gapPct) === sign || Math.abs(gapPct) < 0.3 ? 1 : 0.5),
    liquidity: clamp((Math.log10(Math.max(avgDollarVol, 1)) - 8) / 1.7),
    trend: (sign * (ema9 - ema20) > 0 ? 0.6 : 0.15) + clamp((sign * ret5) / 10) * 0.4,
    news: clamp(news.length / 6) * 0.4 + clamp(sign * newsSent) * 0.6,
    social: clamp(social / Math.max(socialMax, 1)) * (stBull == null ? 1 : clamp(0.5 + sign * (stBull - 0.5) * 2)),
  };
  const W = { rvol: 22, volatility: 13, momentum: 18, gap: 8, liquidity: 10, trend: 10, news: 9, social: 10 };
  let score = 0;
  for (const k in W) score += W[k] * f[k];
  score *= 0.7 + 0.3 * alignment;
  if (avgDollarVol < 5e7) score *= 0.6; // too thin for day trading
  score = round(clamp(score, 0, 100), 0);

  /* ---- trade plan (ATR-based) ---- */
  const stopDist = Math.max(atr14 * 0.35, price * 0.004);
  const entryLo = direction === "long" ? Math.min(price, Math.max(vwap, price - stopDist * 0.4)) : price;
  const entryHi = direction === "long" ? price : Math.max(price, Math.min(vwap, price + stopDist * 0.4));
  const ref = direction === "long" ? entryLo : entryHi;
  const plan = {
    entry: [round(entryLo), round(entryHi)],
    stop: round(ref - sign * stopDist),
    target1: round(ref + sign * stopDist * 1.5),
    target2: round(ref + sign * stopDist * 2.5),
    riskPct: round((stopDist / price) * 100, 2),
  };

  /* ---- human reasons (Hebrew), ordered by contribution ---- */
  const fmt = (x, dd = 1) => (x > 0 ? "+" : "") + x.toFixed(dd);
  const R = [];
  const push = (k, text) => R.push({ k, w: W[k] * f[k], text });
  push("rvol", `נפח מסחר חריג — פי ${rvol.toFixed(1)} מהממוצע ל־20 יום ${elapsed < 1 ? "בשעה זו" : "ביום המסחר"}`);
  push("volatility", `תנודתיות יומית (ATR) של ${atrPct.toFixed(1)}% — מספיק טווח לעסקה תוך־יומית`);
  push("momentum", direction === "long"
    ? `מומנטום חיובי: ${fmt(fromOpenPct)}% מהפתיחה, נסחרת ${price > vwap ? "מעל" : "סביב"} ה־VWAP`
    : `מומנטום שלילי: ${fmt(fromOpenPct)}% מהפתיחה, נסחרת ${price < vwap ? "מתחת" : "סביב"} ל־VWAP`);
  if (Math.abs(gapPct) >= 0.5) push("gap", `פער פתיחה של ${fmt(gapPct)}% ממחיר הסגירה הקודם`);
  push("liquidity", `נזילות גבוהה — מחזור יומי ממוצע של $${(avgDollarVol / 1e9).toFixed(1)}B, מרווחים צרים`);
  push("trend", direction === "long"
    ? `מגמה תומכת: EMA9 ${ema9 > ema20 ? "מעל" : "מתחת"} EMA20, ${fmt(ret5)}% בחמישה ימים`
    : `מגמה יורדת: EMA9 ${ema9 < ema20 ? "מתחת" : "מעל"} EMA20, ${fmt(ret5)}% בחמישה ימים`);
  if (news.length) push("news", `${news.length} כותרות באתרים כלכליים, טון ${newsSent > 0.15 ? "חיובי" : newsSent < -0.15 ? "שלילי" : "ניטרלי"}`);
  if (social > 0) push("social", `באזז בקהילות סוחרים — ${social} אזכורים${stBull != null ? `, ${Math.round(stBull * 100)}% שוריים` : ""}`);
  R.sort((a, b) => b.w - a.w);
  const reasons = R.slice(0, 4).map((r) => r.text);
  const cautions = [];
  if (rsi14 > 72) cautions.push(`RSI גבוה (${rsi14.toFixed(0)}) — סכנת מימוש רווחים`);
  if (rsi14 < 28) cautions.push(`RSI נמוך (${rsi14.toFixed(0)}) — אפשרות לתיקון כלפי מעלה`);
  if (alignment < 0.35) cautions.push("האותות מעורבים — מומלץ להמתין לאישור");
  if (atrPct > 9) cautions.push("תנודתיות קיצונית — הקטינו גודל פוזיציה");

  return {
    symbol, name: name || (daily.meta && daily.meta.name) || symbol,
    price: round(price), changePct: round(changePct), gapPct: round(gapPct), fromOpenPct: round(fromOpenPct),
    vwap: round(vwap), dayHigh: round(dayHigh), dayLow: round(dayLow), orHigh: round(orHigh), orLow: round(orLow),
    rvol: round(rvol), atrPct: round(atrPct), rsi: round(rsi14, 0), ema9: round(ema9), ema20: round(ema20),
    avgDollarVol: Math.round(avgDollarVol), newsCount: news.length, newsSent: round(newsSent), social, stBull,
    direction, alignment: round(alignment), score, factors: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, round(v)])),
    weights: W, plan, reasons, cautions,
    headlines: news.slice(0, 3).map((n) => ({ title: n.title, source: n.source, link: n.link })),
    spark: (hasSession ? session : d.slice(-30)).map((b) => round(b.c)),
    sparkIntraday: hasSession,
  };
}

export function rank(analyses, top = 3) {
  const list = analyses.filter(Boolean).sort((a, b) => b.score - a.score);
  return { top: list.slice(0, top), watch: list.slice(top, top + 9) };
}

/* ---------- market clock (America/New_York) ---------- */
export function marketClock(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date(now));
  const get = (t) => parts.find((p) => p.type === t).value;
  const wd = get("weekday"), mins = (+get("hour") % 24) * 60 + +get("minute");
  const weekend = wd === "Sat" || wd === "Sun";
  let state = "closed";
  if (!weekend) {
    if (mins >= 570 && mins < 960) state = "open";
    else if (mins >= 240 && mins < 570) state = "pre";
    else if (mins >= 960 && mins < 1200) state = "post";
  }
  return { state, nyTime: `${get("hour")}:${get("minute")}`, weekday: wd };
}

/* ---------- deterministic demo market (used when live sources are unreachable) ---------- */
function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

export function demoMarket(now = Date.now()) {
  const day = Math.floor(now / 864e5);
  const BASE = { NVDA: 182, TSLA: 412, AMD: 238, AAPL: 268, META: 712, AMZN: 236, MSFT: 508, GOOGL: 281, PLTR: 178, COIN: 318,
    MSTR: 302, SMCI: 44, AVGO: 352, MU: 236, NFLX: 1110, SOFI: 28, HOOD: 128, MARA: 17, RIVN: 14, UBER: 94, SHOP: 158,
    ARM: 152, CRWD: 528, SNOW: 251, INTC: 37, BA: 198, DKNG: 31, RBLX: 118, AFRM: 71, NIO: 6.4 };
  const VOL = { NVDA: 2.4e8, TSLA: 1e8, AMD: 5e7, AAPL: 5.5e7, META: 1.3e7, AMZN: 4.5e7, MSFT: 2e7, GOOGL: 3e7, PLTR: 6e7, COIN: 1e7,
    MSTR: 1.2e7, SMCI: 3e7, AVGO: 2.2e7, MU: 2.5e7, NFLX: 4e6, SOFI: 7e7, HOOD: 3.5e7, MARA: 5e7, RIVN: 3.5e7, UBER: 2e7,
    SHOP: 9e6, ARM: 6e6, CRWD: 3e6, SNOW: 5e6, INTC: 9e7, BA: 9e6, DKNG: 1e7, RBLX: 7e6, AFRM: 8e6, NIO: 6e7 };
  const clock = marketClock(now);
  const regStart = (() => { // today's 09:30 NY in epoch ms (approx via offset)
    const ny = new Date(new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" }));
    const off = now - ny.getTime();
    const d0 = new Date(ny); d0.setHours(9, 30, 0, 0);
    return d0.getTime() + off;
  })();
  const minsIn = clock.state === "open" ? Math.floor((now - regStart) / 300000) + 1 : 78;

  const out = {};
  for (const [sym, name] of UNIVERSE) {
    const r = prng(day * 977 + sym.split("").reduce((s, c) => s * 31 + c.charCodeAt(0), 7));
    const vol = 0.009 + r() * 0.022;
    const bars = [];
    let p = BASE[sym] * (0.85 + r() * 0.2);
    const drift = (r() - 0.5) * 0.006;
    for (let i = 70; i >= 1; i--) {
      const o = p * (1 + gauss(r) * vol * 0.3);
      const c = o * (1 + drift + gauss(r) * vol);
      const h = Math.max(o, c) * (1 + r() * vol * 0.6), l = Math.min(o, c) * (1 - r() * vol * 0.6);
      bars.push({ t: regStart - i * 864e5, o, h, l, c, v: VOL[sym] * (0.6 + r() * 0.8) });
      p = c;
    }
    const hot = r() < 0.3;
    const gap = gauss(r) * vol * (hot ? 1.4 : 0.4);
    const iDrift = (hot ? Math.sign(gap || 1) * (0.3 + r() * 0.7) : r() - 0.5) * vol * 0.011;
    const rv = hot ? 1.6 + r() * 2.2 : 0.7 + r() * 0.7;
    const ib = [];
    let q = p * (1 + gap);
    for (let i = 0; i < Math.min(minsIn, 78); i++) {
      const o = q, c = o * (1 + iDrift + gauss(r) * vol * 0.07);
      const shape = 1.8 - 1.4 * Math.sin((i / 77) * Math.PI);
      ib.push({ t: regStart + i * 300000, o, h: Math.max(o, c) * (1 + r() * vol * 0.05), l: Math.min(o, c) * (1 - r() * vol * 0.05), c, v: (VOL[sym] / 78) * rv * shape });
      q = c;
    }
    const meta = { price: q, prevClose: p, name, regularStart: regStart, regularEnd: regStart + 390 * 60000 };
    const social = hot ? Math.round(20 + r() * 140) : Math.round(r() * 25);
    const newsN = hot ? 2 + Math.floor(r() * 5) : Math.floor(r() * 2);
    const tone = Math.sign(gap) * (0.2 + r() * 0.5);
    out[sym] = {
      daily: { bars, meta },
      intraday: ib.length ? { bars: ib, meta } : null,
      news: Array.from({ length: newsN }, (_, k) => ({ title: `${name} ${tone > 0 ? "shares rise" : "shares slip"} (demo headline ${k + 1})`, source: "Demo", sentiment: tone })),
      social,
      stBull: clamp(0.5 + tone * 0.6 + (r() - 0.5) * 0.2),
    };
  }
  return out;
}

export function analyzeMarket(data, now = Date.now()) {
  const socialMax = Math.max(1, ...Object.values(data).map((x) => x.social || 0));
  const analyses = UNIVERSE.map(([symbol, name]) => {
    const x = data[symbol];
    if (!x) return null;
    try { return analyzeSymbol({ symbol, name, ...x, socialMax, now }); } catch (e) { return null; }
  });
  return rank(analyses);
}
