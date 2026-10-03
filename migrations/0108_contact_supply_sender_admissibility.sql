-- ToolScout 2.0 Phase 235: separate discovered email truth from sender-admissible supply.
-- Additive only. No contact is deleted and no new outbound authorization is granted.

ALTER TABLE contact_supply_metrics ADD COLUMN email_discovered_unrouted INTEGER NOT NULL DEFAULT 0;
