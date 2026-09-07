UPDATE distribution_opportunities
SET status='human_action_required',
    human_required=1,
    updated_at=datetime('now')
WHERE surface_slug IN (
  'the-rundown-ai-supertools',
  'launch-llama',
  'best-of-ai',
  'nextool-ai',
  'stremit'
);

UPDATE distribution_submissions
SET status='human_required',
    human_required=1,
    error='manual_or_editorial_route',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'the-rundown-ai-supertools',
  'launch-llama',
  'best-of-ai',
  'nextool-ai',
  'stremit'
)
AND status='research_required';
