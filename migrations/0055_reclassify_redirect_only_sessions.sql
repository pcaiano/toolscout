-- Historical rows whose only evidence is a direct redirect request are not observed website visits.
-- Preserve the rows and click history, but remove unsupported likely-human classification.
UPDATE sessions
SET classification='unknown/legacy'
WHERE classification='likely-human'
  AND NOT EXISTS (
    SELECT 1
    FROM funnel_events f
    WHERE f.session_id=sessions.session_id
      AND f.event_type='session_started'
  );
