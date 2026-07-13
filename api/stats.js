/* Mee — GET /api/stats?key=ADMIN_KEY  (Node runtime) */
import { list } from "@vercel/blob";

async function count(prefix) {
  let n = 0, cursor;
  do {
    const res = await list({ prefix: prefix + "/", cursor, limit: 1000 });
    n += res.blobs.length;
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return n;
}

export default async function handler(req, res) {
  const key = (req.query && req.query.key) || "";
  if (key !== (process.env.ADMIN_KEY || "change-me")) {
    return res.status(403).json({ error: "forbidden" });
  }
  res.status(200).json({
    momentsCreated: await count("events/moment_created"),
    momentsOpened: await count("events/moment_opened"),
    sessionsCompleted: await count("events/session_completed"),
    recipientSessions: await count("events/recipient_session_completed"),
    pageViews: await count("events/page_view"),
  });
}
