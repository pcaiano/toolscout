ALTER TABLE distribution_auto_adapters ADD COLUMN verification_endpoint TEXT;
ALTER TABLE distribution_auto_adapters ADD COLUMN public_url TEXT;
ALTER TABLE distribution_auto_adapters ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'GET';
ALTER TABLE distribution_auto_adapters ADD COLUMN auth_type TEXT;
ALTER TABLE distribution_auto_adapters ADD COLUMN auth_detail TEXT;

UPDATE distribution_opportunities
SET status='human_action_required',
    human_required=1,
    next_action=CASE surface_slug
      WHEN 'hacker-news' THEN 'Prepare a factual Show HN post only when there is a strong builder story and a product people can try immediately. Human/editorial action is intentional.'
      WHEN 'indie-hackers' THEN 'Publish a useful founder/product story manually when there is a genuine discussion angle. Human/editorial action is intentional.'
      WHEN 'pitchwall' THEN 'Use the authenticated submission form manually. Keep outside automatic execution unless a verified machine-readable API is later discovered.'
      WHEN 'tiny-startups' THEN 'Use the authenticated/free review submission route manually. Keep outside automatic execution unless a verified machine-readable API is later discovered.'
      ELSE next_action
    END,
    updated_at=datetime('now')
WHERE surface_slug IN ('hacker-news','indie-hackers','pitchwall','tiny-startups')
  AND status NOT IN ('live','submitted','pending_review','scheduled','verified','rejected','skipped');

UPDATE distribution_submissions
SET status='human_required',
    human_required=1,
    error='manual_or_editorial_route',
    updated_at=datetime('now')
WHERE surface_slug IN ('hacker-news','indie-hackers','pitchwall','tiny-startups')
  AND status='adapter_missing';
