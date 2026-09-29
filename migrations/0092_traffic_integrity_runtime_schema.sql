-- ToolScout 2.0 Phase 16
-- Traffic integrity and Command Center optimization schema belongs to migrations.
-- Additive and idempotent on databases where legacy runtime already created objects.

CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_created_visitor
  ON confirmed_visitor_events(created_at,visitor_id);

CREATE INDEX IF NOT EXISTS idx_funnel_event_type_created_session
  ON funnel_events(event_type,created_at,session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_classification_session
  ON sessions(classification,session_id);

CREATE INDEX IF NOT EXISTS idx_traffic_guard_decision_created_session
  ON traffic_guard_events(decision,created_at,session_id);

CREATE INDEX IF NOT EXISTS idx_traffic_guard_session_decision_created
  ON traffic_guard_events(session_id,decision,created_at);

CREATE INDEX IF NOT EXISTS idx_traffic_guard_suspicious_created
  ON traffic_guard_events(suspicious_direct,created_at);

CREATE INDEX IF NOT EXISTS idx_traffic_human_evidence_visitor
  ON traffic_human_evidence(visitor_id,first_evidence_at);

CREATE TABLE IF NOT EXISTS command_center_daily_metrics (
  day TEXT PRIMARY KEY,
  human_sessions INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,
  monetized_outbound INTEGER NOT NULL DEFAULT 0,
  unmonetized_outbound INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_command_center_daily_updated
  ON command_center_daily_metrics(updated_at);

INSERT OR IGNORE INTO traffic_integrity_meta(key,value)
VALUES('confirmed_tracking_started_at',datetime('now'));

INSERT OR IGNORE INTO traffic_integrity_meta(key,value)
VALUES('strict_human_tracking_started_at',datetime('now'));
