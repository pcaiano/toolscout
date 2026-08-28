CREATE INDEX IF NOT EXISTS idx_click_events_intent_date
  ON click_events(intent_slug, created_at);

CREATE INDEX IF NOT EXISTS idx_click_events_tool_date
  ON click_events(tool_slug, created_at);
