-- ToolScout 2.0: move SEO runtime state schema out of request execution.

CREATE TABLE IF NOT EXISTS seo_runtime_state(
  pathname TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  source_generated_at TEXT,
  first_activated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  indexnow_queued_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seo_runtime_active
  ON seo_runtime_state(active,updated_at DESC);
