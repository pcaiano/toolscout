-- Newsletter HubSpot delivery state for direct CRM sync.

ALTER TABLE newsletter_subscribers ADD COLUMN hubspot_sync_error TEXT;
ALTER TABLE newsletter_subscribers ADD COLUMN hubspot_sync_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_subscribers ADD COLUMN hubspot_subscription_type_id TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_hubspot_retry
  ON newsletter_subscribers(hubspot_sync_status,hubspot_sync_attempts,updated_at);
