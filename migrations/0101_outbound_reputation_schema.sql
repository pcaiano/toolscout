-- ToolScout 2.0 Phase 70
-- Formal ownership for outbound reputation override and learning state.
-- Preserves the exact table shapes previously created lazily at request time.

CREATE TABLE IF NOT EXISTS outbound_reputation_overrides (
  override_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  issue_codes TEXT,
  template_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  gmail_message_id TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS outbound_reputation_learning (
  rule_key TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  issue_code TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  content_hash TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  learned_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_override_token TEXT
);
