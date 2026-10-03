-- ToolScout 2.0 Phase 240 closure: repair pre-existing stale alternate-route research.
-- Only stale autonomous qualification rows without active overflow work are touched.
-- Active jobs, valid human gates, policy-blocked rows and terminal route actions are unchanged.

UPDATE distribution_contact_route_actions AS a
SET status='exhausted',
    attempts=MAX(
      attempts,
      (SELECT COUNT(*) FROM compute_overflow_jobs j
        WHERE j.subject_key=a.opportunity_slug
          AND j.job_type='distribution_route_research'
          AND j.status IN ('completed','failed'))
    )+1,
    last_attempt_at=datetime('now'),
    last_result='phase240_existing_research_exhausted',
    updated_at=datetime('now')
WHERE a.execution_mode='autonomous_qualification'
  AND a.status='researching'
  AND a.updated_at<datetime('now','-6 hours')
  AND NOT EXISTS (
    SELECT 1 FROM compute_overflow_jobs active_job
    WHERE active_job.subject_key=a.opportunity_slug
      AND active_job.job_type='distribution_route_research'
      AND active_job.status IN ('queued','leased')
  )
  AND (
    MAX(
      a.attempts,
      (SELECT COUNT(*) FROM compute_overflow_jobs j
        WHERE j.subject_key=a.opportunity_slug
          AND j.job_type='distribution_route_research'
          AND j.status IN ('completed','failed'))
    )+1
  )>=3;

UPDATE distribution_opportunities
SET status='skipped',
    human_required=0,
    next_action='Phase 240 closed a stale alternate-route research path after the bounded research-attempt limit was reached.',
    updated_at=datetime('now')
WHERE status='research_required'
  AND EXISTS (
    SELECT 1 FROM distribution_contact_route_actions a
    WHERE a.opportunity_slug=distribution_opportunities.surface_slug
      AND a.status='exhausted'
      AND a.last_result='phase240_existing_research_exhausted'
  );

UPDATE distribution_contact_route_actions AS a
SET status='retry_due',
    attempts=MAX(
      attempts,
      (SELECT COUNT(*) FROM compute_overflow_jobs j
        WHERE j.subject_key=a.opportunity_slug
          AND j.job_type='distribution_route_research'
          AND j.status IN ('completed','failed'))
    )+1,
    last_attempt_at=datetime('now'),
    last_result='phase240_existing_research_retry_due',
    updated_at=datetime('now')
WHERE a.execution_mode='autonomous_qualification'
  AND a.status='researching'
  AND a.updated_at<datetime('now','-6 hours')
  AND NOT EXISTS (
    SELECT 1 FROM compute_overflow_jobs active_job
    WHERE active_job.subject_key=a.opportunity_slug
      AND active_job.job_type='distribution_route_research'
      AND active_job.status IN ('queued','leased')
  );
