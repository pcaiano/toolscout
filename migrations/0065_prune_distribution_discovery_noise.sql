UPDATE distribution_opportunities
SET status='skipped',
    human_required=0,
    next_action='Excluded as discovery noise or infrastructure rather than a distribution surface.',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'cdn-sanity-io',
  'fazier-production-s3-amazonaws-com',
  'sln-startupfa-me',
  'falakdigital-notion-site'
)
AND status IN ('candidate','discovered','research_required');

UPDATE distribution_discovery_sources
SET status='deprioritized',
    confidence=0,
    updated_at=datetime('now')
WHERE source_host IN (
  'cdn.sanity.io',
  'fazier-production.s3.amazonaws.com',
  'sln.startupfa.me',
  'falakdigital.notion.site'
);
