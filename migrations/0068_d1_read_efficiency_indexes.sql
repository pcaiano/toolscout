-- Reduce D1 rows_read for recurring analytics by supporting both
-- session-oriented lookups and time-window scans.
CREATE INDEX IF NOT EXISTS idx_funnel_type_session_created
  ON funnel_events(event_type, session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_funnel_type_created_session
  ON funnel_events(event_type, created_at, session_id);

CREATE INDEX IF NOT EXISTS idx_click_session_created
  ON click_events(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_click_created_session
  ON click_events(created_at, session_id);

CREATE INDEX IF NOT EXISTS idx_click_source_created
  ON click_events(source, created_at);
