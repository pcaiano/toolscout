UPDATE distribution_opportunities
SET status='human_action_required',
    human_required=1,
    updated_at=datetime('now')
WHERE surface_slug='sourceforge'
  AND status NOT IN ('live','submitted','pending_review','scheduled','verified','rejected','skipped');

UPDATE distribution_opportunities
SET status='deferred',
    human_required=0,
    updated_at=datetime('now')
WHERE surface_slug='stackshare'
  AND status NOT IN ('live','submitted','pending_review','scheduled','verified','rejected','skipped');
