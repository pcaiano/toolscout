-- ToolScout 2.0 Phase 232: persistent observability for the vendor public-route bridge.
-- Additive only. Existing contact-supply truth remains intact.

ALTER TABLE contact_supply_metrics ADD COLUMN route_filtered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN vendor_routes_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN vendor_routes_research INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN vendor_routes_policy_blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN vendor_routes_skipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN vendor_routes_human_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN vendor_routes_authority_like INTEGER NOT NULL DEFAULT 0;
