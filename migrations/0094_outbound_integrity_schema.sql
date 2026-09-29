-- ToolScout 2.0 Phase 19
-- Outbound integrity schema belongs to migrations.
-- Runtime GET health/stats paths only probe readiness; /go/* event recording
-- remains an intentional write path.

CREATE TABLE IF NOT EXISTS verified_outbound_events (
  proof_key TEXT PRIMARY KEY,
  click_id INTEGER,
  click_ref TEXT,
  session_id TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  source TEXT NOT NULL,
  affiliate_active_at_click INTEGER,
  proof_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verified_outbound_created
  ON verified_outbound_events(created_at);

CREATE INDEX IF NOT EXISTS idx_verified_outbound_session
  ON verified_outbound_events(session_id,created_at);

CREATE INDEX IF NOT EXISTS idx_verified_outbound_created_affiliate
  ON verified_outbound_events(created_at,affiliate_active_at_click);

CREATE INDEX IF NOT EXISTS idx_verified_outbound_tool_created
  ON verified_outbound_events(tool_slug,created_at);

CREATE TABLE IF NOT EXISTS outbound_integrity_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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

INSERT OR IGNORE INTO outbound_integrity_meta(key,value)
VALUES('tracking_started_at',datetime('now'));

INSERT OR IGNORE INTO traffic_integrity_meta(key,value)
VALUES('strict_human_tracking_started_at',datetime('now'));
