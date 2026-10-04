-- ToolScout 2.0 Phase 254: extend the competitor firewall to internal content amplification.
-- Direct software-discovery competitors remain eligible for self-service listing/submission
-- and measurement, but not publisher outreach, email outreach, or content amplification.

UPDATE growth_execution_contract
SET status='cancelled',
    claim_deadline=NULL,
    attempt_deadline=NULL,
    verify_deadline=NULL,
    claimed_at=NULL,
    attempted_at=NULL,
    last_result='phase254_competitor_content_amplification_suppressed',
    updated_at=datetime('now')
WHERE subject_type='surface'
  AND executor='content_issue'
  AND action='content_relevance_amplification'
  AND subject_key IN (
    'sourceforge-net','getapp-com','softwareadvice-com','capterra-com','crozdesk-com',
    'solutions-trustradius-com','aitools-fyi','easywithai-com','aitoolmall-com',
    'aitoolsdirectory-com','topai-tools'
  )
  AND status IN ('pending','claimed','attempted','deferred','stalled');
