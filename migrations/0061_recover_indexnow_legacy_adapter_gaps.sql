-- Preserve the legacy IndexNow adapter-missing state before recovering those URLs.
-- These rows were created while the IndexNow adapter path was not yet reliable.
-- The current adapter is verified, automatic and zero-cost, so they should be retried
-- rather than remain permanent automation gaps.

CREATE TABLE IF NOT EXISTS distribution_submission_reconciliation_audit (
  submission_id TEXT NOT NULL,
  surface_slug TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  prior_submission_type TEXT NOT NULL,
  prior_status TEXT NOT NULL,
  prior_error TEXT,
  reconciled_to_status TEXT NOT NULL,
  reconciliation_reason TEXT NOT NULL,
  reconciled_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (submission_id, reconciliation_reason)
);

INSERT OR IGNORE INTO distribution_submission_reconciliation_audit (
  submission_id,
  surface_slug,
  asset_url,
  prior_submission_type,
  prior_status,
  prior_error,
  reconciled_to_status,
  reconciliation_reason,
  reconciled_at
)
SELECT
  submission_id,
  surface_slug,
  asset_url,
  submission_type,
  status,
  error,
  'ready',
  'indexnow_verified_adapter_recovery_2026_09_11',
  datetime('now')
FROM distribution_submissions
WHERE surface_slug='indexnow'
  AND status='adapter_missing'
  AND error='adapter_not_verified';

UPDATE distribution_submissions
SET submission_type='http_json',
    status='ready',
    human_required=0,
    error=NULL,
    updated_at=datetime('now')
WHERE surface_slug='indexnow'
  AND status='adapter_missing'
  AND error='adapter_not_verified';

INSERT INTO distribution_events (
  event_id,
  event_type,
  status,
  asset_type,
  detail,
  observed_at,
  created_at
)
SELECT
  'indexnow_reconcile_' || lower(hex(randomblob(16))),
  'indexnow_adapter_reconciliation',
  'completed',
  'distribution_engine',
  'Recovered ' || COUNT(*) || ' legacy IndexNow adapter-missing submission row(s) into the verified automatic queue. Original status and error were preserved in distribution_submission_reconciliation_audit.',
  datetime('now'),
  datetime('now')
FROM distribution_submission_reconciliation_audit
WHERE reconciliation_reason='indexnow_verified_adapter_recovery_2026_09_11';
