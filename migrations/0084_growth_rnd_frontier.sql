CREATE TABLE IF NOT EXISTS growth_rnd_frontier (
  idea_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mechanism TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  automation_score INTEGER NOT NULL DEFAULT 0,
  semi_passive_score INTEGER NOT NULL DEFAULT 0,
  implementation_mode TEXT NOT NULL DEFAULT 'one_time_build',
  status TEXT NOT NULL DEFAULT 'candidate',
  expected_signal TEXT,
  next_step TEXT,
  action_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_growth_rnd_frontier_status
  ON growth_rnd_frontier(status, automation_score DESC, updated_at DESC);
