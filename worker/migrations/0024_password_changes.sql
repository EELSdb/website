-- A new password waits here until the link emailed for it is opened.
CREATE TABLE password_changes (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  session_id TEXT,
  expires_at TEXT NOT NULL
);
