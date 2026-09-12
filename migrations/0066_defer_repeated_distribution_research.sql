UPDATE distribution_opportunities
SET status='deferred',
    human_required=0,
    next_action='Deferred after repeated autonomous checks found no verified submission protocol. Revisit only when new submission evidence is discovered.',
    updated_at=datetime('now')
WHERE status='research_required'
  AND surface_slug IN (
    SELECT surface_slug
    FROM distribution_qualification_events
    WHERE result='research_required'
      AND detail='no_verified_submission_protocol'
    GROUP BY surface_slug
    HAVING COUNT(*) >= 4
  );

CREATE TRIGGER IF NOT EXISTS defer_exhausted_distribution_research
AFTER INSERT ON distribution_qualification_events
WHEN NEW.result='research_required'
 AND NEW.detail='no_verified_submission_protocol'
 AND (
   SELECT COUNT(*)
   FROM distribution_qualification_events
   WHERE surface_slug=NEW.surface_slug
     AND result='research_required'
     AND detail='no_verified_submission_protocol'
 ) >= 4
BEGIN
  UPDATE distribution_opportunities
  SET status='deferred',
      human_required=0,
      next_action='Deferred after repeated autonomous checks found no verified submission protocol. Revisit only when new submission evidence is discovered.',
      updated_at=datetime('now')
  WHERE surface_slug=NEW.surface_slug
    AND status='research_required';
END;
