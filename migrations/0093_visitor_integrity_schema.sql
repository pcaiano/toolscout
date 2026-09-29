-- ToolScout 2.0 Phase 17
-- Visitor identity schema, one-session-one-visitor cleanup and registry backfill
-- are migration-owned. Runtime requests only probe readiness after this point.

CREATE TABLE IF NOT EXISTS confirmed_visitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  referrer_host TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(visitor_id,session_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_created_at
  ON confirmed_visitor_events(created_at);
CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_visitor_id
  ON confirmed_visitor_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_session_id
  ON confirmed_visitor_events(session_id);
CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_created_session_visitor
  ON confirmed_visitor_events(created_at,session_id,visitor_id);

CREATE TABLE IF NOT EXISTS confirmed_visitor_countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(visitor_id,session_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_created_at
  ON confirmed_visitor_countries(created_at);
CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_country
  ON confirmed_visitor_countries(country);
CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_session_country
  ON confirmed_visitor_countries(session_id,country);

CREATE TABLE IF NOT EXISTS traffic_integrity_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS confirmed_visitor_registry (
  visitor_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_registry_last_seen
  ON confirmed_visitor_registry(last_seen_at);

INSERT OR IGNORE INTO traffic_integrity_meta(key,value)
VALUES('visitor_guard_linking_started_at',datetime('now'));

INSERT INTO traffic_integrity_meta(key,value)
VALUES('session_identity_rule','one_session_one_visitor_first_valid_link_wins')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;

-- Preserve the legacy repair rule exactly: one session belongs to the earliest
-- valid visitor link, and country links must match that canonical identity.
DELETE FROM confirmed_visitor_countries
WHERE NOT EXISTS (
  SELECT 1 FROM traffic_integrity_meta
  WHERE key='session_identity_cleanup_v1'
)
AND NOT EXISTS (
  SELECT 1
  FROM confirmed_visitor_events e
  WHERE e.session_id=confirmed_visitor_countries.session_id
    AND e.visitor_id=confirmed_visitor_countries.visitor_id
    AND e.id=(
      SELECT MIN(e2.id)
      FROM confirmed_visitor_events e2
      WHERE e2.session_id=e.session_id
    )
);

DELETE FROM confirmed_visitor_events
WHERE NOT EXISTS (
  SELECT 1 FROM traffic_integrity_meta
  WHERE key='session_identity_cleanup_v1'
)
AND id NOT IN (
  SELECT MIN(id)
  FROM confirmed_visitor_events
  GROUP BY session_id
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmed_visitor_events_session_id
  ON confirmed_visitor_events(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmed_visitor_countries_session_id
  ON confirmed_visitor_countries(session_id);

INSERT OR IGNORE INTO traffic_integrity_meta(key,value)
VALUES('session_identity_cleanup_v1',datetime('now'));

INSERT OR IGNORE INTO confirmed_visitor_registry(visitor_id,first_seen_at,last_seen_at)
SELECT visitor_id,MIN(created_at),MAX(created_at)
FROM confirmed_visitor_events
WHERE NOT EXISTS (
  SELECT 1 FROM traffic_integrity_meta
  WHERE key='visitor_registry_backfilled_at'
)
GROUP BY visitor_id;

INSERT OR IGNORE INTO traffic_integrity_meta(key,value)
VALUES('visitor_registry_backfilled_at',datetime('now'));
