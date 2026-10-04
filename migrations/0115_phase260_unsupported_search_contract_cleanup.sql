-- ToolScout 2.0 final acceptance: drain legacy search contracts that no longer
-- map to an executable action under the current search action policy.
--
-- This is intentionally bounded to non-terminal search contracts. It preserves
-- all verified historical proof and all currently executable search actions.

INSERT OR IGNORE INTO growth_execution_events(
  event_id,task_id,event_type,executor,status,detail,created_at
)
SELECT
  'phase260-search-cleanup:' || task_id,
  task_id,
  'cancelled',
  executor,
  'cancelled',
  'Final ToolScout 2.0 acceptance cancelled a legacy search contract whose action is not executable under the current registry.',
  datetime('now')
FROM growth_execution_contract
WHERE subject_type='search'
  AND status NOT IN ('verified','blocked','cancelled','human_required')
  AND action NOT IN (
    'deepen_existing_search_asset',
    'improve_click_capture',
    'protect_current_ranking',
    'strengthen_internal_links',
    'observe_low_sample_ranking',
    'repair_indexing',
    'repair_canonical_alignment',
    'content_amplification',
    'distribution_amplification',
    'backlink_reference_outreach'
  );

UPDATE growth_execution_contract
SET status='cancelled',
    claim_deadline=NULL,
    attempt_deadline=NULL,
    verify_deadline=NULL,
    claimed_at=NULL,
    attempted_at=NULL,
    completed_at=COALESCE(completed_at,datetime('now')),
    last_result='phase260_unsupported_search_contract_cleanup',
    updated_at=datetime('now')
WHERE subject_type='search'
  AND status NOT IN ('verified','blocked','cancelled','human_required')
  AND action NOT IN (
    'deepen_existing_search_asset',
    'improve_click_capture',
    'protect_current_ranking',
    'strengthen_internal_links',
    'observe_low_sample_ranking',
    'repair_indexing',
    'repair_canonical_alignment',
    'content_amplification',
    'distribution_amplification',
    'backlink_reference_outreach'
  );
