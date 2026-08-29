CREATE TABLE IF NOT EXISTS tool_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  status INTEGER NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_tool ON tool_health(tool_slug);
CREATE INDEX IF NOT EXISTS idx_health_checked ON tool_health(checked_at);
