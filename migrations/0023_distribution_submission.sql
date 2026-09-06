CREATE TABLE IF NOT EXISTS distribution_submissions (
  submission_id TEXT PRIMARY KEY,
  surface_slug TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  payload_json TEXT,
  action_url TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  submitted_at TEXT,
  response_url TEXT,
  error TEXT,
  human_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_distribution_submission_unique ON distribution_submissions(surface_slug,asset_url,submission_type);
CREATE INDEX IF NOT EXISTS idx_distribution_submission_status ON distribution_submissions(status,human_required,created_at);
