-- Reconcile externally confirmed distribution states reported on 2026-09-09.
-- TinyLaunch approved ToolScout and scheduled the launch for 2026-10-12.
-- SaaSHub approved/verified the public ToolScout listing.

UPDATE distribution_workflow
SET status='scheduled',
    response_at=COALESCE(response_at,'2026-09-09T00:00:00Z'),
    notes='TinyLaunch approved ToolScout; launch scheduled for 12 October 2026. Monitor the scheduled launch and verify the public launch URL when it becomes live.',
    updated_at=datetime('now')
WHERE item_slug='tinylaunch';

UPDATE distribution_opportunities
SET status='scheduled',
    human_required=0,
    last_checked_at=datetime('now'),
    next_action='Launch approved and scheduled for 2026-10-12. Do not resubmit. Verify the public launch URL after launch, then monitor attributed traffic and engagement.',
    updated_at=datetime('now')
WHERE surface_slug='tinylaunch';

UPDATE distribution_submissions
SET status='submitted',
    human_required=0,
    error=NULL,
    updated_at=datetime('now')
WHERE surface_slug='tinylaunch'
  AND status NOT IN ('verified','live');

UPDATE distribution_workflow
SET status='live',
    response_at=COALESCE(response_at,'2026-09-04T00:00:00Z'),
    live_url=COALESCE(live_url,'https://www.saashub.com/trytoolscout-alternatives'),
    notes='SaaSHub approved and verified the public ToolScout listing. Monitor referral traffic and durable backlink value; do not buy Priority+ without measured evidence.',
    updated_at=datetime('now')
WHERE item_slug IN ('saas-hub','saashub');

UPDATE distribution_opportunities
SET status='verified',
    human_required=0,
    live_url=COALESCE(live_url,'https://www.saashub.com/trytoolscout-alternatives'),
    last_checked_at=datetime('now'),
    next_action='Public listing is approved and verified. Monitor attributed sessions, outbound activity and durable backlink value.',
    updated_at=datetime('now')
WHERE surface_slug IN ('saas-hub','saashub');

UPDATE distribution_submissions
SET status='verified',
    human_required=0,
    error=NULL,
    updated_at=datetime('now')
WHERE surface_slug IN ('saas-hub','saashub');
