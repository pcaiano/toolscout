-- Persist confirmed owner outreach/submission evidence so the canonical affiliate
-- source of truth cannot re-surface already-contacted programmes as fresh human work.

INSERT INTO affiliate_workflow(
  tool_slug,status,submitted_at,response_at,affiliate_url,notes,
  network,program_name,program_url,application_url,blocker,evidence_json,
  source_actor,last_verified,updated_at
) VALUES
  (
    'attio','pending_review','2026-09-04T11:22:18Z',NULL,NULL,
    'Owner contacted Attio support by email about an affiliate partnership on 2026-09-04. Await response; do not create a duplicate affiliate application or outreach action.',
    'Direct','Attio',NULL,NULL,NULL,
    '[{"source":"Gmail","type":"outreach_sent","sent_at":"2026-09-04T11:22:18Z","subject":"Affiliate partnership for ToolScout"}]',
    'gmail_owner_outreach','2026-09-04T11:22:18Z',datetime('now')
  ),
  (
    'ubersuggest','pending_review','2026-09-05T10:31:47Z',NULL,NULL,
    'Owner contacted Ubersuggest support by email about an affiliate/referral partnership on 2026-09-05. Await response; do not create duplicate outreach.',
    'Direct','Ubersuggest',NULL,NULL,NULL,
    '[{"source":"Gmail","type":"outreach_sent","sent_at":"2026-09-05T10:31:47Z","subject":"Ubersuggest affiliate / referral partnership for ToolScout"}]',
    'gmail_owner_outreach','2026-09-05T10:31:47Z',datetime('now')
  ),
  (
    'zoho-crm','submitted','2026-09-05T11:13:56Z',NULL,NULL,
    'Zoho requested eligibility/onboarding information and the owner replied with the requested details on 2026-09-05. Await Zoho evaluation; do not duplicate submission or outreach.',
    'Direct','Zoho','https://www.zoho.com/affiliate/',NULL,NULL,
    '[{"source":"Gmail","type":"onboarding_reply_sent","sent_at":"2026-09-05T11:13:56Z","subject":"Re: Zoho Affiliate Program: Evaluation Process and Next Steps"}]',
    'gmail_owner_outreach','2026-09-05T11:13:56Z',datetime('now')
  )
ON CONFLICT(tool_slug) DO UPDATE SET
  status=excluded.status,
  submitted_at=COALESCE(affiliate_workflow.submitted_at,excluded.submitted_at),
  notes=excluded.notes,
  network=COALESCE(affiliate_workflow.network,excluded.network),
  program_name=COALESCE(affiliate_workflow.program_name,excluded.program_name),
  program_url=COALESCE(affiliate_workflow.program_url,excluded.program_url),
  evidence_json=excluded.evidence_json,
  source_actor=excluded.source_actor,
  last_verified=excluded.last_verified,
  updated_at=datetime('now');
