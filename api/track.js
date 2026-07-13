/* Mee — POST /api/track  (Node runtime; fire-and-forget analytics) */
import { put } from "@vercel/blob";

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", () => resolve(""));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    const body = req.body || JSON.parse((await readBody(req)) || "{}");
    const { event, momentId } = typeof body === "string" ? JSON.parse(body) : body;
    if (typeof event === "string" && event.length < 40) {
      const clean = event.replace(/[^a-z_]/g, "");
      const key = `events/${clean}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await put(key, typeof momentId === "string" ? momentId.slice(0, 20) : "1", {
        access: "public", addRandomSuffix: false,
      });
    }
  } catch (e) {}
  res.status(200).json({ ok: true });
}
