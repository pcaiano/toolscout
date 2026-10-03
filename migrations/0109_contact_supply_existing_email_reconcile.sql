-- ToolScout 2.0 Phase 236: reconcile pre-existing discovered emails against sender admissibility.
-- Idempotent data repair. No contact is deleted and no outbound permission is widened.

UPDATE contact_supply_domain
SET status='cooldown',updated_at=datetime('now')
WHERE contact_email IS NOT NULL
  AND status IN ('ready_email','email_discovered_unrouted','cooldown')
  AND (
    EXISTS(
      SELECT 1 FROM distribution_vendor_amplification sent
      WHERE lower(sent.vendor_domain)=contact_supply_domain.domain
        AND sent.status='sent'
        AND sent.outreach_sent_at>=datetime('now','-30 days')
    )
    OR EXISTS(
      SELECT 1 FROM distribution_network_outreach sent
      WHERE lower(sent.domain)=contact_supply_domain.domain
        AND sent.status IN ('sent','adopted')
        AND sent.outreach_sent_at>=datetime('now','-30 days')
    )
  );

UPDATE contact_supply_domain
SET status='ready_email',updated_at=datetime('now')
WHERE contact_email IS NOT NULL
  AND status IN ('ready_email','email_discovered_unrouted','cooldown')
  AND NOT EXISTS(
    SELECT 1 FROM distribution_vendor_amplification sent
    WHERE lower(sent.vendor_domain)=contact_supply_domain.domain
      AND sent.status='sent'
      AND sent.outreach_sent_at>=datetime('now','-30 days')
  )
  AND NOT EXISTS(
    SELECT 1 FROM distribution_network_outreach sent
    WHERE lower(sent.domain)=contact_supply_domain.domain
      AND sent.status IN ('sent','adopted')
      AND sent.outreach_sent_at>=datetime('now','-30 days')
  )
  AND (
    EXISTS(
      SELECT 1 FROM distribution_vendor_amplification v
      WHERE lower(v.vendor_domain)=contact_supply_domain.domain
        AND v.status='contact_found'
        AND v.contact_email IS NOT NULL
    )
    OR EXISTS(
      SELECT 1 FROM distribution_network_outreach n
      WHERE lower(n.domain)=contact_supply_domain.domain
        AND n.status='contact_found'
        AND n.contact_email IS NOT NULL
        AND NOT EXISTS(
          SELECT 1 FROM distribution_opportunities o
          WHERE o.surface_slug=n.surface_slug
            AND o.status='policy_blocked'
        )
    )
  );

UPDATE contact_supply_domain
SET status='email_discovered_unrouted',updated_at=datetime('now')
WHERE contact_email IS NOT NULL
  AND status IN ('ready_email','email_discovered_unrouted','cooldown')
  AND NOT EXISTS(
    SELECT 1 FROM distribution_vendor_amplification sent
    WHERE lower(sent.vendor_domain)=contact_supply_domain.domain
      AND sent.status='sent'
      AND sent.outreach_sent_at>=datetime('now','-30 days')
  )
  AND NOT EXISTS(
    SELECT 1 FROM distribution_network_outreach sent
    WHERE lower(sent.domain)=contact_supply_domain.domain
      AND sent.status IN ('sent','adopted')
      AND sent.outreach_sent_at>=datetime('now','-30 days')
  )
  AND NOT (
    EXISTS(
      SELECT 1 FROM distribution_vendor_amplification v
      WHERE lower(v.vendor_domain)=contact_supply_domain.domain
        AND v.status='contact_found'
        AND v.contact_email IS NOT NULL
    )
    OR EXISTS(
      SELECT 1 FROM distribution_network_outreach n
      WHERE lower(n.domain)=contact_supply_domain.domain
        AND n.status='contact_found'
        AND n.contact_email IS NOT NULL
        AND NOT EXISTS(
          SELECT 1 FROM distribution_opportunities o
          WHERE o.surface_slug=n.surface_slug
            AND o.status='policy_blocked'
        )
    )
  );

UPDATE contact_supply_metrics
SET ready_email=(
      SELECT COUNT(*) FROM contact_supply_domain
      WHERE status='ready_email' AND contact_email IS NOT NULL
    ),
    email_discovered_unrouted=(
      SELECT COUNT(*) FROM contact_supply_domain
      WHERE status='email_discovered_unrouted' AND contact_email IS NOT NULL
    ),
    cooldown=(
      SELECT COUNT(*) FROM contact_supply_domain WHERE status='cooldown'
    ),
    updated_at=datetime('now')
WHERE id='global';
