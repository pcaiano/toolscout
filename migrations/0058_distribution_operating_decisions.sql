ALTER TABLE distribution_economic_learning ADD COLUMN operating_decision TEXT NOT NULL DEFAULT 'explore';
ALTER TABLE distribution_economic_learning ADD COLUMN priority_weight REAL NOT NULL DEFAULT 0;
ALTER TABLE distribution_economic_learning ADD COLUMN decision_reason TEXT;
ALTER TABLE distribution_economic_learning ADD COLUMN chairman_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distribution_economic_learning ADD COLUMN decided_at TEXT;

CREATE INDEX IF NOT EXISTS idx_distribution_economic_learning_operating
  ON distribution_economic_learning(operating_decision, priority_weight DESC, updated_at DESC);
