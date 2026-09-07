UPDATE distribution_submissions
SET status='setup_required',
    human_required=0,
    error='setup_prerequisites_missing',
    updated_at=datetime('now')
WHERE status='auth_required'
  AND EXISTS (
    SELECT 1
    FROM distribution_opportunities o
    WHERE o.surface_slug=distribution_submissions.surface_slug
      AND o.status='needs_info'
      AND COALESCE(o.human_required,0)=0
  );
