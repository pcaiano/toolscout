CREATE TABLE IF NOT EXISTS distribution_vendor_amplification (
  tool_slug TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  vendor_domain TEXT,
  contact_name TEXT,
  contact_email TEXT,
  suggested_subject TEXT,
  suggested_body TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(tool_slug,asset_url)
);
CREATE INDEX IF NOT EXISTS idx_vendor_amplification_status ON distribution_vendor_amplification(status,priority_score DESC);
