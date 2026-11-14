/* Lumen — GET /api/backtest?sessions=20
 * Replays the intraday engine on past sessions (5-minute bars) and reports how the daily top-3 would have done.
 * Price + volume only: historical news / community sentiment are not available, so those factors are zero here.
 */
import { UNIVERSE, backtest, demoBacktestData } from "../public/stocks/engine.js";
import { priceProvider } from "./_lib/sources.js";

const TTL = 30 * 60_000;
const cache = new Map();

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const sessions = Math.max(5, Math.min(40, parseInt(url.searchParams.get("sessions"), 10) || 20));
  const now = Date.now();
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  const hit = cache.get(sessions);
  if (hit && now - hit.at < TTL) return res.status(200).json(hit.body);

  const provider = priceProvider();
  let data = null;
  try {
    data = await provider.history(UNIVERSE.map(([s]) => s), sessions + 4, now);
    if (Object.keys(data).length < 5) data = null;
  } catch (e) { data = null; }
  const mode = data ? "live" : "demo";
  const result = backtest(data || demoBacktestData(now, sessions + 2), { sessions });
  const body = { mode, provider: data ? provider.name : "demo", generatedAt: new Date(now).toISOString(), ...result };
  cache.set(sessions, { at: now, body });
  return res.status(200).json(body);
}
