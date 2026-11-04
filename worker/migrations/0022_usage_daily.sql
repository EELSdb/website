-- Daily API requests and downloads, copied from Analytics Engine by the daily cron and kept for good.
-- dimension: 'total' (value ''), 'client', 'country' (rare values are 'other'), or 'spectrum' (value is the spectrum id).
CREATE TABLE usage_daily (
  dimension TEXT NOT NULL,
  surface TEXT NOT NULL,
  value TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (dimension, surface, value, day)
) WITHOUT ROWID;
