-- ToolScout 2.0 Phase 94
-- Complete migration ownership for Distribution Sender runtime schema.
-- Tables are already owned by migrations 0078, 0101 and 0103.
-- This migration formalizes the remaining reputation-learning lookup index.

CREATE INDEX IF NOT EXISTS idx_reputation_learning_lookup
  ON outbound_reputation_learning(template_id,issue_code,scope_type,enabled);
