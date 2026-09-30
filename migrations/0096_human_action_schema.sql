-- ToolScout 2.0 Phase 21
-- Human-action authentication and gate schemas belong to D1 migrations.
-- Request handlers probe readiness but do not create or alter schema.

CREATE TABLE IF NOT EXISTS auth_automation_capability(
  surface_slug TEXT PRIMARY KEY,
  automation_class TEXT NOT NULL,
  credential_kind TEXT,
  credential_header TEXT,
  credential_prefix TEXT,
  credential_state TEXT NOT NULL DEFAULT 'not_required',
  human_bootstrap_required INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_automation_class
  ON auth_automation_capability(automation_class,credential_state,updated_at);

CREATE TABLE IF NOT EXISTS auth_machine_credential(
  surface_slug TEXT PRIMARY KEY,
  credential_kind TEXT NOT NULL,
  header_name TEXT NOT NULL,
  prefix TEXT,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  last_used_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS human_gate_contract(
  gate_key TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  gate_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT,
  reason TEXT,
  instructions TEXT,
  action_url TEXT,
  resolution_mode TEXT NOT NULL DEFAULT 'verify_publication',
  payload_json TEXT,
  result_url TEXT,
  verification_url TEXT,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  next_verification_at TEXT,
  owner_completed_at TEXT,
  resolved_at TEXT,
  last_verification_at TEXT,
  verification_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_human_gate_status
  ON human_gate_contract(status,next_verification_at,updated_at);

CREATE INDEX IF NOT EXISTS idx_human_gate_subject
  ON human_gate_contract(engine,subject_type,subject_key);
