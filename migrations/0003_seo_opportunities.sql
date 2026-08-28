CREATE TABLE IF NOT EXISTS seo_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_slug TEXT NOT NULL UNIQUE,
  search_sessions INTEGER NOT NULL DEFAULT 0,
  commercial_score INTEGER NOT NULL DEFAULT 0,
  catalog_score INTEGER NOT NULL DEFAULT 0,
  duplication_penalty INTEGER NOT NULL DEFAULT 0,
  opportunity_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seo_status ON seo_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_seo_score ON seo_opportunities(opportunity_score DESC);
