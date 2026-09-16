CREATE TABLE IF NOT EXISTS confirmed_visitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  referrer_host TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(visitor_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_created_at
  ON confirmed_visitor_events(created_at);
CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_visitor_id
  ON confirmed_visitor_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_session_id
  ON confirmed_visitor_events(session_id);

CREATE TABLE IF NOT EXISTS traffic_integrity_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO traffic_integrity_meta (key, value)
VALUES ('confirmed_tracking_started_at', datetime('now'));

CREATE TABLE IF NOT EXISTS traffic_integrity_heartbeat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_traffic_integrity_heartbeat_created_at
  ON traffic_integrity_heartbeat(created_at);
