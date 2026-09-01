UPDATE affiliate_workflow
SET status = 'rejected',
    response_at = '2026-09-01T19:21:00.000Z',
    notes = 'PartnerStack recorded n8n GmbH rejection at 2026-09-01 19:21 UTC. Do not reapply without a material eligibility change or explicit invitation.',
    blocker = 'advertiser_rejected',
    evidence_json = '[{"source":"PartnerStack","decision":"rejected","received_at":"2026-09-01T19:21:00.000Z"}]',
    source_actor = 'partnerstack_evidence',
    last_verified = '2026-09-01',
    updated_at = datetime('now')
WHERE tool_slug = 'n8n'
  AND status IN ('submitted', 'pending_review');
