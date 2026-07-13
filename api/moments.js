/* Mee — POST /api/moments
 * Uploads the photo to Vercel Blob (public storage, built into Vercel)
 * and stores the moment's metadata as a small JSON blob alongside it.
 */
export const config = { runtime: "edge" };
import { put } from "@vercel/blob";

async function track(event, momentId) {
  try {
    const key = `events/${event}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await put(key, momentId || "1", { access: "public", addRandomSuffix: false });
  } catch (e) {}
}

export default async function handler(request) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const fd = await request.formData();
  const photo = fd.get("photo");
  if (!photo || typeof photo.arrayBuffer !== "function") {
    return Response.json({ error: "photo required" }, { status: 400 });
  }
  const buf = await photo.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) {
    return Response.json({ error: "photo too large" }, { status: 413 });
  }

  const lang = ["en", "he", "hi", "zh", "ru"].includes(fd.get("lang")) ? fd.get("lang") : "en";
  const ambience = ["ocean", "forest", "night", "warm"].includes(fd.get("ambience")) ? fd.get("ambience") : "warm";
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  const photoBlob = await put(`photos/${id}.jpg`, buf, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });

  const moment = {
    id,
    message: String(fd.get("message") || "").slice(0, 280),
    ambience,
    lang,
    created: Date.now(),
    photoUrl: photoBlob.url, // absolute Vercel Blob URL — no proxy route needed
  };
  await put(`moments/${id}.json`, JSON.stringify(moment), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });

  await track("moment_created", id);

  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(request.url).origin;
  return Response.json({ id, url: `${base}/m/${id}` });
}
