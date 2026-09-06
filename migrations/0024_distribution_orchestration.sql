CREATE TABLE IF NOT EXISTS distribution_asset_state (
  asset_url TEXT PRIMARY KEY,
  asset_type TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  distributed_at TEXT
);

CREATE TABLE IF NOT EXISTS distribution_editorial_queue (
  queue_id TEXT PRIMARY KEY,
  asset_url TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  target_name TEXT,
  target_url TEXT,
  angle TEXT,
  suggested_title TEXT,
  suggested_body TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  human_required INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_editorial_status ON distribution_editorial_queue(status,created_at DESC);
