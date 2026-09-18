-- Record the first ToolScout Stremit Stack as publicly published.
-- Public verification on 2026-09-18 confirmed HTTP 200 at the canonical Stack URL.
-- The visible Stack currently includes ToolScout and ChatGPT as actual tools, while
-- the description also references Make and GitHub.

UPDATE distribution_editorial_queue
SET status='published',
    target_url='https://stremit.io/stacks/a-practical-ai-tool-discovery-workflow',
    updated_at=datetime('now')
WHERE queue_id='stremit_first_stack_v1'
  AND status='prepared';

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
  'stremit_first_stack_published_v1',
  'stremit',
  'editorial_published',
  'published',
  'community_stack',
  'stremit_first_stack_v1',
  'https://trytoolscout.org/',
  'https://stremit.io/stacks/a-practical-ai-tool-discovery-workflow',
  'Public Stremit Stack verified live. Visible Stack tools: ToolScout and ChatGPT. Description also references Make and GitHub. Keep under measurement and treat tool-composition mismatch as editorial refinement, not a failed publication.',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM distribution_events WHERE event_id='stremit_first_stack_published_v1'
);

UPDATE distribution_economic_learning
SET operating_decision='measure',
    decision_reason='Stremit listing and first community Stack are publicly live. Measure browser-confirmed referral sessions and downstream outbound activity before changing priority.',
    decided_at=datetime('now'),
    updated_at=datetime('now')
WHERE surface_slug='stremit';
