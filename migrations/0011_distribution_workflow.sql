CREATE TABLE IF NOT EXISTS distribution_workflow (
  item_slug TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'research_required',
  submitted_at TEXT,
  response_at TEXT,
  live_url TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_distribution_workflow_status ON distribution_workflow(status);
