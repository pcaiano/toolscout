-- ToolScout 2.0: move mission-integrity evidence schema out of runtime.

CREATE TABLE IF NOT EXISTS external_engine_evidence(
  evidence_id TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  external_id TEXT,
  detail TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_external_engine_evidence_engine_mission
  ON external_engine_evidence(engine,mission_id,created_at DESC);
