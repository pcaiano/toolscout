INSERT INTO affiliate_workflow(tool_slug,status,affiliate_url,notes,network,source_actor,last_verified,updated_at) VALUES
 ('systeme-io','verified','https://systeme.io/?sa=sa01865850756e283e72f747af10845cc8357b3109','Production /go redirect verified against expected external host.','Direct','production_smoke','2026-09-01',datetime('now')),
 ('beehiiv','verified','https://www.beehiiv.com/?via=pedro-caiano','Production /go redirect verified against expected external host.','Dub','production_smoke','2026-09-01',datetime('now')),
 ('jotform','verified','https://www.jotform.com/products/form-builder/?partner=pcaiano','Production /go redirect verified against expected external host.','Direct','production_smoke','2026-09-01',datetime('now')),
 ('pipedrive','verified','https://aff.trypipedrive.com/e5qvcwi1i22u','Production /go redirect verified; primary PartnerStack first-commission unlock target.','PartnerStack','production_smoke','2026-09-01',datetime('now')),
 ('make','verified','https://www.make.com/en/register?pc=toolscout','Production /go redirect verified against expected external host.','Direct','production_smoke','2026-09-01',datetime('now')),
 ('semrush','submitted',NULL,'Application received via Impact; awaiting advertiser review.','Impact','repository_evidence','2026-09-01',datetime('now')),
 ('adcreative-ai','submitted',NULL,'Application submitted through PartnerStack; awaiting review.','PartnerStack','repository_evidence','2026-09-01',datetime('now')),
 ('n8n','submitted',NULL,'Application received by PartnerStack and submitted for advertiser review.','PartnerStack','repository_evidence','2026-09-01',datetime('now')),
 ('hubspot','rejected',NULL,'Advertiser reconsideration declined pending at least 1,000 verified monthly visitors.','Impact','gmail_evidence','2026-09-01',datetime('now')),
 ('grammarly','rejected',NULL,'Advertiser auto-rejection under current criteria; not an Impact-wide rejection.','Impact','gmail_evidence','2026-09-01',datetime('now')),
 ('buffer','blocked',NULL,'Existing application/process must be reviewed or awaited; duplicate submission prohibited.','Dub','repository_evidence','2026-09-01',datetime('now')),
 ('framer','program_exists',NULL,'Creator-gated manual eligibility path; not a standard open application.','Dub','official_program_page','2026-09-01',datetime('now')),
 ('ahrefs','no_program_found',NULL,'Official vendor evidence states no affiliate program.','Direct','official_program_page','2026-09-01',datetime('now')),
 ('calendly','no_program_found',NULL,'Official vendor evidence states no affiliate, referral or reseller program.','Direct','official_program_page','2026-09-01',datetime('now')),
 ('notion','paused',NULL,'New affiliate applications are paused.','Direct','official_program_page','2026-09-01',datetime('now'))
ON CONFLICT(tool_slug) DO UPDATE SET status=excluded.status,affiliate_url=COALESCE(excluded.affiliate_url,affiliate_workflow.affiliate_url),notes=excluded.notes,network=excluded.network,source_actor=excluded.source_actor,last_verified=excluded.last_verified,updated_at=datetime('now');
