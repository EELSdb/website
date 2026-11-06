-- Moderators write news on the site (ADR 0038). Archived posts keep body_html and legacy_v1; new and edited
-- articles store Markdown in body_md.
ALTER TABLE news ADD COLUMN body_md TEXT;
ALTER TABLE news ADD COLUMN summary TEXT;
ALTER TABLE news ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published'));
ALTER TABLE news ADD COLUMN created_by INTEGER REFERENCES users(id);
ALTER TABLE news ADD COLUMN updated_at TEXT;

CREATE TABLE news_authors (
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id),  -- empty for a name without an account
  name TEXT NOT NULL,
  PRIMARY KEY (news_id, position)
);

CREATE TABLE news_history (
  id INTEGER PRIMARY KEY,
  news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  title TEXT NOT NULL,
  summary TEXT,
  body_md TEXT  -- empty for the archived HTML version
);
CREATE INDEX news_history_news ON news_history (news_id, id);
