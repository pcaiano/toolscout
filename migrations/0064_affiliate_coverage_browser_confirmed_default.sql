ALTER TABLE affiliate_coverage_runs RENAME TO affiliate_coverage_runs_legacy_default;

DROP INDEX IF EXISTS idx_affiliate_coverage_runs_truth_created_at;

CREATE TABLE affiliate_coverage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  human_outbound_clicks INTEGER NOT NULL DEFAULT 0,
  monetized_human_outbound_clicks INTEGER NOT NULL DEFAULT 0,
  unmonetized_human_outbound_clicks INTEGER NOT NULL DEFAULT 0,
  weighted_coverage REAL,
  queue_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  traffic_truth TEXT NOT NULL DEFAULT 'browser_confirmed'
    CHECK (traffic_truth IN ('legacy_session_classification','browser_confirmed'))
);

INSERT INTO affiliate_coverage_runs(
  id,
  human_outbound_clicks,
  monetized_human_outbound_clicks,
  unmonetized_human_outbound_clicks,
  weighted_coverage,
  queue_size,
  created_at,
  traffic_truth
)
SELECT
  id,
  human_outbound_clicks,
  monetized_human_outbound_clicks,
  unmonetized_human_outbound_clicks,
  weighted_coverage,
  queue_size,
  created_at,
  traffic_truth
FROM affiliate_coverage_runs_legacy_default;

DROP TABLE affiliate_coverage_runs_legacy_default;

CREATE INDEX IF NOT EXISTS idx_affiliate_coverage_runs_truth_created_at
ON affiliate_coverage_runs(traffic_truth, created_at DESC);
