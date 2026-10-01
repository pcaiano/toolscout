-- ToolScout 2.0 Phase 78
-- Formal schema ownership for Content Engine social intelligence.
-- Existing affiliate_social_policy_queue remains owned by migration 0080.

CREATE TABLE IF NOT EXISTS content_social_profiles(
  tool_slug TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  source_url TEXT,
  x_handle TEXT,
  bluesky_handle TEXT,
  bluesky_did TEXT,
  linkedin_url TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_checked_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affiliate_social_policy(
  tool_slug TEXT PRIMARY KEY,
  organic_social_allowed INTEGER,
  direct_affiliate_link_allowed INTEGER,
  redirect_allowed INTEGER,
  disclosure_required INTEGER NOT NULL DEFAULT 1,
  policy_status TEXT NOT NULL DEFAULT 'unknown',
  evidence_url TEXT,
  evidence_detail TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affiliate_social_evidence_registry(
  tool_slug TEXT PRIMARY KEY,
  evidence_url TEXT NOT NULL,
  classification_hint TEXT NOT NULL,
  evidence_note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_affiliate_redirects(
  redirect_id TEXT PRIMARY KEY,
  tool_slug TEXT NOT NULL,
  platform TEXT,
  utm_campaign TEXT,
  user_agent_hash TEXT,
  country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_social_affiliate_redirects_created
  ON social_affiliate_redirects(created_at);

CREATE INDEX IF NOT EXISTS idx_social_affiliate_redirects_tool_created
  ON social_affiliate_redirects(tool_slug,created_at);

CREATE TABLE IF NOT EXISTS content_engine_briefs(
  brief_id TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  commercial_mode TEXT NOT NULL,
  selected_tool_slug TEXT,
  mention_json TEXT,
  target_json TEXT,
  policy_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_profiles_status
  ON content_social_profiles(status,last_checked_at);

CREATE INDEX IF NOT EXISTS idx_affiliate_social_policy_status
  ON affiliate_social_policy(policy_status,last_checked_at);

CREATE TABLE IF NOT EXISTS growth_action_events(
  action_id TEXT PRIMARY KEY,
  opportunity_key TEXT,
  engine TEXT NOT NULL,
  channel TEXT,
  target_url TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_growth_action_events_created
  ON growth_action_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_growth_action_events_opportunity
  ON growth_action_events(opportunity_key,status);

CREATE TABLE IF NOT EXISTS distribution_contact_route_actions(
  route_id TEXT PRIMARY KEY,
  surface_slug TEXT NOT NULL,
  route_type TEXT NOT NULL,
  route_url TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  opportunity_slug TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_result TEXT,
  next_action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_route_actions_content
  ON distribution_contact_route_actions(execution_mode,status,updated_at);

CREATE INDEX IF NOT EXISTS idx_content_briefs_created
  ON content_engine_briefs(created_at DESC);
