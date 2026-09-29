-- ToolScout 2.0: move Growth Planner state schema out of runtime execution.
-- Additive only. Existing rows and indexes are preserved.

CREATE TABLE IF NOT EXISTS growth_opportunity_state(
  opportunity_key TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0,
  signal_json TEXT NOT NULL,
  action_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_growth_opportunity_priority
  ON growth_opportunity_state(status,priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_growth_opportunity_subject
  ON growth_opportunity_state(subject_type,subject_key);

CREATE TABLE IF NOT EXISTS growth_rnd_experiments(
  experiment_key TEXT PRIMARY KEY,
  experiment_type TEXT NOT NULL,
  subject_key TEXT,
  hypothesis TEXT NOT NULL,
  action_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  risk_class TEXT NOT NULL DEFAULT 'bounded',
  expected_signal TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_growth_rnd_status
  ON growth_rnd_experiments(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_rnd_frontier(
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
  ON growth_rnd_frontier(status,automation_score DESC,updated_at DESC);

CREATE TABLE IF NOT EXISTS growth_asset_cache(
  path TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  source_generated_at TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
