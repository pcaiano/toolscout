-- ToolScout 2.0 Phase 74
-- Formal ownership for affiliate reply ingestion state.
-- Preserves the exact table shape previously created lazily at request time.

CREATE TABLE IF NOT EXISTS affiliate_reply_events(
  message_id TEXT PRIMARY KEY,
  sender TEXT,
  subject TEXT,
  matched_tool_slug TEXT,
  decision TEXT,
  affiliate_url TEXT,
  status TEXT NOT NULL,
  received_at TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
