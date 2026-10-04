-- ToolScout post-2.0 growth outcome
-- Rearm a bounded set of verified SEO contracts only when active search evidence
-- is newer than the last task-specific verification. This converts fresh GSC or
-- strict-human search evidence into executable work without reopening stale work.

INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at)
SELECT
  'ge_'||lower(hex(randomblob(16))),
  c.task_id,
  'evidence_rearmed',
  'seo_cloudflare',
  'deferred',
  'New search evidence is newer than the previous verified SEO execution. Task rearmed for fresh proof.',
  datetime('now')
FROM growth_execution_contract c
JOIN growth_opportunity_state g ON g.opportunity_key=c.source_id
JOIN json_each(g.action_json) j ON j.value=c.action
WHERE c.source_kind='opportunity'
  AND c.executor='seo_cloudflare'
  AND c.subject_type='search'
  AND c.status='verified'
  AND g.status='active'
  AND datetime(COALESCE(
    NULLIF(json_extract(g.signal_json,'$.gsc_snapshot_generated_at'),''),
    NULLIF(json_extract(g.signal_json,'$.last_strict_human_at'),''),
    NULLIF(json_extract(g.signal_json,'$.source_generated_at'),''),
    g.updated_at
  )) > datetime(COALESCE(c.verified_at,c.completed_at,c.updated_at))
ORDER BY c.priority_score DESC,
  datetime(COALESCE(
    NULLIF(json_extract(g.signal_json,'$.gsc_snapshot_generated_at'),''),
    NULLIF(json_extract(g.signal_json,'$.last_strict_human_at'),''),
    NULLIF(json_extract(g.signal_json,'$.source_generated_at'),''),
    g.updated_at
  )) ASC,
  c.task_id ASC
LIMIT 8;

UPDATE growth_execution_contract
SET status='deferred',
    claim_deadline=NULL,
    attempt_deadline=NULL,
    verify_deadline=NULL,
    claimed_at=NULL,
    attempted_at=NULL,
    completed_at=NULL,
    verified_at=NULL,
    evidence_json=NULL,
    last_result='new_search_evidence_rearmed_v1',
    updated_at=datetime('now')
WHERE task_id IN (
  SELECT c.task_id
  FROM growth_execution_contract c
  JOIN growth_opportunity_state g ON g.opportunity_key=c.source_id
  JOIN json_each(g.action_json) j ON j.value=c.action
  WHERE c.source_kind='opportunity'
    AND c.executor='seo_cloudflare'
    AND c.subject_type='search'
    AND c.status='verified'
    AND g.status='active'
    AND datetime(COALESCE(
      NULLIF(json_extract(g.signal_json,'$.gsc_snapshot_generated_at'),''),
      NULLIF(json_extract(g.signal_json,'$.last_strict_human_at'),''),
      NULLIF(json_extract(g.signal_json,'$.source_generated_at'),''),
      g.updated_at
    )) > datetime(COALESCE(c.verified_at,c.completed_at,c.updated_at))
  ORDER BY c.priority_score DESC,
    datetime(COALESCE(
      NULLIF(json_extract(g.signal_json,'$.gsc_snapshot_generated_at'),''),
      NULLIF(json_extract(g.signal_json,'$.last_strict_human_at'),''),
      NULLIF(json_extract(g.signal_json,'$.source_generated_at'),''),
      g.updated_at
    )) ASC,
    c.task_id ASC
  LIMIT 8
);
