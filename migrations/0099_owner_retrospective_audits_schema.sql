-- ToolScout 2.0 Phase 51
-- Move owner_retrospective_audits ownership out of request-time runtime.

CREATE TABLE IF NOT EXISTS owner_retrospective_audits (
  audit_key TEXT PRIMARY KEY,
  visitor_hash TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  total_confirmed_sessions INTEGER NOT NULL,
  owner_visitor_events INTEGER NOT NULL,
  high_confidence_matches INTEGER NOT NULL,
  medium_confidence_matches INTEGER NOT NULL,
  ambiguous_matches INTEGER NOT NULL,
  definite_owner_sessions INTEGER NOT NULL,
  unmatched_sessions INTEGER NOT NULL,
  details_json TEXT NOT NULL,
  audited_at TEXT NOT NULL DEFAULT (datetime('now'))
);
