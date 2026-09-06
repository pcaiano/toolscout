CREATE TABLE IF NOT EXISTS distribution_opportunities (
  surface_slug TEXT PRIMARY KEY,
  surface_name TEXT NOT NULL,
  surface_type TEXT NOT NULL,
  audience_fit REAL NOT NULL DEFAULT 0,
  authority REAL NOT NULL DEFAULT 0,
  traffic_potential REAL NOT NULL DEFAULT 0,
  backlink_value REAL NOT NULL DEFAULT 0,
  acceptance_probability REAL NOT NULL DEFAULT 0,
  automation_potential REAL NOT NULL DEFAULT 0,
  effort_cost REAL NOT NULL DEFAULT 0,
  distribution_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate',
  action_url TEXT,
  live_url TEXT,
  human_required INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  next_action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_opportunities_score ON distribution_opportunities(distribution_score DESC);
CREATE INDEX IF NOT EXISTS idx_distribution_opportunities_status ON distribution_opportunities(status);

CREATE TABLE IF NOT EXISTS distribution_events (
  event_id TEXT PRIMARY KEY,
  surface_slug TEXT,
  event_type TEXT NOT NULL,
  status TEXT,
  asset_type TEXT,
  asset_id TEXT,
  source_url TEXT,
  destination_url TEXT,
  detail TEXT,
  human_sessions INTEGER,
  outbound_clicks INTEGER,
  monetized_outbound INTEGER,
  revenue REAL,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_events_created ON distribution_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_distribution_events_surface ON distribution_events(surface_slug,created_at DESC);

CREATE TABLE IF NOT EXISTS distribution_embeds (
  embed_id TEXT PRIMARY KEY,
  embed_type TEXT NOT NULL,
  publisher_host TEXT,
  asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'observed',
  impressions INTEGER NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_embeds_publisher ON distribution_embeds(publisher_host,status);
