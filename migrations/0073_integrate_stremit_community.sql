-- Integrate Stremit as an active Distribution Engine community surface.
-- The public listing is already live. Community posting is unlocked.
-- The documented Stremit API does not expose post or Stack creation, so
-- preparation and measurement are automated while publication stays human reviewed.

INSERT INTO distribution_opportunities (
  surface_slug,
  surface_name,
  surface_type,
  audience_fit,
  authority,
  traffic_potential,
  backlink_value,
  acceptance_probability,
  automation_potential,
  effort_cost,
  distribution_score,
  status,
  action_url,
  live_url,
  human_required,
  last_checked_at,
  next_action,
  created_at,
  updated_at
) VALUES (
  'stremit',
  'Stremit',
  'ai_directory_community',
  84,
  60,
  72,
  64,
  100,
  35,
  12,
  72,
  'live',
  'https://stremit.io/feed',
  'https://stremit.io/ai-tool/toolscout',
  0,
  datetime('now'),
  'Keep the live listing under measurement. Prepare useful community posts automatically for eligible ToolScout assets, prefer a Stack for multi tool workflows, require human review before publishing, and measure browser confirmed referral sessions and downstream outbound activity.',
  datetime('now'),
  datetime('now')
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
  status='live',
  action_url=excluded.action_url,
  live_url=excluded.live_url,
  human_required=0,
  last_checked_at=datetime('now'),
  next_action=excluded.next_action,
  updated_at=datetime('now');

INSERT INTO distribution_events (
  event_id,
  surface_slug,
  event_type,
  status,
  asset_type,
  asset_id,
  source_url,
  destination_url,
  detail,
  observed_at,
  created_at
)
SELECT
  'stremit_community_enabled_v1',
  'stremit',
  'surface_capability_enabled',
  'live',
  'community',
  'stremit',
  'https://stremit.io/feed',
  'https://trytoolscout.org/',
  'Stremit community distribution enabled. Listing remains live while post and Stack preparation enters the editorial queue for human reviewed publication.',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM distribution_events WHERE event_id='stremit_community_enabled_v1'
);

INSERT INTO distribution_editorial_queue (
  queue_id,
  asset_url,
  channel_type,
  target_name,
  target_url,
  angle,
  suggested_title,
  suggested_body,
  status,
  human_required,
  created_at,
  updated_at
)
SELECT
  'stremit_first_stack_v1',
  'https://trytoolscout.org/',
  'community_stack',
  'Stremit',
  'https://stremit.io/feed',
  'Show a practical AI software discovery workflow and explain what each tool contributes.',
  'The AI tool discovery stack behind ToolScout',
  'Build a useful Stremit Stack around a real software discovery workflow. Explain what each tool is good for, where it fits in the workflow, and the practical tradeoffs. Keep the Stack useful on its own. ToolScout should be the discovery layer, not a generic promotional post.',
  'prepared',
  1,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM distribution_editorial_queue WHERE queue_id='stremit_first_stack_v1'
);

INSERT INTO distribution_economic_learning (
  surface_slug,
  baseline_score,
  learned_score,
  operating_decision,
  priority_weight,
  evidence_grade,
  paid_policy_decision,
  chairman_required,
  decision_reason,
  decided_at,
  created_at,
  updated_at
)
VALUES (
  'stremit',
  72,
  72,
  'measure',
  72,
  'none',
  'free_default',
  0,
  'Listing is live and community participation is unlocked. Measure browser confirmed traffic and downstream activity before changing operating priority.',
  datetime('now'),
  datetime('now'),
  datetime('now')
)
ON CONFLICT(surface_slug) DO UPDATE SET
  baseline_score=COALESCE(distribution_economic_learning.baseline_score,72),
  learned_score=MAX(COALESCE(distribution_economic_learning.learned_score,0),72),
  operating_decision=CASE
    WHEN distribution_economic_learning.evidence_grade IN ('strong','revenue_confirmed') THEN distribution_economic_learning.operating_decision
    ELSE 'measure'
  END,
  priority_weight=CASE
    WHEN COALESCE(distribution_economic_learning.priority_weight,0)>72 THEN distribution_economic_learning.priority_weight
    ELSE 72
  END,
  paid_policy_decision='free_default',
  chairman_required=0,
  decision_reason='Listing is live and community participation is unlocked. Measure browser confirmed traffic and downstream activity before changing operating priority.',
  decided_at=datetime('now'),
  updated_at=datetime('now');
