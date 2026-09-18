-- Content Engine social intelligence, affiliate social policy and social affiliate attribution.
CREATE TABLE IF NOT EXISTS content_social_profiles(
  tool_slug TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  source_url TEXT,
  x_handle TEXT,
  bluesky_handle TEXT,
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

CREATE TABLE IF NOT EXISTS social_affiliate_redirects(
  redirect_id TEXT PRIMARY KEY,
  tool_slug TEXT NOT NULL,
  platform TEXT,
  utm_campaign TEXT,
  user_agent_hash TEXT,
  country TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_profiles_status ON content_social_profiles(status,last_checked_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_social_policy_status ON affiliate_social_policy(policy_status,last_checked_at);
CREATE INDEX IF NOT EXISTS idx_content_briefs_created ON content_engine_briefs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_affiliate_redirects_created ON social_affiliate_redirects(created_at);
CREATE INDEX IF NOT EXISTS idx_social_affiliate_redirects_tool_created ON social_affiliate_redirects(tool_slug,created_at);
