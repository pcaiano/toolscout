-- ToolScout 2.0 Phase 80
-- Complete Distribution Network route schema ownership.
-- distribution_network_outreach is owned by migration 0078.
-- distribution_contact_route_actions is owned by migration 0103.

CREATE TABLE IF NOT EXISTS distribution_contact_routes (
  route_id TEXT PRIMARY KEY,
  surface_slug TEXT NOT NULL,
  domain TEXT NOT NULL,
  route_type TEXT NOT NULL,
  route_url TEXT NOT NULL,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_contact_routes_surface
  ON distribution_contact_routes(surface_slug,status);

CREATE INDEX IF NOT EXISTS idx_distribution_contact_routes_domain
  ON distribution_contact_routes(domain,route_type);

CREATE INDEX IF NOT EXISTS idx_distribution_contact_route_actions_status
  ON distribution_contact_route_actions(status,updated_at);

CREATE INDEX IF NOT EXISTS idx_distribution_contact_route_actions_surface
  ON distribution_contact_route_actions(surface_slug,status);
