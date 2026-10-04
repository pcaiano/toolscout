-- ToolScout 2.0 Phase 255: reconcile terminal distribution Human Gates.
-- A gate awaiting verification cannot remain owner-actionable after the underlying
-- distribution opportunity has already reached a terminal or superseding state.

UPDATE human_gate_contract
SET status=CASE
      WHEN subject_key IN (
        SELECT surface_slug FROM distribution_opportunities WHERE status IN ('verified','live')
      ) THEN 'resolved'
      ELSE 'cancelled'
    END,
    resolved_at=datetime('now'),
    next_verification_at=NULL,
    verification_detail=CASE
      WHEN subject_key IN (
        SELECT surface_slug FROM distribution_opportunities WHERE status IN ('verified','live')
      ) THEN 'Phase 255 reconciled Human Gate because the distribution opportunity is already verified/live.'
      ELSE 'Phase 255 cancelled Human Gate because the distribution opportunity is already terminal; owner action is no longer required.'
    END,
    updated_at=datetime('now')
WHERE engine='distribution'
  AND subject_type='surface'
  AND status IN ('open','verification_pending')
  AND EXISTS (
    SELECT 1
    FROM distribution_opportunities o
    WHERE o.surface_slug=human_gate_contract.subject_key
      AND o.status IN ('submitted','pending_review','scheduled','verified','live','policy_blocked','rejected','skipped','unavailable_free')
  );
