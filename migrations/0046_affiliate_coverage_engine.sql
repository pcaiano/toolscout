CREATE TABLE IF NOT EXISTS affiliate_coverage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  human_outbound_clicks INTEGER NOT NULL DEFAULT 0,
  monetized_human_outbound_clicks INTEGER NOT NULL DEFAULT 0,
  unmonetized_human_outbound_clicks INTEGER NOT NULL DEFAULT 0,
  weighted_coverage REAL,
  queue_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affiliate_program_discovery (
  tool_slug TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'research_required',
  official_program_url TEXT,
  application_url TEXT,
  network TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  automation_mode TEXT NOT NULL DEFAULT 'research',
  confidence INTEGER NOT NULL DEFAULT 0,
  blocker TEXT,
  last_checked TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_affiliate_program_discovery_status ON affiliate_program_discovery(status, confidence DESC, updated_at DESC);
