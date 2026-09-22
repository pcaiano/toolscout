CREATE TABLE IF NOT EXISTS ga4_make_bridge_config (
  id INTEGER PRIMARY KEY CHECK(id=1),
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  rotated_at TEXT
);
