ALTER TABLE distribution_vendor_amplification ADD COLUMN contact_source_url TEXT;
ALTER TABLE distribution_vendor_amplification ADD COLUMN contact_method TEXT;
ALTER TABLE distribution_vendor_amplification ADD COLUMN contact_checked_at TEXT;
ALTER TABLE distribution_vendor_amplification ADD COLUMN discovery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distribution_vendor_amplification ADD COLUMN outreach_sent_at TEXT;
ALTER TABLE distribution_vendor_amplification ADD COLUMN outreach_error TEXT;

CREATE INDEX IF NOT EXISTS idx_vendor_amplification_contact ON distribution_vendor_amplification(status, contact_method, priority_score DESC);
