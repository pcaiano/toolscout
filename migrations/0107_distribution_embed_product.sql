-- ToolScout 2.0 Finder embed product telemetry.
-- Stores publisher adoption and interaction evidence without raw Finder queries.

CREATE TABLE IF NOT EXISTS distribution_embed_events (
  event_id TEXT PRIMARY KEY,
  embed_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  publisher_id TEXT,
  source_host TEXT,
  asset_id TEXT,
  intent_slug TEXT,
  result_slug TEXT,
  result_count INTEGER,
  mode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_embed_events_created
  ON distribution_embed_events(created_at);

CREATE INDEX IF NOT EXISTS idx_distribution_embed_events_publisher
  ON distribution_embed_events(publisher_id,event_type,created_at);

CREATE INDEX IF NOT EXISTS idx_distribution_embed_events_source
  ON distribution_embed_events(source_host,embed_type,event_type,created_at);
