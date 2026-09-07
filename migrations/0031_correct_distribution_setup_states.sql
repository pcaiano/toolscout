UPDATE distribution_opportunities
SET status='needs_info',
    human_required=0,
    action_url='https://www.tinylaunch.com/api/v1/startups',
    next_action='Official JSON API verified. Setup still requires authorized email OTP authentication, a maker profile, a real category id and a compliant logo asset before automatic submission can be enabled.',
    updated_at=datetime('now')
WHERE surface_slug='tinylaunch';

UPDATE distribution_opportunities
SET status='needs_info',
    human_required=0,
    action_url='https://www.indietool.io/api/v1/apps/submit',
    next_action='Official submission API verified. Setup still requires an authorized IndieTool API key and a valid public HTTPS image URL or uploaded image before automatic submission can be enabled.',
    updated_at=datetime('now')
WHERE surface_slug='indietool';
