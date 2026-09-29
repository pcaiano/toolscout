-- ToolScout 2.0 Phase 18
-- Complete mission-integrity schema ownership in D1 migrations.
-- Migration 0088 already owns the table and engine/mission index.

CREATE INDEX IF NOT EXISTS idx_external_engine_evidence_created
  ON external_engine_evidence(created_at DESC);
