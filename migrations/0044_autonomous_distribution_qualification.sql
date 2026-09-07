CREATE TABLE IF NOT EXISTS distribution_auto_adapters (
  surface_slug TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  content_type TEXT NOT NULL DEFAULT 'application/json',
  payload_template_json TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  policy_state TEXT NOT NULL DEFAULT 'research_required',
  verification_source TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_distribution_auto_adapters_state ON distribution_auto_adapters(policy_state,confidence DESC);

CREATE TABLE IF NOT EXISTS distribution_qualification_events (
  qualification_id TEXT PRIMARY KEY,
  surface_slug TEXT NOT NULL,
  source_url TEXT,
  result TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_distribution_qualification_surface ON distribution_qualification_events(surface_slug,created_at DESC);
