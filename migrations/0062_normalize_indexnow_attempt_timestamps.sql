-- Keep retry scheduling and attempt history semantically separate.
-- last_attempt_at records the real network attempt.
-- retry_after_at in distribution_delivery_state records the next allowed retry.

UPDATE distribution_submissions
SET last_attempt_at=(
  SELECT st.last_network_attempt_at
  FROM distribution_delivery_state st
  WHERE st.submission_id=distribution_submissions.submission_id
)
WHERE surface_slug='indexnow'
  AND error LIKE 'retryable:indexnow_%'
  AND EXISTS (
    SELECT 1
    FROM distribution_delivery_state st
    WHERE st.submission_id=distribution_submissions.submission_id
  );

INSERT INTO distribution_events (
  event_id,event_type,status,asset_type,detail,observed_at,created_at
)
VALUES (
  'indexnow_timestamp_normalization_' || lower(hex(randomblob(16))),
  'indexnow_retry_timestamp_normalized',
  'completed',
  'distribution_engine',
  'Normalized IndexNow retry timestamps so last_attempt_at records the actual network attempt and retry_after_at remains the future retry authority.',
  datetime('now'),
  datetime('now')
);
