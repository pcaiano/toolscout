-- Reconcile stale Affiliate Coverage states so already-submitted/contacted/rejected
-- programmes do not re-enter the human-action queue.

UPDATE affiliate_workflow
SET status='rejected',
    source_actor='affiliate_coverage_reconciler',
    updated_at=datetime('now')
WHERE status IN ('research_required','program_exists','ready_to_apply','human_action_required')
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) GLOB '*rejected*'
   OR status IN ('research_required','program_exists','ready_to_apply','human_action_required')
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) GLOB '*declined*'
   OR status IN ('research_required','program_exists','ready_to_apply','human_action_required')
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) GLOB '*denied*';

UPDATE affiliate_workflow
SET status='pending_review',
    source_actor='affiliate_coverage_reconciler',
    updated_at=datetime('now')
WHERE status IN ('ready_to_apply','human_action_required')
  AND submitted_at IS NOT NULL
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*verify email*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*email verification*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*activate account*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*account activation*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*captcha*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*identity*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*tax*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*payment details*'
  AND lower(COALESCE(notes,'') || ' ' || COALESCE(blocker,'')) NOT GLOB '*accept terms*';

UPDATE affiliate_workflow
SET status='pending_review',
    source_actor='affiliate_coverage_reconciler',
    updated_at=datetime('now')
WHERE status IN ('research_required','program_exists','ready_to_apply','human_action_required')
  AND submitted_at IS NULL
  AND (
    lower(COALESCE(notes,'')) GLOB '*contacted*' OR
    lower(COALESCE(notes,'')) GLOB '*outreach sent*' OR
    lower(COALESCE(notes,'')) GLOB '*email sent*' OR
    lower(COALESCE(notes,'')) GLOB '*emailed*' OR
    lower(COALESCE(notes,'')) GLOB '*reached out*' OR
    lower(COALESCE(notes,'')) GLOB '*follow-up sent*'
  );
