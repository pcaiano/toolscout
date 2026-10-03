-- ToolScout 2.0 Phase 239: diversify Contact Supply by official source URL, not only domain.
-- Each domain can carry multiple independently backed-off public research sources.

CREATE TABLE IF NOT EXISTS contact_supply_source (
  source_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_key TEXT,
  source_name TEXT,
  source_url TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_researched_at TEXT,
  next_research_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_supply_source_domain_url
  ON contact_supply_source(domain,source_url);
CREATE INDEX IF NOT EXISTS idx_contact_supply_source_due
  ON contact_supply_source(status,next_research_at,priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_contact_supply_source_domain
  ON contact_supply_source(domain,priority_score DESC);

ALTER TABLE contact_supply_metrics ADD COLUMN diversified_sources INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN diversified_sources_due INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contact_supply_metrics ADD COLUMN diversified_sources_exhausted INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO contact_supply_source(
  source_id,domain,source_type,source_key,source_name,source_url,priority_score,status,next_research_at,created_at,updated_at
)
SELECT 'legacy_'||lower(hex(randomblob(16))),domain,source_type,source_key,source_name,source_url,priority_score,
       'candidate',datetime('now'),datetime('now'),datetime('now')
FROM contact_supply_domain
WHERE source_url IS NOT NULL AND source_url LIKE 'http%';

INSERT OR IGNORE INTO contact_supply_source(
  source_id,domain,source_type,source_key,source_url,priority_score,status,next_research_at,created_at,updated_at
)
SELECT 'vendor_home_'||lower(hex(randomblob(16))),
       lower(replace(vendor_domain,'www.','')),
       'vendor_home',
       tool_slug,
       'https://'||lower(replace(vendor_domain,'www.',''))||'/',
       980,
       'candidate',datetime('now'),datetime('now'),datetime('now')
FROM distribution_vendor_amplification
WHERE vendor_domain IS NOT NULL AND vendor_domain<>'';

INSERT OR IGNORE INTO contact_supply_source(
  source_id,domain,source_type,source_key,source_name,source_url,priority_score,status,next_research_at,created_at,updated_at
)
SELECT 'network_'||lower(hex(randomblob(16))),
       lower(replace(domain,'www.','')),
       'publisher_network',
       surface_slug,
       surface_name,
       source_url,
       900+COALESCE(priority_score,0),
       'candidate',datetime('now'),datetime('now'),datetime('now')
FROM distribution_network_outreach
WHERE domain IS NOT NULL AND source_url LIKE 'http%';

INSERT OR IGNORE INTO contact_supply_source(
  source_id,domain,source_type,source_key,source_name,source_url,priority_score,status,next_research_at,created_at,updated_at
)
SELECT 'surface_'||lower(hex(randomblob(16))),
       lower(replace(
         substr(action_url,instr(action_url,'://')+3,
           CASE WHEN instr(substr(action_url,instr(action_url,'://')+3),'/')>0
             THEN instr(substr(action_url,instr(action_url,'://')+3),'/')-1
             ELSE length(action_url)
           END
         ),'www.',''
       )),
       'distribution_surface',
       surface_slug,
       surface_name,
       action_url,
       760+COALESCE(distribution_score,0),
       'candidate',datetime('now'),datetime('now'),datetime('now')
FROM distribution_opportunities
WHERE action_url LIKE 'http%';

INSERT OR IGNORE INTO contact_supply_source(
  source_id,domain,source_type,source_key,source_url,priority_score,status,next_research_at,created_at,updated_at
)
SELECT 'route_'||lower(hex(randomblob(16))),
       domain,
       'observed_contact_route',
       source_key,
       route_url,
       940,
       'candidate',datetime('now'),datetime('now'),datetime('now')
FROM contact_supply_domain
WHERE route_url IS NOT NULL AND route_url LIKE 'http%';
