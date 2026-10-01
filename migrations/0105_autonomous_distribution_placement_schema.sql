-- ToolScout 2.0 Phase 89
-- Formal schema ownership for autonomous distribution placement verification.
-- Existing production tables created by the legacy runtime are adopted idempotently.

CREATE TABLE IF NOT EXISTS distribution_placements (
  surface_slug TEXT PRIMARY KEY,
  public_url TEXT NOT NULL,
  placement_verified INTEGER NOT NULL DEFAULT 0,
  backlink_verified INTEGER NOT NULL DEFAULT 0,
  link_rel TEXT,
  first_verified_at TEXT,
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_placements_backlink
  ON distribution_placements(backlink_verified,updated_at DESC);
