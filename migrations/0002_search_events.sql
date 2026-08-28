CREATE TABLE IF NOT EXISTS search_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_slug TEXT NOT NULL DEFAULT 'general',
  profile_json TEXT NOT NULL DEFAULT '{}',
  session_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'search',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_intent ON search_events(intent_slug);
CREATE INDEX IF NOT EXISTS idx_search_created ON search_events(created_at);
