UPDATE distribution_opportunities
SET status='human_action_required',
    human_required=1,
    next_action='PeerPush public API and MCP are read-only for discovery. Free product submission remains an authenticated/form workflow; keep outside automatic execution.',
    updated_at=datetime('now')
WHERE surface_slug='peerpush-net';

UPDATE distribution_submissions
SET status='human_required',
    human_required=1,
    error='manual_submission_route',
    updated_at=datetime('now')
WHERE surface_slug='peerpush-net'
  AND status='research_required';

UPDATE distribution_opportunities
SET status='policy_blocked',
    human_required=0,
    next_action='Turbo0 free lane requires a reciprocal badge/backlink and category fit; blocked under ToolScout no-reciprocal-badge policy. Do not buy the paid bypass.',
    updated_at=datetime('now')
WHERE surface_slug='turbo0-com';

UPDATE distribution_submissions
SET status='policy_blocked',
    human_required=0,
    error='reciprocal_badge_policy',
    updated_at=datetime('now')
WHERE surface_slug='turbo0-com'
  AND status='research_required';
