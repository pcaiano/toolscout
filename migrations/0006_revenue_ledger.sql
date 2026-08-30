CREATE TABLE IF NOT EXISTS revenue_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_slug TEXT NOT NULL,
  tool_slug TEXT,
  intent_slug TEXT,
  session_id TEXT,
  click_id INTEGER,
  conversion_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','paid','reversed')),
  attribution_status TEXT NOT NULL DEFAULT 'unattributed' CHECK(attribution_status IN ('unattributed','attributed','vendor_confirmed')),
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  commission REAL NOT NULL DEFAULT 0,
  period_start TEXT,
  period_end TEXT,
  confirmed_at TEXT,
  paid_at TEXT,
  source TEXT NOT NULL DEFAULT 'manual_import',
  evidence_ref TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_conversion
  ON revenue_ledger(affiliate_slug, conversion_id)
  WHERE conversion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_affiliate ON revenue_ledger(affiliate_slug);
CREATE INDEX IF NOT EXISTS idx_revenue_status ON revenue_ledger(status);
CREATE INDEX IF NOT EXISTS idx_revenue_attribution ON revenue_ledger(attribution_status);
CREATE INDEX IF NOT EXISTS idx_revenue_tool ON revenue_ledger(tool_slug);
CREATE INDEX IF NOT EXISTS idx_revenue_intent ON revenue_ledger(intent_slug);
CREATE INDEX IF NOT EXISTS idx_revenue_session ON revenue_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_revenue_period ON revenue_ledger(period_start, period_end);
