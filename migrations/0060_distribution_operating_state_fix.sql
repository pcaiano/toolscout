UPDATE distribution_economic_learning
SET
  operating_decision=CASE
    WHEN EXISTS(
      SELECT 1 FROM distribution_opportunities o
      WHERE o.surface_slug=distribution_economic_learning.surface_slug
        AND o.status IN ('policy_blocked','rejected','skipped','unavailable_free')
    ) THEN 'suspend'
    WHEN paid_policy_decision='hold_no_return' THEN 'suspend'
    WHEN evidence_grade IN ('strong','revenue_confirmed') THEN 'scale'
    WHEN COALESCE(observed_cost,0)>0 AND paid_policy_decision='experiment_measuring' THEN 'measure'
    WHEN EXISTS(
      SELECT 1 FROM distribution_opportunities o
      WHERE o.surface_slug=distribution_economic_learning.surface_slug
        AND o.status IN ('live','verified','submitted','pending_review','scheduled')
    ) THEN 'measure'
    WHEN evidence_grade IN ('directional','emerging') THEN 'measure'
    ELSE 'explore'
  END,
  decision_reason=CASE
    WHEN EXISTS(
      SELECT 1 FROM distribution_opportunities o
      WHERE o.surface_slug=distribution_economic_learning.surface_slug
        AND o.status IN ('policy_blocked','rejected','skipped','unavailable_free')
    ) THEN 'Surface state blocks or closes further automatic distribution.'
    WHEN paid_policy_decision='hold_no_return' THEN 'Paid surface has sufficient measurement with no positive return.'
    WHEN evidence_grade IN ('strong','revenue_confirmed') THEN 'Strong browser-confirmed economic evidence supports higher operating priority.'
    WHEN COALESCE(observed_cost,0)>0 AND paid_policy_decision='experiment_measuring' THEN 'Paid experiment is already committed and remains measurement-only. No additional spend is authorized.'
    WHEN EXISTS(
      SELECT 1 FROM distribution_opportunities o
      WHERE o.surface_slug=distribution_economic_learning.surface_slug
        AND o.status IN ('live','verified','submitted','pending_review','scheduled')
    ) THEN 'Surface is already activated. Measure browser-confirmed economic impact before scaling or suspending it.'
    WHEN evidence_grade IN ('directional','emerging') THEN 'Directional browser-confirmed evidence needs more observations.'
    ELSE 'No browser-confirmed economic evidence yet. Keep a bounded exploration allocation.'
  END,
  priority_weight=CASE
    WHEN EXISTS(
      SELECT 1 FROM distribution_opportunities o
      WHERE o.surface_slug=distribution_economic_learning.surface_slug
        AND o.status IN ('policy_blocked','rejected','skipped','unavailable_free')
    ) OR paid_policy_decision='hold_no_return' THEN 0
    WHEN evidence_grade IN ('strong','revenue_confirmed') THEN MIN(99.5,90+COALESCE(learned_score,0)*0.095)
    WHEN COALESCE(observed_cost,0)>0 AND paid_policy_decision='experiment_measuring' THEN MIN(79,60+COALESCE(learned_score,0)*0.19)
    WHEN EXISTS(
      SELECT 1 FROM distribution_opportunities o
      WHERE o.surface_slug=distribution_economic_learning.surface_slug
        AND o.status IN ('live','verified','submitted','pending_review','scheduled')
    ) THEN MIN(79,60+COALESCE(learned_score,0)*0.19)
    WHEN evidence_grade IN ('directional','emerging') THEN MIN(79,60+COALESCE(learned_score,0)*0.19)
    ELSE MIN(49,30+COALESCE(learned_score,0)*0.19)
  END,
  chairman_required=CASE
    WHEN EXISTS(
      SELECT 1 FROM distribution_opportunities o
      WHERE o.surface_slug=distribution_economic_learning.surface_slug
        AND (COALESCE(o.human_required,0)>0 OR o.status='approval_required')
    ) THEN 1
    WHEN COALESCE(observed_cost,0)>0 THEN 1
    ELSE 0
  END,
  decided_at=datetime('now'),
  updated_at=datetime('now');

UPDATE distribution_economic_learning
SET
  priority_weight=100,
  decision_reason='No browser-confirmed economic evidence yet. Reserved as the bounded acquisition exploration slot.',
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
    AND o.surface_slug<>'indexnow'
    AND NOT EXISTS(
      SELECT 1 FROM distribution_submissions ds
      WHERE ds.surface_slug=o.surface_slug
        AND ds.status='submitted'
    )
    AND NOT EXISTS(
      SELECT 1 FROM distribution_submissions ds
      WHERE ds.surface_slug=o.surface_slug
        AND ds.status IN ('auth_required','adapter_missing','policy_blocked','setup_required','human_required')
    )
  ORDER BY COALESCE(o.last_checked_at,o.updated_at,'1970-01-01') ASC,l.learned_score DESC,o.surface_slug ASC
  LIMIT 1
);

UPDATE distribution_opportunities
SET
  distribution_score=COALESCE(
    (SELECT l.priority_weight FROM distribution_economic_learning l WHERE l.surface_slug=distribution_opportunities.surface_slug),
    distribution_score
  ),
  updated_at=datetime('now')
WHERE surface_slug IS NOT NULL;
