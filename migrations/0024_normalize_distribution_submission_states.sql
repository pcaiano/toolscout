UPDATE distribution_submissions
SET status='human_required',
    human_required=1,
    error='manual_or_reputation_sensitive',
    updated_at=datetime('now')
WHERE status='adapter_missing'
  AND surface_slug IN (
    SELECT surface_slug
    FROM distribution_opportunities
    WHERE COALESCE(human_required,0)=1
  );
