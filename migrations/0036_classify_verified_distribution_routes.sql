UPDATE distribution_opportunities
SET status='policy_blocked',
    human_required=0,
    next_action='Free route requires a permanent reciprocal backlink or badge on ToolScout. Keep blocked under the zero-cost/no-reciprocal-badge policy; do not buy the paid bypass.',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'dododirectory-com',
  'alternative-tools',
  'toolfio-com',
  'twelve-tools',
  'launched-tools'
);

UPDATE distribution_submissions
SET status='policy_blocked',
    human_required=0,
    error='reciprocal_badge_policy',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'dododirectory-com',
  'alternative-tools',
  'toolfio-com',
  'twelve-tools',
  'launched-tools'
)
AND status='research_required';

UPDATE distribution_opportunities
SET status='human_action_required',
    human_required=1,
    next_action='Free route requires account creation/authentication and a submission flow. Keep outside automatic execution.',
    updated_at=datetime('now')
WHERE surface_slug='startupfa-me';

UPDATE distribution_submissions
SET status='human_required',
    human_required=1,
    error='account_creation_required',
    updated_at=datetime('now')
WHERE surface_slug='startupfa-me'
  AND status='research_required';
