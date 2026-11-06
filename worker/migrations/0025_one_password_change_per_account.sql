-- One waiting password per account. Waiting links last 60 minutes, so they are not copied.
DROP TABLE password_changes;
CREATE TABLE password_changes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  session_id TEXT,
  expires_at TEXT NOT NULL
);
