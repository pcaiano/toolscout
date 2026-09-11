ALTER TABLE affiliate_coverage_runs
ADD COLUMN traffic_truth TEXT NOT NULL DEFAULT 'legacy_session_classification'
CHECK (traffic_truth IN ('legacy_session_classification','browser_confirmed'));

CREATE INDEX IF NOT EXISTS idx_affiliate_coverage_runs_truth_created_at
ON affiliate_coverage_runs(traffic_truth, created_at DESC);
