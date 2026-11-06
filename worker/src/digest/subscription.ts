/** Where an account's digest goes, as a subquery over `users u`: a confirmed address, the primary one if it is confirmed. */
export const DIGEST_ADDRESS = "SELECT e.email FROM user_emails e WHERE e.user_id = u.id AND e.verified = 1 ORDER BY e.is_primary DESC, e.id LIMIT 1";

/** Turning it on makes the unsubscribe token if there is none; turning it off keeps the token, so old emails' links still work. */
export async function setDigest(db: D1Database, userId: number, on: boolean) {
  await db
    .prepare("UPDATE users SET digest = ?1, digest_token = CASE WHEN ?1 = 1 THEN COALESCE(digest_token, ?3) ELSE digest_token END WHERE id = ?2")
    .bind(on ? 1 : 0, userId, crypto.randomUUID())
    .run();
}

export async function userForDigestToken(db: D1Database, token: string): Promise<{ id: number } | null> {
  return db.prepare("SELECT id FROM users WHERE digest_token = ?").bind(token).first<{ id: number }>();
}
