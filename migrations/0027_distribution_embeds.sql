CREATE TABLE IF NOT EXISTS distribution_embed_clicks (
  click_id TEXT PRIMARY KEY,
  embed_type TEXT NOT NULL,
  source_host TEXT,
  placement TEXT,
  target_url TEXT NOT NULL,
  referrer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_distribution_embed_clicks_created ON distribution_embed_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_distribution_embed_clicks_source ON distribution_embed_clicks(source_host,embed_type,created_at);
