ALTER TABLE affiliate_program_discovery ADD COLUMN last_error TEXT;
ALTER TABLE affiliate_program_discovery ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE affiliate_program_discovery ADD COLUMN next_check_at TEXT;
CREATE INDEX IF NOT EXISTS idx_affiliate_program_discovery_next_check ON affiliate_program_discovery(next_check_at, confidence DESC);
