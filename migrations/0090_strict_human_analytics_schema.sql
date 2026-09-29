-- ToolScout 2.0 Phase 3: strict-human analytics schema belongs to migrations.
-- Safe on databases where legacy runtime already created these objects.

CREATE TABLE IF NOT EXISTS traffic_integrity_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traffic_human_evidence (
  session_id TEXT PRIMARY KEY,
  visitor_id TEXT,
  evidence_type TEXT NOT NULL,
  evidence_strength INTEGER NOT NULL DEFAULT 1,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  first_path TEXT,
  last_path TEXT,
  source TEXT,
  referrer_host TEXT,
  country TEXT,
  asn INTEGER,
  first_evidence_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_evidence_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_traffic_human_evidence_created
  ON traffic_human_evidence(first_evidence_at);

INSERT OR IGNORE INTO traffic_integrity_meta(key,value)
VALUES('strict_human_tracking_started_at',datetime('now'));
