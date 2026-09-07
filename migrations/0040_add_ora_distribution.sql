INSERT INTO distribution_opportunities(
  surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,
  acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,
  human_required,last_checked_at,next_action,created_at,updated_at
) VALUES(
  'ora-ai','Ora','agent_readiness_discovery_api',96,82,78,76,99,100,5,93,
  'ready_to_submit','https://ora.ai/api/scan?include=essentials',0,datetime('now'),
  'Run one free public Ora scan for ToolScout, publish its agent-readiness surface into Ora discovery, then monitor the verified score and fixes.',
  datetime('now'),datetime('now')
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
  distribution_score=excluded.distribution_score,
  status=CASE WHEN distribution_opportunities.status IN ('verified','live') THEN distribution_opportunities.status ELSE excluded.status END,
  action_url=excluded.action_url,
  human_required=0,
  next_action=CASE WHEN distribution_opportunities.status IN ('verified','live') THEN distribution_opportunities.next_action ELSE excluded.next_action END,
  updated_at=datetime('now');
