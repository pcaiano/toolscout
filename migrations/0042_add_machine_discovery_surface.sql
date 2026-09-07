INSERT INTO distribution_opportunities(
  surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,
  acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,
  human_required,last_checked_at,next_action,created_at,updated_at
) VALUES(
  'toolscout-machine-discovery','ToolScout Machine Discovery','machine_discovery',96,100,82,0,100,100,2,94,
  'live','https://trytoolscout.org/apis.json',0,datetime('now'),
  'Machine-readable discovery is live: APIs.json 0.19, OpenAPI 3.1, RFC 9727 API catalog, llms.txt, agents.md and the ToolScout distribution manifest. Monitor crawler discovery, referrals and downstream human/agent traffic; do not count this first-party surface as a third-party submission.',
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
  status='live',
  action_url=excluded.action_url,
  human_required=0,
  next_action=excluded.next_action,
  last_checked_at=datetime('now'),
  updated_at=datetime('now');
