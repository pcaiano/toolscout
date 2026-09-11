INSERT INTO distribution_economic_learning(
  surface_slug,baseline_score,learned_score,operating_decision,priority_weight,
  evidence_grade,paid_policy_decision,created_at,updated_at
)
SELECT
  o.surface_slug,
  COALESCE(o.distribution_score,0),
  COALESCE(o.distribution_score,0),
  'explore',
  0,
  'none',
  'free_default',
  datetime('now'),
  datetime('now')
FROM distribution_opportunities o
WHERE o.surface_slug IS NOT NULL
ON CONFLICT(surface_slug) DO NOTHING;

UPDATE distribution_economic_learning
SET
  observed_cost=(SELECT c.cost_amount FROM distribution_surface_costs c WHERE c.surface_slug=distribution_economic_learning.surface_slug),
  observed_cost_currency=(SELECT c.currency FROM distribution_surface_costs c WHERE c.surface_slug=distribution_economic_learning.surface_slug),
  paid_policy_decision=CASE
    WHEN EXISTS(SELECT 1 FROM distribution_surface_costs c WHERE c.surface_slug=distribution_economic_learning.surface_slug AND c.cost_amount>0)
      AND paid_policy_decision NOT IN ('evidence_positive','hold_no_return')
      THEN 'experiment_measuring'
    ELSE COALESCE(NULLIF(paid_policy_decision,''),'free_default')
  END,
  updated_at=datetime('now');

UPDATE distribution_economic_learning
SET
  operating_decision=CASE
    WHEN EXISTS(SELECT 1 FROM distribution_opportunities o WHERE o.surface_slug=distribution_economic_learning.surface_slug AND o.status IN ('policy_blocked','rejected')) THEN 'suspend'
    WHEN paid_policy_decision='hold_no_return' THEN 'suspend'
    WHEN COALESCE(observed_cost,0)>0 AND paid_policy_decision='experiment_measuring' THEN 'measure'
    WHEN evidence_grade IN ('strong','revenue_confirmed') THEN 'scale'
    WHEN evidence_grade IN ('directional','emerging') THEN 'measure'
    ELSE 'explore'
  END,
  decision_reason=CASE
    WHEN EXISTS(SELECT 1 FROM distribution_opportunities o WHERE o.surface_slug=distribution_economic_learning.surface_slug AND o.status IN ('policy_blocked','rejected')) THEN 'Surface status blocks automatic distribution.'
    WHEN paid_policy_decision='hold_no_return' THEN 'Paid surface has sufficient measurement with no positive return.'
    WHEN COALESCE(observed_cost,0)>0 AND paid_policy_decision='experiment_measuring' THEN 'Paid experiment is already committed and remains measurement-only. No additional spend is authorized.'
    WHEN evidence_grade IN ('strong','revenue_confirmed') THEN 'Strong browser-confirmed economic evidence supports higher operating priority.'
    WHEN evidence_grade IN ('directional','emerging') THEN 'Directional browser-confirmed evidence needs more observations.'
    ELSE 'No browser-confirmed economic evidence yet. Keep a bounded exploration allocation.'
  END,
  priority_weight=CASE
    WHEN EXISTS(SELECT 1 FROM distribution_opportunities o WHERE o.surface_slug=distribution_economic_learning.surface_slug AND o.status IN ('policy_blocked','rejected')) OR paid_policy_decision='hold_no_return' THEN 0
    WHEN COALESCE(observed_cost,0)>0 AND paid_policy_decision='experiment_measuring' THEN MIN(79,60+COALESCE(learned_score,0)*0.19)
    WHEN evidence_grade IN ('strong','revenue_confirmed') THEN MIN(99.5,90+COALESCE(learned_score,0)*0.095)
    WHEN evidence_grade IN ('directional','emerging') THEN MIN(79,60+COALESCE(learned_score,0)*0.19)
    ELSE MIN(49,30+COALESCE(learned_score,0)*0.19)
  END,
  chairman_required=CASE
    WHEN EXISTS(SELECT 1 FROM distribution_opportunities o WHERE o.surface_slug=distribution_economic_learning.surface_slug AND COALESCE(o.human_required,0)>0) THEN 1
    WHEN COALESCE(observed_cost,0)>0 THEN 1
    ELSE 0
  END,
  decided_at=datetime('now'),
  updated_at=datetime('now');

UPDATE distribution_economic_learning
SET
  priority_weight=100,
  decision_reason='No browser-confirmed economic evidence yet. Reserved as the bounded exploration slot.',
  decided_at=datetime('now'),
  updated_at=datetime('now')
WHERE surface_slug=(
  SELECT o.surface_slug
  FROM distribution_opportunities o
  JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug
  LEFT JOIN distribution_surface_costs c ON c.surface_slug=o.surface_slug
  WHERE l.operating_decision='explore'
    AND o.status='ready_to_submit'
    AND COALESCE(o.human_required,0)=0
    AND COALESCE(c.cost_amount,0)=0
  ORDER BY COALESCE(o.last_checked_at,o.updated_at,'1970-01-01') ASC,l.learned_score DESC,o.surface_slug ASC
  LIMIT 1
);

UPDATE distribution_opportunities
SET
  distribution_score=COALESCE((SELECT l.priority_weight FROM distribution_economic_learning l WHERE l.surface_slug=distribution_opportunities.surface_slug),distribution_score),
  updated_at=datetime('now')
WHERE surface_slug IS NOT NULL;

UPDATE distribution_opportunities
SET
  status='approval_required',
  human_required=1,
  next_action='Paid distribution is never executed automatically. Review measured evidence, expected value and cost before authorizing any spend.',
  updated_at=datetime('now')
WHERE status='ready_to_submit'
  AND EXISTS(
    SELECT 1 FROM distribution_surface_costs c
    WHERE c.surface_slug=distribution_opportunities.surface_slug
      AND c.cost_amount>0
  );
