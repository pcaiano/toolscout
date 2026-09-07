CREATE TABLE IF NOT EXISTS distribution_discovery_sources (
  source_slug TEXT PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  source_host TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'recursive',
  parent_surface_slug TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  last_scanned_at TEXT,
  links_seen INTEGER NOT NULL DEFAULT 0,
  relevant_links_seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_distribution_discovery_sources_status ON distribution_discovery_sources(status, confidence DESC, updated_at DESC);
