INSERT INTO distribution_opportunities(
  surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,
  acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,
  human_required,last_checked_at,next_action,created_at,updated_at
) VALUES(
  'hypestar','Hype Star','reviewed_project_directory_api',91,70,72,74,88,98,6,86,
  'approval_required','https://hypestar.org/api/v1/listings',0,datetime('now'),
  'Official free no-auth API contract is verified. ToolScout payload is ready as app / productivity-operations / supporterChoice not_offered. Submit only after explicit Hype Star-specific approval, as required by the provider agent policy.',
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
  status=CASE WHEN distribution_opportunities.status IN ('verified','live','submitted','pending_review') THEN distribution_opportunities.status ELSE excluded.status END,
  action_url=excluded.action_url,
  human_required=0,
  next_action=CASE WHEN distribution_opportunities.status IN ('verified','live','submitted','pending_review') THEN distribution_opportunities.next_action ELSE excluded.next_action END,
  last_checked_at=datetime('now'),
  updated_at=datetime('now');
