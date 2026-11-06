-- The monthly digest email (ADR 0039).
ALTER TABLE users ADD COLUMN digest INTEGER NOT NULL DEFAULT 0;
-- Set when the digest is first turned on; the unsubscribe link carries it, so unsubscribing needs no sign-in.
ALTER TABLE users ADD COLUMN digest_token TEXT;
CREATE UNIQUE INDEX users_digest_token ON users(digest_token);
-- A ticked box on the welcome page waits here until the sign-in link makes the account.
ALTER TABLE login_links ADD COLUMN digest INTEGER NOT NULL DEFAULT 0;

-- One row per month that had something new. The content is fixed when the month ends, so later edits do not change a digest that is still going out.
CREATE TABLE digests (
  month TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Who each digest goes to, fixed when it is built. sent_at stays NULL until it has gone.
CREATE TABLE digest_sends (
  month TEXT NOT NULL REFERENCES digests(month) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TEXT,
  PRIMARY KEY (month, user_id)
);
