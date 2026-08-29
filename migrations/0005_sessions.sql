CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'direct',
  owner_flag INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_first_seen ON sessions(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_flag);
