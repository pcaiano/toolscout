INSERT INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,live_url,human_required,last_checked_at,next_action,created_at,updated_at)
VALUES('toolscout-ard','ToolScout ARD catalog','agent_registry',95,90,90,70,95,100,10,92,'live','https://trytoolscout.org/.well-known/ard.json','https://trytoolscout.org/.well-known/ard.json',0,datetime('now'),'Keep ARD catalog live and propagate to conformant registries.',datetime('now'),datetime('now'))
ON CONFLICT(surface_slug) DO UPDATE SET
surface_name=excluded.surface_name,
surface_type=excluded.surface_type,
audience_fit=excluded.audience_fit,
authority=excluded.authority,
traffic_potential=excluded.traffic_potential,
automation_potential=excluded.automation_potential,
distribution_score=excluded.distribution_score,
status='live',
action_url=excluded.action_url,
live_url=excluded.live_url,
human_required=0,
last_checked_at=datetime('now'),
next_action=excluded.next_action,
updated_at=datetime('now');
