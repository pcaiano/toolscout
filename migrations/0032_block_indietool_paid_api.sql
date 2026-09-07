UPDATE distribution_opportunities
SET status='policy_blocked',
    human_required=0,
    action_url='https://www.indietool.io/api/v1/apps/submit',
    next_action='Official API is verified but consumes submission credits. Keep API disabled under ToolScout zero-cost policy. A separate free route requires embedding the IndieTool badge and must not be installed without explicit approval.',
    updated_at=datetime('now')
WHERE surface_slug='indietool';

UPDATE distribution_submissions
SET status='policy_blocked',
    human_required=0,
    error='zero_cost_policy',
    updated_at=datetime('now')
WHERE surface_slug='indietool'
  AND status IN ('ready','adapter_missing','auth_required','failed');
