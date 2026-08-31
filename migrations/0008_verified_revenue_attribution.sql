ALTER TABLE click_events ADD COLUMN click_ref TEXT;
ALTER TABLE click_events ADD COLUMN affiliate_sub_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_click_ref
  ON click_events(click_ref)
  WHERE click_ref IS NOT NULL;

ALTER TABLE revenue_ledger ADD COLUMN click_ref TEXT;
ALTER TABLE revenue_ledger ADD COLUMN vendor_sub_id TEXT;
ALTER TABLE revenue_ledger ADD COLUMN record_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_record_key
  ON revenue_ledger(record_key)
  WHERE record_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_revenue_click_ref ON revenue_ledger(click_ref);

CREATE TABLE IF NOT EXISTS revenue_ledger_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('insert','update')),
  affiliate_slug TEXT NOT NULL,
  conversion_id TEXT,
  record_key TEXT,
  status TEXT NOT NULL,
  attribution_status TEXT NOT NULL,
  commission REAL NOT NULL,
  currency TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revenue_audit_ledger ON revenue_ledger_audit(ledger_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_revenue_audit_record_key ON revenue_ledger_audit(record_key);

CREATE TRIGGER IF NOT EXISTS trg_revenue_attribution_insert
BEFORE INSERT ON revenue_ledger
WHEN NEW.attribution_status IN ('attributed','vendor_confirmed')
BEGIN
  SELECT (CASE
    WHEN NEW.click_ref IS NULL OR NEW.vendor_sub_id IS NULL OR NEW.click_ref != NEW.vendor_sub_id
      THEN RAISE(ABORT, 'attributed revenue requires matching click_ref and vendor_sub_id')
    WHEN NEW.conversion_id IS NULL
      THEN RAISE(ABORT, 'attributed revenue requires a vendor conversion_id')
    WHEN NOT EXISTS (
      SELECT 1 FROM click_events
      WHERE click_ref = NEW.click_ref
        AND affiliate_sub_id = NEW.vendor_sub_id
        AND source != 'internal-test'
    ) THEN RAISE(ABORT, 'attributed revenue click evidence not found')
  END);
END;

CREATE TRIGGER IF NOT EXISTS trg_revenue_attribution_update
BEFORE UPDATE ON revenue_ledger
WHEN NEW.attribution_status IN ('attributed','vendor_confirmed')
BEGIN
  SELECT (CASE
    WHEN NEW.click_ref IS NULL OR NEW.vendor_sub_id IS NULL OR NEW.click_ref != NEW.vendor_sub_id
      THEN RAISE(ABORT, 'attributed revenue requires matching click_ref and vendor_sub_id')
    WHEN NEW.conversion_id IS NULL
      THEN RAISE(ABORT, 'attributed revenue requires a vendor conversion_id')
    WHEN NOT EXISTS (
      SELECT 1 FROM click_events
      WHERE click_ref = NEW.click_ref
        AND affiliate_sub_id = NEW.vendor_sub_id
        AND source != 'internal-test'
    ) THEN RAISE(ABORT, 'attributed revenue click evidence not found')
  END);
END;

CREATE TRIGGER IF NOT EXISTS trg_revenue_unattributed_insert
BEFORE INSERT ON revenue_ledger
WHEN NEW.attribution_status = 'unattributed'
  AND (NEW.click_ref IS NOT NULL OR NEW.vendor_sub_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'unattributed revenue cannot claim click identity');
END;

CREATE TRIGGER IF NOT EXISTS trg_revenue_unattributed_update
BEFORE UPDATE ON revenue_ledger
WHEN NEW.attribution_status = 'unattributed'
  AND (NEW.click_ref IS NOT NULL OR NEW.vendor_sub_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'unattributed revenue cannot claim click identity');
END;

CREATE TRIGGER IF NOT EXISTS trg_revenue_audit_insert
AFTER INSERT ON revenue_ledger
BEGIN
  INSERT INTO revenue_ledger_audit (
    ledger_id, operation, affiliate_slug, conversion_id, record_key,
    status, attribution_status, commission, currency, evidence_ref
  ) VALUES (
    NEW.id, 'insert', NEW.affiliate_slug, NEW.conversion_id, NEW.record_key,
    NEW.status, NEW.attribution_status, NEW.commission, NEW.currency, NEW.evidence_ref
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_revenue_audit_update
AFTER UPDATE ON revenue_ledger
BEGIN
  INSERT INTO revenue_ledger_audit (
    ledger_id, operation, affiliate_slug, conversion_id, record_key,
    status, attribution_status, commission, currency, evidence_ref
  ) VALUES (
    NEW.id, 'update', NEW.affiliate_slug, NEW.conversion_id, NEW.record_key,
    NEW.status, NEW.attribution_status, NEW.commission, NEW.currency, NEW.evidence_ref
  );
END;
