INSERT INTO distribution_opportunities(
  surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,
  acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,
  human_required,last_checked_at,next_action,created_at,updated_at
) VALUES(
  'agenttool-sh','agenttool.sh','agent_readiness_directory_api',90,68,70,74,90,100,5,86,
  'ready_to_submit','https://agenttool.sh/api/tools/submit',0,datetime('now'),
  'Automatically submit ToolScout once for agent-readiness scanning through the verified no-auth API, then track the published AgentGrade result.',
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
  status=excluded.status,
  action_url=excluded.action_url,
  human_required=0,
  next_action=excluded.next_action,
  updated_at=datetime('now');
