CREATE TABLE IF NOT EXISTS affiliate_workflow (
  tool_slug TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'research_required',
  submitted_at TEXT,
  response_at TEXT,
  affiliate_url TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_workflow_status
  ON affiliate_workflow(status);
