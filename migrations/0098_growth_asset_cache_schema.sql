-- ToolScout 2.0 Phase 28
-- Move growth_asset_cache ownership out of Cloudflare request/scheduled runtime.
-- Additive and idempotent for production databases where runtime previously
-- created the table.

CREATE TABLE IF NOT EXISTS growth_asset_cache(
  path TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  source_generated_at TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
