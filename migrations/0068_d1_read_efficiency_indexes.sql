-- Reduce D1 rows_read for recurring analytics by supporting the dominant
-- event-type/session/time and click/session/time access patterns.
CREATE INDEX IF NOT EXISTS idx_funnel_type_session_created
  ON funnel_events(event_type, session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_click_session_created
  ON click_events(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_click_source_created
  ON click_events(source, created_at);
