-- ToolScout 2.0 Phase 19
-- Engine run ledger schema belongs to migrations.
-- Runtime ledger functions may mutate run/lease/claim state, but schema
-- creation is never performed from request or scheduled execution paths.

CREATE TABLE IF NOT EXISTS engine_runs (
  run_id TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  mission TEXT NOT NULL,
  trigger_name TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  detail TEXT,
  evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_engine_runs_engine_started
  ON engine_runs(engine,started_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_runs_status_started
  ON engine_runs(status,started_at DESC);

CREATE INDEX IF NOT EXISTS idx_engine_runs_started
  ON engine_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS engine_run_leases (
  engine TEXT NOT NULL,
  mission TEXT NOT NULL,
  run_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  PRIMARY KEY(engine,mission)
);

CREATE TABLE IF NOT EXISTS engine_cycle_claims (
  engine TEXT NOT NULL,
  mission TEXT NOT NULL,
  cycle_key TEXT NOT NULL,
  owner TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  attempts INTEGER NOT NULL DEFAULT 1,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(engine,mission,cycle_key)
);

CREATE INDEX IF NOT EXISTS idx_engine_cycle_claims_updated
  ON engine_cycle_claims(updated_at DESC);
