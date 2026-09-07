UPDATE distribution_opportunities
SET status='ready_to_submit',
    action_url='https://listedstartups.com/api/listings',
    human_required=0,
    automation_potential=95,
    acceptance_probability=95,
    next_action='REST publishing contract and ToolScout payload validated. Await explicit authorization to register an agent identity and obtain LISTED_STARTUPS_TOKEN before automatic publication.',
    updated_at=datetime('now')
WHERE surface_slug='listed-startups';
