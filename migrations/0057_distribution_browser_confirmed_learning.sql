ALTER TABLE distribution_economic_learning ADD COLUMN browser_confirmed_sessions_30d INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distribution_economic_learning ADD COLUMN session_to_outbound_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE distribution_economic_learning ADD COLUMN monetization_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE distribution_economic_learning ADD COLUMN evidence_grade TEXT NOT NULL DEFAULT 'none';
ALTER TABLE distribution_economic_learning ADD COLUMN paid_policy_decision TEXT NOT NULL DEFAULT 'free_default';
ALTER TABLE distribution_economic_learning ADD COLUMN observed_cost REAL;
ALTER TABLE distribution_economic_learning ADD COLUMN observed_cost_currency TEXT;
ALTER TABLE distribution_economic_learning ADD COLUMN observed_roi REAL;

CREATE TABLE IF NOT EXISTS distribution_surface_costs (
  surface_slug TEXT PRIMARY KEY,
  cost_amount REAL NOT NULL CHECK(cost_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  cost_type TEXT NOT NULL DEFAULT 'one_time',
  evidence_source TEXT,
  incurred_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO distribution_surface_costs(surface_slug,cost_amount,currency,cost_type,evidence_source,incurred_at,created_at,updated_at)
VALUES('uneed',14.99,'USD','one_time','User-confirmed Uneed Fast-track acquisition experiment','2026-09-08',datetime('now'),datetime('now'))
ON CONFLICT(surface_slug) DO UPDATE SET
  cost_amount=excluded.cost_amount,
  currency=excluded.currency,
  cost_type=excluded.cost_type,
  evidence_source=excluded.evidence_source,
  incurred_at=excluded.incurred_at,
  updated_at=datetime('now');

CREATE INDEX IF NOT EXISTS idx_distribution_economic_learning_evidence
  ON distribution_economic_learning(evidence_grade, learned_score DESC);
