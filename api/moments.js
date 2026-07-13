/* Mee — POST /api/moments  (Node runtime)
 * Uploads the photo to Vercel Blob and stores the moment metadata alongside it.
 */
import { put } from "@vercel/blob";

async function track(event, momentId) {
  try {
    const key = `events/${event}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await put(key, momentId || "1", { access: "public", addRandomSuffix: false });
  } catch (e) {}
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// minimal multipart parser (one photo file + text fields)
function parseMultipart(buf, boundary) {
  const parts = {};
  const bBuf = Buffer.from("--" + boundary);
  let start = buf.indexOf(bBuf);
  while (start !== -1) {
    const end = buf.indexOf(bBuf, start + bBuf.length);
    if (end === -1) break;
    const part = buf.slice(start + bBuf.length, end);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const header = part.slice(0, headerEnd).toString();
      const body = part.slice(headerEnd + 4, part.length - 2);
      const nameM = header.match(/name="([^"]+)"/);
      if (nameM) {
        const name = nameM[1];
        if (/filename="/.test(header)) parts[name] = { filename: true, data: body };
        else parts[name] = body.toString().trim();
      }
    }
    start = end;
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  try {
    const ct = req.headers["content-type"] || "";
    const bM = ct.match(/boundary=(.+)$/);
    if (!bM) return res.status(400).json({ error: "bad request" });
    const raw = await readBody(req);
    const fields = parseMultipart(raw, bM[1].replace(/^"|"$/g, ""));

    const photo = fields.photo;
    if (!photo || !photo.filename) return res.status(400).json({ error: "photo required" });
    if (photo.data.byteLength > 8 * 1024 * 1024) return res.status(413).json({ error: "photo too large" });

    const lang = ["en", "he", "hi", "zh", "ru"].includes(fields.lang) ? fields.lang : "en";
    const ambience = ["ocean", "forest", "night", "warm"].includes(fields.ambience) ? fields.ambience : "warm";
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);

    const photoBlob = await put(`photos/${id}.jpg`, photo.data, {
      access: "public", contentType: "image/jpeg", addRandomSuffix: false,
    });

    const moment = {
      id,
      message: String(fields.message || "").slice(0, 280),
      ambience, lang, created: Date.now(),
      photoUrl: photoBlob.url,
    };
    await put(`moments/${id}.json`, JSON.stringify(moment), {
      access: "public", contentType: "application/json", addRandomSuffix: false,
    });

    await track("moment_created", id);

    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${req.headers.host}`;
    res.status(200).json({ id, url: `${base}/m/${id}` });
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
}

