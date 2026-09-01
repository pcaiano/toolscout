ALTER TABLE affiliate_workflow ADD COLUMN network TEXT;
ALTER TABLE affiliate_workflow ADD COLUMN program_name TEXT;
ALTER TABLE affiliate_workflow ADD COLUMN program_url TEXT;
ALTER TABLE affiliate_workflow ADD COLUMN application_url TEXT;
ALTER TABLE affiliate_workflow ADD COLUMN blocker TEXT;
ALTER TABLE affiliate_workflow ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE affiliate_workflow ADD COLUMN source_actor TEXT;
ALTER TABLE affiliate_workflow ADD COLUMN last_verified TEXT;

CREATE TABLE IF NOT EXISTS affiliate_workflow_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  actor_source TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_affiliate_history_tool ON affiliate_workflow_history(tool_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_network_registry (
  network_key TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  constraint_note TEXT,
  unlock_tool_slug TEXT,
  last_verified TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO affiliate_network_registry(network_key,name,status,constraint_note,unlock_tool_slug,last_verified) VALUES
 ('direct','Direct','available','Direct official programmes remain eligible without a marketplace intermediary.',NULL,'2026-09-01'),
 ('dub','Dub','available','ToolScout has marketplace access; programme approval remains advertiser-specific.',NULL,'2026-09-01'),
 ('impact','Impact','available','Advertiser decisions are isolated and never treated as network-wide decisions.',NULL,'2026-09-01'),
 ('partnerstack','PartnerStack','marketplace_blocked','Marketplace remains blocked until the first commission in an existing partnership.','pipedrive','2026-09-01')
ON CONFLICT(network_key) DO UPDATE SET name=excluded.name,status=excluded.status,constraint_note=excluded.constraint_note,unlock_tool_slug=excluded.unlock_tool_slug,last_verified=excluded.last_verified,updated_at=datetime('now');

CREATE TRIGGER IF NOT EXISTS trg_affiliate_workflow_history_insert
AFTER INSERT ON affiliate_workflow
BEGIN
  INSERT INTO affiliate_workflow_history(tool_slug,previous_state,new_state,evidence_source,actor_source,notes)
  VALUES(NEW.tool_slug,NULL,NEW.status,COALESCE(NEW.source_actor,'repository'),COALESCE(NEW.source_actor,'system'),NEW.notes);
END;

CREATE TRIGGER IF NOT EXISTS trg_affiliate_workflow_history_update
AFTER UPDATE OF status ON affiliate_workflow
WHEN OLD.status != NEW.status
BEGIN
  INSERT INTO affiliate_workflow_history(tool_slug,previous_state,new_state,evidence_source,actor_source,notes)
  VALUES(NEW.tool_slug,OLD.status,NEW.status,COALESCE(NEW.source_actor,'dashboard'),COALESCE(NEW.source_actor,'human'),NEW.notes);
END;
