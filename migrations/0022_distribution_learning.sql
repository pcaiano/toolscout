ALTER TABLE distribution_opportunities ADD COLUMN observed_human_sessions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distribution_opportunities ADD COLUMN observed_outbound_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE distribution_opportunities ADD COLUMN observed_revenue REAL NOT NULL DEFAULT 0;
ALTER TABLE distribution_opportunities ADD COLUMN performance_score REAL NOT NULL DEFAULT 0;
ALTER TABLE distribution_opportunities ADD COLUMN learned_at TEXT;

CREATE INDEX IF NOT EXISTS idx_distribution_opportunities_performance ON distribution_opportunities(performance_score DESC);
