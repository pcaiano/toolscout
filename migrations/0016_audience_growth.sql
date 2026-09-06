CREATE TABLE IF NOT EXISTS audience_events (
  event_id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  event_type TEXT NOT NULL,
  direction TEXT,
  status TEXT,
  actor_handle TEXT,
  post_uri TEXT,
  parent_uri TEXT,
  content_id TEXT,
  context_text TEXT,
  suggestion_text TEXT,
  risk TEXT,
  followers INTEGER,
  impressions INTEGER,
  reactions INTEGER,
  replies INTEGER,
  reposts INTEGER,
  source TEXT,
  observed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audience_events_platform_created ON audience_events(platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audience_events_status_created ON audience_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audience_events_type_created ON audience_events(event_type, created_at DESC);
