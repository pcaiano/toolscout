CREATE TABLE IF NOT EXISTS distribution_economic_learning (
  surface_slug TEXT PRIMARY KEY,
  baseline_score REAL NOT NULL DEFAULT 0,
  learned_score REAL NOT NULL DEFAULT 0,
  human_sessions_30d INTEGER NOT NULL DEFAULT 0,
  outbound_clicks_30d INTEGER NOT NULL DEFAULT 0,
  monetized_outbound_30d INTEGER NOT NULL DEFAULT 0,
  confirmed_revenue_30d REAL,
  currency TEXT,
  economic_boost REAL NOT NULL DEFAULT 0,
  last_observed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_economic_learning_score
  ON distribution_economic_learning(learned_score DESC, updated_at DESC);
