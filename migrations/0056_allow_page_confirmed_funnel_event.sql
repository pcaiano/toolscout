CREATE TABLE funnel_events_v2 (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'session_started',
    'page_confirmed',
    'recommendation_started',
    'recommendation_completed',
    'recommendation_result_viewed',
    'tool_viewed',
    'outbound_clicked'
  )),
  intent_slug TEXT,
  tool_slug TEXT,
  path TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  referrer_host TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO funnel_events_v2 (
  event_id,
  session_id,
  event_type,
  intent_slug,
  tool_slug,
  path,
  source,
  referrer_host,
  created_at
)
SELECT
  event_id,
  session_id,
  event_type,
  intent_slug,
  tool_slug,
  path,
  source,
  referrer_host,
  created_at
FROM funnel_events;

DROP TABLE funnel_events;
ALTER TABLE funnel_events_v2 RENAME TO funnel_events;

CREATE INDEX IF NOT EXISTS idx_funnel_session ON funnel_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_type_created ON funnel_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_intent ON funnel_events(intent_slug, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_tool ON funnel_events(tool_slug, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_source ON funnel_events(source, event_type, created_at);
