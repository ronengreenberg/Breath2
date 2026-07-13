/* Mee — GET /api/stats?key=ADMIN_KEY  (how many moments, opens, completed sessions) */
export const config = { runtime: "edge" };
import { list } from "@vercel/blob";

async function count(prefix) {
  let n = 0;
  let cursor;
  do {
    const res = await list({ prefix: prefix + "/", cursor, limit: 1000 });
    n += res.blobs.length;
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return n;
}

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("key") !== (process.env.ADMIN_KEY || "change-me")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return Response.json({
    momentsCreated: await count("events/moment_created"),
    momentsOpened: await count("events/moment_opened"),
    sessionsCompleted: await count("events/session_completed"),
    recipientSessions: await count("events/recipient_session_completed"),
    pageViews: await count("events/page_view"),
  });
}
