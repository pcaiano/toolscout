-- ToolScout 2.0 Phase 22
-- Complete affiliate-network evidence ownership in migrations.
-- Existing production already has the compatibility columns from the former
-- reconcile endpoint; clean installs receive them from migration 0084.

CREATE INDEX IF NOT EXISTS idx_affiliate_network_click_evidence_account_observed
  ON affiliate_network_click_evidence(account_email,observed_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_network_accounts (
  network TEXT NOT NULL,
  account_email TEXT NOT NULL,
  status TEXT NOT NULL,
  marketplace_state TEXT,
  observed_at TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY(network,account_email)
);

CREATE TABLE IF NOT EXISTS affiliate_network_program_evidence (
  network TEXT NOT NULL,
  account_email TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  programme_status TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY(network,account_email,tool_slug)
);

INSERT OR REPLACE INTO affiliate_network_accounts(
  network,account_email,status,marketplace_state,observed_at,evidence_source,note
) VALUES
('partnerstack','pedro@trytoolscout.org','active','active_programs','2026-09-29 09:37:26','owner_dashboard',
 'Owner supplied current PartnerStack dashboard with seven active programmes and current click totals.'),
('partnerstack','pcaiano@gmail.com','active','restricted_new_program_access','2026-08-31 14:24:58','gmail',
 'Gmail confirms a separate PartnerStack identity. Marketplace access to new programmes was limited; existing programme participation remains account-specific.');

INSERT OR REPLACE INTO affiliate_network_program_evidence(
  network,account_email,tool_slug,programme_status,observed_at,evidence_source,note
) VALUES
('partnerstack','pcaiano@gmail.com','pipedrive','active','2026-08-31 22:46:07','gmail',
 'PartnerStack approval email confirms Pipedrive approved this account.'),
('partnerstack','pcaiano@gmail.com','adcreative-ai','active','2026-09-03 07:27:05','gmail',
 'AdCreative.ai welcome email confirms active affiliate participation on this account.'),
('partnerstack','pcaiano@gmail.com','n8n','rejected','2026-09-01 19:21:49','gmail',
 'PartnerStack email confirms n8n rejected this account.');

UPDATE affiliate_network_click_evidence
SET account_email=COALESCE(account_email,'pedro@trytoolscout.org')
WHERE evidence_key='partnerstack:apollo:first-10:2026-09-25T17:12:28Z';

INSERT OR REPLACE INTO affiliate_network_program_evidence(
  network,account_email,tool_slug,programme_status,observed_at,evidence_source,note
) VALUES
('partnerstack','pedro@trytoolscout.org','unbounce','active','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack dashboard supplied by owner.'),
('partnerstack','pedro@trytoolscout.org','apollo','active','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack dashboard supplied by owner.'),
('partnerstack','pedro@trytoolscout.org','gorgias','active','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack dashboard supplied by owner.'),
('partnerstack','pedro@trytoolscout.org','brevo','active','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack dashboard supplied by owner.'),
('partnerstack','pedro@trytoolscout.org','kit','active','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack dashboard supplied by owner.'),
('partnerstack','pedro@trytoolscout.org','instantly','active','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack dashboard supplied by owner.'),
('partnerstack','pedro@trytoolscout.org','lemlist','active','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack dashboard supplied by owner.');

INSERT OR REPLACE INTO affiliate_network_click_evidence(
  evidence_key,tool_slug,provider,programme,account_email,programme_status,
  reported_clicks_total,reported_conversions_total,pending_commission_amount,currency,
  observed_at,evidence_source,note
) VALUES
('partnerstack:pedro@trytoolscout.org:unbounce:dashboard:2026-09-29T09:37:26Z','unbounce','partnerstack','unbounce','pedro@trytoolscout.org','active',6,0,0,'USD','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack programme dashboard supplied by owner; status Active, zero conversions and zero pending commissions.'),
('partnerstack:pedro@trytoolscout.org:apollo:dashboard:2026-09-29T09:37:26Z','apollo','partnerstack','apollo','pedro@trytoolscout.org','active',19,0,0,'USD','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack programme dashboard supplied by owner; status Active, zero conversions and zero pending commissions.'),
('partnerstack:pedro@trytoolscout.org:gorgias:dashboard:2026-09-29T09:37:26Z','gorgias','partnerstack','gorgias','pedro@trytoolscout.org','active',20,0,0,'USD','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack programme dashboard supplied by owner; status Active, zero conversions and zero pending commissions.'),
('partnerstack:pedro@trytoolscout.org:brevo:dashboard:2026-09-29T09:37:26Z','brevo','partnerstack','brevo','pedro@trytoolscout.org','active',0,0,0,'USD','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack programme dashboard supplied by owner; status Active, zero conversions and zero pending commissions.'),
('partnerstack:pedro@trytoolscout.org:kit:dashboard:2026-09-29T09:37:26Z','kit','partnerstack','kit','pedro@trytoolscout.org','active',23,0,0,'USD','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack programme dashboard supplied by owner; status Active, zero conversions and zero pending commissions.'),
('partnerstack:pedro@trytoolscout.org:instantly:dashboard:2026-09-29T09:37:26Z','instantly','partnerstack','instantly','pedro@trytoolscout.org','active',12,0,0,'USD','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack programme dashboard supplied by owner; status Active, zero conversions and zero pending commissions.'),
('partnerstack:pedro@trytoolscout.org:lemlist:dashboard:2026-09-29T09:37:26Z','lemlist','partnerstack','lemlist','pedro@trytoolscout.org','active',27,0,0,'USD','2026-09-29 09:37:26','owner_dashboard','Current PartnerStack programme dashboard supplied by owner; status Active, zero conversions and zero pending commissions.');
