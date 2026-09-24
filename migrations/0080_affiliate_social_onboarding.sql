-- Affiliate social compliance onboarding
-- Ensures every monetizable affiliate route is queued for organic-social policy classification.

CREATE TABLE IF NOT EXISTS affiliate_social_policy_queue(
  tool_slug TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  affiliate_url TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_affiliate_social_on_insert
AFTER INSERT ON affiliate_workflow
WHEN NEW.status IN ('link_acquired','active','verified','earning')
 AND NEW.affiliate_url IS NOT NULL AND trim(NEW.affiliate_url)<>''
BEGIN
  INSERT INTO affiliate_social_policy_queue(tool_slug,status,source,affiliate_url,queued_at,processed_at,updated_at)
  VALUES(NEW.tool_slug,'pending','d1_trigger',NEW.affiliate_url,datetime('now'),NULL,datetime('now'))
  ON CONFLICT(tool_slug) DO UPDATE SET
    status='pending',
    source='d1_trigger',
    affiliate_url=excluded.affiliate_url,
    queued_at=datetime('now'),
    processed_at=NULL,
    updated_at=datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_affiliate_social_on_update
AFTER UPDATE OF status,affiliate_url ON affiliate_workflow
WHEN NEW.status IN ('link_acquired','active','verified','earning')
 AND NEW.affiliate_url IS NOT NULL AND trim(NEW.affiliate_url)<>''
 AND (OLD.status IS NOT NEW.status OR OLD.affiliate_url IS NOT NEW.affiliate_url)
BEGIN
  INSERT INTO affiliate_social_policy_queue(tool_slug,status,source,affiliate_url,queued_at,processed_at,updated_at)
  VALUES(NEW.tool_slug,'pending','d1_trigger',NEW.affiliate_url,datetime('now'),NULL,datetime('now'))
  ON CONFLICT(tool_slug) DO UPDATE SET
    status='pending',
    source='d1_trigger',
    affiliate_url=excluded.affiliate_url,
    queued_at=datetime('now'),
    processed_at=NULL,
    updated_at=datetime('now');
END;
