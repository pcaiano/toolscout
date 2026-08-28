CREATE TABLE IF NOT EXISTS click_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  intent_slug TEXT NOT NULL DEFAULT 'general',
  session_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'recommendation',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_click_tool ON click_events(tool_slug);
CREATE INDEX IF NOT EXISTS idx_click_intent ON click_events(intent_slug);
CREATE INDEX IF NOT EXISTS idx_click_created ON click_events(created_at);
