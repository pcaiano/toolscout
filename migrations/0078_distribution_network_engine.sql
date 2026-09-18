-- Distribution Network Engine 2.1 publisher outreach and adoption state.
CREATE TABLE IF NOT EXISTS distribution_network_outreach (
  surface_slug TEXT PRIMARY KEY,
  surface_name TEXT NOT NULL,
  surface_type TEXT,
  domain TEXT NOT NULL,
  source_url TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  contact_email TEXT,
  contact_source_url TEXT,
  contact_checked_at TEXT,
  discovery_attempts INTEGER NOT NULL DEFAULT 0,
  suggested_subject TEXT,
  suggested_body TEXT,
  public_dispatch_token TEXT UNIQUE,
  public_dispatch_leased_at TEXT,
  outreach_sent_at TEXT,
  outreach_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  adopted_at TEXT,
  adoption_kind TEXT,
  last_observed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_network_status_priority
  ON distribution_network_outreach(status, priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_distribution_network_domain
  ON distribution_network_outreach(domain);
