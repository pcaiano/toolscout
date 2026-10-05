-- ToolScout 2.0 Finder embed product telemetry.
-- Stores publisher adoption and interaction evidence without raw Finder queries.

CREATE TABLE IF NOT EXISTS distribution_embed_events (
  event_id TEXT PRIMARY KEY,
  embed_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  publisher_id TEXT,
  source_host TEXT,
  asset_id TEXT,
  intent_slug TEXT,
  result_slug TEXT,
  result_count INTEGER,
  mode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_embed_events_created
  ON distribution_embed_events(created_at);

CREATE INDEX IF NOT EXISTS idx_distribution_embed_events_publisher
  ON distribution_embed_events(publisher_id,event_type,created_at);

CREATE INDEX IF NOT EXISTS idx_distribution_embed_events_source
  ON distribution_embed_events(source_host,embed_type,event_type,created_at);

-- Reframe already-prepared unsent publisher outreach around the Finder utility.
-- Sent and adopted rows are immutable and are never rewritten.
UPDATE distribution_network_outreach
SET suggested_subject='Free software Finder widget for ' || COALESCE(surface_name,domain,'your publication'),
    suggested_body='<p>Hello,</p><p>I''m Pedro Caiano from ToolScout. We built a free software discovery Finder that publishers can add with one script tag.</p><p>Visitors describe the job they need software to do and get a focused shortlist directly inside the publisher''s site. The recommendation logic is independent, with no pay to rank.</p><p>There is no paid placement, reciprocal link or exclusivity requirement. Finder Full and Finder Mini are both available.</p><p>If this could be useful for ' || COALESCE(surface_name,domain,'your publication') || ', the live demo and copy-paste embed code are here:<br><a href="https://trytoolscout.org/distribution/publisher-kit">https://trytoolscout.org/distribution/publisher-kit</a></p><p>Best regards,<br>Pedro Caiano<br>ToolScout<br><a href="https://trytoolscout.org">trytoolscout.org</a></p>',
    updated_at=datetime('now')
WHERE outreach_sent_at IS NULL
  AND status IN ('queued','contact_route_found','contact_found','send_failed','reputation_quarantine');

