-- Make the first Stremit Chairman Queue action directly usable.
-- The Stacks surface exposes a New stack action, so point the task there and
-- store a complete publication payload rather than internal drafting notes.

UPDATE distribution_editorial_queue
SET
  target_url='https://stremit.io/stacks/',
  angle='Publish a useful Stack showing a practical AI software discovery workflow with a clear role for every tool.',
  suggested_title='A practical AI tool discovery workflow',
  suggested_body='Description:

A useful AI stack is not a pile of logos. Each tool should have one clear job.

This workflow starts with ToolScout to narrow the market around a real task, uses ChatGPT to challenge the shortlist and turn evidence into a decision, uses Make to automate repeatable handoffs once the workflow is stable, and keeps the operating logic versioned in GitHub so changes stay traceable.

Tools and roles:

1. ToolScout
Role: Discover and compare software around a specific job, budget and workflow. Use it to build the shortlist before opening ten vendor tabs.

2. ChatGPT
Role: Interrogate the shortlist, surface tradeoffs, test assumptions and turn structured findings into a decision brief.

3. Make
Role: Automate recurring handoffs, distribution and follow-up once the workflow is proven. Do not automate a process that is still changing every day.

4. GitHub
Role: Keep code, content rules and production changes versioned so the workflow remains auditable and reversible.

The point is not to use more tools. It is to give each tool a defined role and keep the workflow understandable as individual products change.',
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
  'stremit_first_stack_payload_v2',
  'stremit',
  'editorial_payload_enriched',
  'prepared',
  'community_stack',
  'stremit_first_stack_v1',
  'https://trytoolscout.org/',
  'https://stremit.io/stacks/',
  'First Stremit Stack task now contains a complete title, description, ordered tool roles and the correct Stacks destination.',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM distribution_events WHERE event_id='stremit_first_stack_payload_v2'
);
