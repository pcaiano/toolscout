CREATE TABLE IF NOT EXISTS distribution_contact_route_actions (
  route_id TEXT PRIMARY KEY,
  surface_slug TEXT NOT NULL,
  route_type TEXT NOT NULL,
  route_url TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  opportunity_slug TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_result TEXT,
  next_action TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_contact_route_actions_status
  ON distribution_contact_route_actions(status,updated_at);

CREATE INDEX IF NOT EXISTS idx_distribution_contact_route_actions_surface
  ON distribution_contact_route_actions(surface_slug,status);

INSERT OR IGNORE INTO distribution_contact_route_actions(
  route_id,surface_slug,route_type,route_url,execution_mode,status,opportunity_slug,attempts,last_result,next_action,created_at,updated_at
)
SELECT
  r.route_id,
  r.surface_slug,
  r.route_type,
  r.route_url,
  CASE WHEN r.route_type IN ('x','bluesky','linkedin') THEN 'content_amplification' ELSE 'autonomous_qualification' END,
  'queued',
  'route-' || substr(lower(hex(randomblob(16))),1,16),
  0,
  NULL,
  CASE
    WHEN r.route_type='form' THEN 'Autonomously qualify this public contact/submission route. Execute only through a verified no-auth safe adapter; otherwise expose the exact human gate.'
    WHEN r.route_type='github' THEN 'Autonomously inspect the public GitHub organisation route for a safe machine-resolvable contact or contribution path; do not create unsolicited issues.'
    ELSE 'Feed this verified public social route into the Content Engine as a borrowed-audience amplification candidate. Mention or engage only when directly relevant and non-spammy.'
  END,
  datetime('now'),
  datetime('now')
FROM distribution_contact_routes r
WHERE r.status IN ('discovered','in_loop');

UPDATE distribution_contact_routes
SET status='in_loop',updated_at=datetime('now')
WHERE status='discovered'
  AND EXISTS(SELECT 1 FROM distribution_contact_route_actions a WHERE a.route_id=distribution_contact_routes.route_id);

INSERT INTO distribution_opportunities(
  surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,
  automation_potential,effort_cost,distribution_score,status,action_url,human_required,next_action,created_at,updated_at
)
SELECT
  a.opportunity_slug,
  substr(n.surface_name || ' via ' || a.route_type,1,200),
  'publisher_contact_route',
  0,0,0,0,45,80,15,
  CASE WHEN n.priority_score<35 THEN 35 WHEN n.priority_score>95 THEN 95 ELSE n.priority_score END,
  'research_required',
  a.route_url,
  0,
  a.next_action,
  datetime('now'),
  datetime('now')
FROM distribution_contact_route_actions a
JOIN distribution_network_outreach n ON n.surface_slug=a.surface_slug
WHERE a.execution_mode='autonomous_qualification'
ON CONFLICT(surface_slug) DO UPDATE SET
  surface_name=excluded.surface_name,
  action_url=excluded.action_url,
  distribution_score=excluded.distribution_score,
  next_action=excluded.next_action,
  updated_at=datetime('now')
WHERE distribution_opportunities.action_url IS NOT excluded.action_url
   OR distribution_opportunities.distribution_score IS NOT excluded.distribution_score
   OR distribution_opportunities.next_action IS NOT excluded.next_action;
