-- ToolScout 2.0: external-value-first acquisition model.
-- Preserve all existing placement, backlink, submission and public URL state.
-- These columns control future acquisition spend only.

ALTER TABLE distribution_opportunities ADD COLUMN external_value_score REAL;
ALTER TABLE distribution_opportunities ADD COLUMN external_value_tier TEXT;
ALTER TABLE distribution_opportunities ADD COLUMN external_value_reason TEXT;
ALTER TABLE distribution_opportunities ADD COLUMN value_model_version INTEGER NOT NULL DEFAULT 2;

UPDATE distribution_opportunities
SET external_value_score = MAX(0,MIN(100,
      audience_fit*0.27+
      authority*0.23+
      traffic_potential*0.25+
      backlink_value*0.15+
      acceptance_probability*0.10-
      MIN(12,effort_cost*0.12)
    )),
    external_value_tier = CASE
      WHEN MAX(0,MIN(100,
        audience_fit*0.27+authority*0.23+traffic_potential*0.25+backlink_value*0.15+acceptance_probability*0.10-MIN(12,effort_cost*0.12)
      )) >= 70 THEN 'high'
      WHEN MAX(0,MIN(100,
        audience_fit*0.27+authority*0.23+traffic_potential*0.25+backlink_value*0.15+acceptance_probability*0.10-MIN(12,effort_cost*0.12)
      )) >= 45 THEN 'medium'
      ELSE 'low'
    END,
    external_value_reason = 'ToolScout 2.0 initial structural value seed; runtime learning adds verified human/commercial proof.',
    value_model_version = 2
WHERE external_value_score IS NULL;

CREATE INDEX IF NOT EXISTS idx_distribution_external_value
  ON distribution_opportunities(external_value_tier,external_value_score DESC,status);
