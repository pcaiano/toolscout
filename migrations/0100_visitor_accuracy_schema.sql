-- ToolScout 2.0 Phase 65
-- Move visitor accuracy schema creation out of request runtime.

CREATE TABLE IF NOT EXISTS visitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  path TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  referrer_host TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at
  ON visitor_events(created_at);

CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_id
  ON visitor_events(visitor_id);

CREATE TABLE IF NOT EXISTS visitor_tracking_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO visitor_tracking_meta(key,value)
VALUES('tracking_started_at',datetime('now'));
