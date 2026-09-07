INSERT INTO distribution_opportunities (
  surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,
  acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,
  human_required,next_action,last_checked_at,created_at,updated_at
) VALUES
  (
    'tinylaunch','TinyLaunch','agent_ready_launch_directory',91,72,76,70,
    80,95,15,82,'ready_to_submit','https://www.tinylaunch.com/api/v1/startups',
    0,'Official JSON API verified. Authentication is the only current setup blocker; await an authorized TinyLaunch token before automatic submission.',
    datetime('now'),datetime('now'),datetime('now')
  ),
  (
    'indietool','IndieTool','startup_directory_api',86,65,66,80,
    90,95,12,81,'ready_to_submit','https://www.indietool.io/api/v1/apps/submit',
    0,'Official submission API verified. Authentication is the only current setup blocker; await an authorized IndieTool API key before automatic submission.',
    datetime('now'),datetime('now'),datetime('now')
  )
ON CONFLICT(surface_slug) DO UPDATE SET
  surface_name=excluded.surface_name,
  surface_type=excluded.surface_type,
  audience_fit=excluded.audience_fit,
  authority=excluded.authority,
  traffic_potential=excluded.traffic_potential,
  backlink_value=excluded.backlink_value,
  acceptance_probability=excluded.acceptance_probability,
  automation_potential=excluded.automation_potential,
  effort_cost=excluded.effort_cost,
  distribution_score=MAX(distribution_opportunities.distribution_score, excluded.distribution_score),
  status='ready_to_submit',
  action_url=excluded.action_url,
  human_required=0,
  next_action=excluded.next_action,
  last_checked_at=datetime('now'),
  updated_at=datetime('now');
