-- External affiliate-network click evidence.
-- These rows are cumulative vendor/network counters and MUST NOT be summed with
-- first-party verified or social redirect counters because the populations overlap.

CREATE TABLE IF NOT EXISTS affiliate_network_click_evidence (
  evidence_key TEXT PRIMARY KEY,
  tool_slug TEXT NOT NULL,
  provider TEXT NOT NULL,
  programme TEXT,
  account_email TEXT,
  programme_status TEXT,
  reported_clicks_total INTEGER NOT NULL,
  reported_conversions_total INTEGER,
  pending_commission_amount REAL,
  currency TEXT,
  observed_at TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_network_click_evidence_tool_observed
  ON affiliate_network_click_evidence(tool_slug, observed_at DESC);

INSERT OR IGNORE INTO affiliate_network_click_evidence(
  evidence_key,
  tool_slug,
  provider,
  programme,
  reported_clicks_total,
  observed_at,
  evidence_source,
  note
) VALUES(
  'partnerstack:apollo:first-10:2026-09-25T17:12:28Z',
  'apollo',
  'partnerstack',
  'apollo',
  10,
  '2026-09-25 17:12:28',
  'partnerstack_email_milestone',
  'PartnerStack/Apollo milestone email confirmed the affiliate link had reached its first 10 clicks.'
);
