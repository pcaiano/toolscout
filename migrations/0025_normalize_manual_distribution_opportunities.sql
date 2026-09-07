UPDATE distribution_opportunities
SET status='human_action_required',
    human_required=1,
    updated_at=datetime('now')
WHERE surface_slug IN (
  'hacker-news',
  'indie-hackers',
  'launching-next',
  'tiny-startups',
  'pitchwall',
  'microlaunch',
  'betalist'
)
AND status NOT IN ('live','submitted','pending_review','scheduled','verified','rejected','skipped');

UPDATE distribution_submissions
SET status='human_required',
    human_required=1,
    error='manual_or_reputation_sensitive',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'hacker-news',
  'indie-hackers',
  'launching-next',
  'tiny-startups',
  'pitchwall',
  'microlaunch',
  'betalist'
)
AND status IN ('adapter_missing','ready');
