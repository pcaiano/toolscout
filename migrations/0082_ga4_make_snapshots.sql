CREATE TABLE IF NOT EXISTS ga4_make_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'make_google_analytics_4',
  property_id TEXT,
  measurement_id TEXT,
  timezone TEXT,
  sessions_today INTEGER NOT NULL DEFAULT 0,
  sessions_24h INTEGER NOT NULL DEFAULT 0,
  sessions_mtd INTEGER NOT NULL DEFAULT 0,
  users_today INTEGER NOT NULL DEFAULT 0,
  active_users_today INTEGER NOT NULL DEFAULT 0,
  users_mtd INTEGER NOT NULL DEFAULT 0,
  daily_average_mtd REAL NOT NULL DEFAULT 0,
  projected_month INTEGER NOT NULL DEFAULT 0,
  sources_json TEXT NOT NULL DEFAULT '[]',
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_ga4_make_snapshots_received
ON ga4_make_snapshots(received_at DESC);
