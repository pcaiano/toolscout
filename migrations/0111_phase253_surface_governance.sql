-- ToolScout 2.0 Phase 253: reconcile the Phase 251 discovery cohort after the Phase 252 quality gate.
-- Preserve legitimate self-service software-discovery surfaces, suppress competitor outreach,
-- and remove clearly non-target/source-owned surfaces from execution.

-- Brand-named software discovery/review surfaces do not always contain lexical "directory" tokens.
-- Classify them explicitly so they stay eligible for self-service submission but never publisher outreach.
UPDATE distribution_opportunities
SET surface_type='directory',
    next_action=CASE
      WHEN status IN ('discovered','candidate','research_required','stale')
      THEN 'Known software-discovery/review surface. Use self-service listing/submission research only; publisher outreach is prohibited.'
      ELSE next_action
    END,
    updated_at=datetime('now')
WHERE surface_slug IN (
  'sourceforge-net','getapp-com','softwareadvice-com','capterra-com','crozdesk-com',
  'solutions-trustradius-com','aitools-fyi','easywithai-com','aitoolmall-com',
  'aitoolsdirectory-com','topai-tools'
);

UPDATE distribution_opportunities
SET surface_type='launch_surface',updated_at=datetime('now')
WHERE surface_slug IN ('allstartups-info','americanstartups-com','appsumo-com');

UPDATE distribution_opportunities
SET surface_type='editorial_resource',updated_at=datetime('now')
WHERE surface_slug IN ('arcticstartup-com');

-- These Phase 251 rows are not appropriate ToolScout distribution targets.
UPDATE distribution_opportunities
SET status='skipped',
    human_required=0,
    next_action='Phase 253 reconciliation: non-target, source-owned, mobile-app-only, or incompatible platform; excluded from ToolScout acquisition execution.',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'office-angi-com',
  'androidappsreview-com','apprater-net','appslisto-com','appspy-com','appagg-com','appiod-com',
  'appolicious-com','apps400-com','appsmirror-com','appsthunder-com','appvita-com','appysmarts-com',
  'app-thestacc-com','app-getfernand-com','chromewebstore-google-com','wordpress-org',
  'help-peerlist-io','help-uneed-best'
)
AND status NOT IN ('live','verified','submitted','pending_review');

-- Cancel execution work for non-target surfaces so it cannot consume route research or sender capacity.
UPDATE growth_execution_contract
SET status='cancelled',
    claim_deadline=NULL,
    attempt_deadline=NULL,
    verify_deadline=NULL,
    claimed_at=NULL,
    attempted_at=NULL,
    last_result='phase253_non_distribution_surface_cancelled',
    updated_at=datetime('now')
WHERE subject_type='surface'
  AND subject_key IN (
    'office-angi-com',
    'androidappsreview-com','apprater-net','appslisto-com','appspy-com','appagg-com','appiod-com',
    'appolicious-com','apps400-com','appsmirror-com','appsthunder-com','appvita-com','appysmarts-com',
    'app-thestacc-com','app-getfernand-com','chromewebstore-google-com','wordpress-org',
    'help-peerlist-io','help-uneed-best'
  )
  AND status IN ('pending','claimed','attempted','deferred','stalled');

-- Direct software-discovery competitors remain usable through self-service listing routes,
-- but email/editorial partnership outreach is explicitly forbidden.
UPDATE distribution_network_outreach
SET status='suppressed_competitor',
    public_dispatch_token=NULL,
    public_dispatch_leased_at=NULL,
    outreach_error='phase253_self_service_only_competitor_surface',
    updated_at=datetime('now')
WHERE surface_slug IN (
  'sourceforge-net','getapp-com','softwareadvice-com','capterra-com','crozdesk-com',
  'solutions-trustradius-com','aitools-fyi','easywithai-com','aitoolmall-com',
  'aitoolsdirectory-com','topai-tools'
)
AND status NOT IN ('sent','adopted','suppressed_competitor');

UPDATE growth_execution_contract
SET status='cancelled',
    claim_deadline=NULL,
    attempt_deadline=NULL,
    verify_deadline=NULL,
    claimed_at=NULL,
    attempted_at=NULL,
    last_result='phase253_competitor_outreach_suppressed_self_service_only',
    updated_at=datetime('now')
WHERE subject_type='surface'
  AND executor IN ('distribution_network','make_sender')
  AND subject_key IN (
    'sourceforge-net','getapp-com','softwareadvice-com','capterra-com','crozdesk-com',
    'solutions-trustradius-com','aitools-fyi','easywithai-com','aitoolmall-com',
    'aitoolsdirectory-com','topai-tools'
  )
  AND status IN ('pending','claimed','attempted','deferred','stalled');

-- Contact Supply must not keep researching email routes for suppressed/noise surfaces.
UPDATE contact_supply_source
SET status='exhausted',
    last_result='phase253_surface_not_email_outreach_eligible',
    updated_at=datetime('now')
WHERE source_key IN (
  'sourceforge-net','getapp-com','softwareadvice-com','capterra-com','crozdesk-com',
  'solutions-trustradius-com','aitools-fyi','easywithai-com','aitoolmall-com',
  'aitoolsdirectory-com','topai-tools',
  'office-angi-com',
  'androidappsreview-com','apprater-net','appslisto-com','appspy-com','appagg-com','appiod-com',
  'appolicious-com','apps400-com','appsmirror-com','appsthunder-com','appvita-com','appysmarts-com',
  'app-thestacc-com','app-getfernand-com','chromewebstore-google-com','wordpress-org',
  'help-peerlist-io','help-uneed-best'
)
  AND status NOT IN ('exhausted','verified');
