CREATE TABLE IF NOT EXISTS distribution_delivery_state (
  submission_id TEXT PRIMARY KEY,
  surface_slug TEXT NOT NULL,
  retry_after_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  rate_limit_count INTEGER NOT NULL DEFAULT 0,
  last_retry_delay_seconds INTEGER,
  last_network_attempt_at TEXT,
  verification_state TEXT NOT NULL DEFAULT 'untracked',
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  first_verification_at TEXT,
  last_verification_at TEXT,
  next_verification_at TEXT,
  verified_at TEXT,
  rejected_at TEXT,
  stale_at TEXT,
  time_to_verify_seconds INTEGER,
  last_http_status INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_delivery_retry
  ON distribution_delivery_state(surface_slug, retry_after_at);

CREATE INDEX IF NOT EXISTS idx_distribution_delivery_verification
  ON distribution_delivery_state(verification_state, next_verification_at);
