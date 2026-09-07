UPDATE distribution_opportunities
SET status='skipped',
    human_required=0,
    next_action='Excluded from continuous discovery: canonical duplicate, registry source host, or non-submission destination.',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'claude-ai',
  'gemini-google-com',
  'perplexity-ai',
  'producthunt-com',
  'fazier-com',
  'tinylaun-ch',
  'favors-dev',
  'launchdirectories-com'
);

UPDATE distribution_submissions
SET status='skipped',
    human_required=0,
    error='discovery_false_positive_or_duplicate',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'claude-ai',
  'gemini-google-com',
  'perplexity-ai',
  'producthunt-com',
  'fazier-com',
  'tinylaun-ch',
  'favors-dev',
  'launchdirectories-com'
)
AND status='research_required';
