/* Local preview for Lumen: `npm run stocks` → http://localhost:3000/stocks/ */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import market from "./api/market.js";

const ROOT = join(import.meta.dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/market") {
    res.status = (c) => { res.statusCode = c; return { json: (b) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(b)); } }; };
    return market(req, res);
  }
  let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(ROOT, p));
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
}).listen(process.env.PORT || 3000, () => console.log(`Lumen → http://localhost:${process.env.PORT || 3000}/stocks/`));
