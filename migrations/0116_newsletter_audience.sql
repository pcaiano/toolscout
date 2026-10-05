-- ToolScout 2.0 newsletter audience capture
-- First-party subscriber ledger. HubSpot sync is intentionally a downstream
-- operation so public signup never depends on an external CRM being available.

CREATE TABLE IF NOT EXISTS newsletter_subscribers(
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'subscribed',
  source TEXT NOT NULL DEFAULT 'unknown',
  source_path TEXT,
  consent_version TEXT NOT NULL DEFAULT 'toolscout-updates-v1',
  first_subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT,
  hubspot_sync_status TEXT NOT NULL DEFAULT 'pending',
  hubspot_contact_id TEXT,
  hubspot_synced_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
  ON newsletter_subscribers(status,last_subscribed_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_hubspot
  ON newsletter_subscribers(hubspot_sync_status,updated_at);

CREATE TABLE IF NOT EXISTS newsletter_events(
  event_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT,
  source_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_events_created
  ON newsletter_events(created_at DESC);
