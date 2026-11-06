import { sendEmail } from "../email";
import { getSettings } from "../settings";
import { SITE, SITE_HOST } from "../site";
import { digestData, previousMonth } from "./data";
import { renderDigest } from "./render";
import { DIGEST_ADDRESS } from "./subscription";
import type { DigestData } from "./types";

// Each send is a few subrequests; this keeps one cron run well inside the Workers limit. A larger list finishes the next day.
export const DIGEST_BATCH = 300;
/** Left for sign-in links and moderation emails on the day a digest goes out. */
export const DIGEST_RESERVE = { day: 200, days30: 500 };


export const unsubscribeUrl = (token: string) => `${SITE}/digest/unsubscribe/${token}/`;

/** From the daily cron: builds last month's digest once, then sends to whoever is still waiting. */
export async function runDigest(env: Env, now: Date) {
  if ((await getSettings(env.DB)).digest_enabled !== "1") return;
  await buildDigest(env.DB, previousMonth(now));
  await sendWaiting(env);
}

/** Stores the month's content and fixes its recipients. False when it exists already or the month had nothing new. */
export async function buildDigest(db: D1Database, month: string) {
  if (await db.prepare("SELECT 1 FROM digests WHERE month = ?").bind(month).first()) return false;
  const data = await digestData(db, month);
  if (!data.news.length && !data.spectra) return false;
  const [made] = await db.batch([
    db.prepare("INSERT INTO digests (month, data_json) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(month, JSON.stringify(data)),
    db.prepare(`INSERT OR IGNORE INTO digest_sends (month, user_id) SELECT ?, u.id FROM users u WHERE u.digest = 1 AND EXISTS (${DIGEST_ADDRESS})`).bind(month),
  ]);
  return made.meta.changes > 0;
}

/** Sends waiting digests until the batch or the capped share of the day's emails runs out. */
export async function sendWaiting(env: Env) {
  const db = env.DB;
  const { results } = await db.prepare(
    `SELECT ds.month, ds.user_id, u.digest, u.digest_token AS token, (${DIGEST_ADDRESS}) AS email
     FROM digest_sends ds JOIN users u ON u.id = ds.user_id WHERE ds.sent_at IS NULL ORDER BY ds.month, ds.user_id LIMIT ?`,
  ).bind(DIGEST_BATCH).all<{ month: string; user_id: number; digest: number; token: string | null; email: string | null }>();
  const content = new Map<string, DigestData>();
  let sent = 0;
  for (const r of results) {
    const done = db.prepare("UPDATE digest_sends SET sent_at = datetime('now') WHERE month = ? AND user_id = ?").bind(r.month, r.user_id);
    if (!r.digest || !r.email || !r.token) {
      await db.prepare("DELETE FROM digest_sends WHERE month = ? AND user_id = ?").bind(r.month, r.user_id).run();
      continue;
    }
    if (!content.has(r.month)) content.set(r.month, JSON.parse((await db.prepare("SELECT data_json FROM digests WHERE month = ?").bind(r.month).first<string>("data_json"))!));
    try {
      if (!(await sendDigest(env, content.get(r.month)!, r.email, r.token))) break;
    } catch (e) {
      // A suppressed or rejected address fails the same way every time, so it counts as done rather than blocking the rest.
      console.error(`[digest] ${r.month} to user ${r.user_id} failed: ${e}`);
    }
    await done.run();
    sent++;
  }
  if (results.length) console.log(`[digest] sent ${sent} of ${results.length} waiting`);
  return sent;
}

/** One digest email; false when the reserve stopped it. */
export function sendDigest(env: Env, data: DigestData, email: string, token: string, subjectPrefix = "") {
  const url = unsubscribeUrl(token);
  const m = renderDigest(data, { email, unsubscribeUrl: url });
  return sendEmail(env, {
    to: email,
    subject: subjectPrefix + m.subject,
    text: m.text,
    html: m.html,
    footer: null,
    reserve: DIGEST_RESERVE,
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "List-Id": `EELSdb monthly digest <digest.${SITE_HOST}>`,
    },
  });
}
