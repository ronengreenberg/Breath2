/* Mee — POST /api/track  (fire-and-forget analytics events) */
export const config = { runtime: "edge" };
import { put } from "@vercel/blob";

export default async function handler(request) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { event, momentId } = await request.json();
    if (typeof event === "string" && event.length < 40) {
      const clean = event.replace(/[^a-z_]/g, "");
      const key = `events/${clean}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await put(key, typeof momentId === "string" ? momentId.slice(0, 20) : "1", {
        access: "public",
        addRandomSuffix: false,
      });
    }
  } catch (e) {}
  return Response.json({ ok: true });
}
