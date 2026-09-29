-- ToolScout 2.0 Phase 6
-- Move catalog runtime schema ownership out of request-time execution.
-- Additive and idempotent: production may already contain these tables from
-- the former runtime ensureSchema() path.

CREATE TABLE IF NOT EXISTS catalog_runtime_state(
  tool_slug TEXT PRIMARY KEY,
  source_url TEXT,
  source_status TEXT,
  http_status INTEGER,
  final_url TEXT,
  fingerprint TEXT,
  pending_fingerprint TEXT,
  change_confirmations INTEGER NOT NULL DEFAULT 0,
  content_changed INTEGER NOT NULL DEFAULT 0,
  broken_consecutive INTEGER NOT NULL DEFAULT 0,
  quality_status TEXT NOT NULL DEFAULT 'unverified',
  static_last_verified TEXT,
  last_checked_at TEXT,
  last_change_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_runtime_quality
  ON catalog_runtime_state(quality_status,last_checked_at);

CREATE TABLE IF NOT EXISTS catalog_runtime_candidates(
  tool_slug TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  source_status TEXT,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_runtime_candidates_status
  ON catalog_runtime_candidates(status,updated_at);

CREATE TABLE IF NOT EXISTS catalog_quality_audit(
  tool_slug TEXT PRIMARY KEY,
  quality_status TEXT NOT NULL,
  issues_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  source_status TEXT,
  source_url TEXT,
  logo_url TEXT,
  logo_provenance TEXT,
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_quality_status
  ON catalog_quality_audit(quality_status,last_checked_at);

CREATE TABLE IF NOT EXISTS catalog_market_gaps(
  tool_slug TEXT PRIMARY KEY,
  signals INTEGER NOT NULL DEFAULT 0,
  sources_json TEXT NOT NULL DEFAULT '[]',
  examples_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'research_required',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS catalog_runtime_events(
  event_id TEXT PRIMARY KEY,
  tool_slug TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_events_created
  ON catalog_runtime_events(created_at DESC);

CREATE TABLE IF NOT EXISTS software_news_candidates(
  candidate_id TEXT PRIMARY KEY,
  tool_slug TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  materiality_score REAL NOT NULL DEFAULT 0,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_software_news_status
  ON software_news_candidates(status,materiality_score DESC,updated_at DESC);

CREATE TABLE IF NOT EXISTS software_news_sources(
  source_url TEXT PRIMARY KEY,
  tool_slug TEXT NOT NULL,
  fingerprint TEXT,
  title TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_checked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_software_news_sources_checked
  ON software_news_sources(status,last_checked_at);
