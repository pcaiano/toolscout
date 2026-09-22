CREATE TABLE IF NOT EXISTS google_oauth_connections (
  provider TEXT PRIMARY KEY CHECK (provider = 'google_analytics'),
  owner_email TEXT NOT NULL,
  property_id TEXT,
  measurement_id TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_refresh_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_connections_updated
ON google_oauth_connections(updated_at);
