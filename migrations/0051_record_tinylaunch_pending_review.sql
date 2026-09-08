INSERT INTO distribution_workflow(item_slug,status,submitted_at,response_at,live_url,notes,updated_at)
VALUES(
  'tinylaunch',
  'pending_review',
  '2026-09-08T21:18:45Z',
  NULL,
  NULL,
  'ToolScout submitted to TinyLaunch on 8 September 2026; pending review.',
  datetime('now')
)
ON CONFLICT(item_slug) DO UPDATE SET
  status='pending_review',
  submitted_at=COALESCE(distribution_workflow.submitted_at,'2026-09-08T21:18:45Z'),
  response_at=NULL,
  notes='ToolScout submitted to TinyLaunch on 8 September 2026; pending review.',
  updated_at=datetime('now');

INSERT INTO distribution_opportunities(
  surface_slug,surface_name,surface_type,status,action_url,human_required,last_checked_at,next_action,updated_at
)
VALUES(
  'tinylaunch',
  'TinyLaunch',
  'launch_platform',
  'pending_review',
  'https://tinylaunch.com/',
  0,
  datetime('now'),
  'Wait for TinyLaunch editorial review. After approval, record and verify the public launch URL, then monitor referral traffic and engagement. Do not create a duplicate submission.',
  datetime('now')
)
ON CONFLICT(surface_slug) DO UPDATE SET
  status='pending_review',
  human_required=0,
  last_checked_at=datetime('now'),
  next_action='Wait for TinyLaunch editorial review. After approval, record and verify the public launch URL, then monitor referral traffic and engagement. Do not create a duplicate submission.',
  updated_at=datetime('now');

UPDATE distribution_submissions
SET status='submitted',
    human_required=0,
    submitted_at=COALESCE(submitted_at,'2026-09-08T21:18:45Z'),
    error=NULL,
    updated_at=datetime('now')
WHERE surface_slug='tinylaunch'
  AND status NOT IN ('submitted','verified');
