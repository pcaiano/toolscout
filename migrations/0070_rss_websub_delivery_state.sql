CREATE TABLE IF NOT EXISTS distribution_rss_state (
  feed_url TEXT PRIMARY KEY,
  content_sha256 TEXT,
  last_checked_at TEXT,
  last_changed_at TEXT,
  last_ping_at TEXT,
  last_ping_status TEXT,
  last_http_status INTEGER,
  last_error TEXT,
  ping_count INTEGER NOT NULL DEFAULT 0,
  change_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO distribution_rss_state(feed_url,created_at,updated_at)
VALUES('https://trytoolscout.org/feed.xml',datetime('now'),datetime('now'));
