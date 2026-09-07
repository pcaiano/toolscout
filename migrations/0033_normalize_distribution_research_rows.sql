UPDATE distribution_submissions
SET status='research_required',
    human_required=0,
    error=NULL,
    updated_at=datetime('now')
WHERE status='adapter_missing'
  AND EXISTS (
    SELECT 1
    FROM distribution_opportunities o
    WHERE o.surface_slug=distribution_submissions.surface_slug
      AND o.status IN ('candidate','discovered','research_required')
      AND COALESCE(o.human_required,0)=0
  );
