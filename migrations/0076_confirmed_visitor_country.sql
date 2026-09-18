CREATE TABLE IF NOT EXISTS confirmed_visitor_countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(visitor_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_created_at
  ON confirmed_visitor_countries(created_at);

CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_country
  ON confirmed_visitor_countries(country);

INSERT OR IGNORE INTO confirmed_visitor_countries (visitor_id, session_id, country, created_at)
SELECT v.visitor_id,
       v.session_id,
       UPPER(g.country),
       v.created_at
FROM confirmed_visitor_events v
JOIN traffic_guard_events g
  ON g.session_id = v.session_id
WHERE g.decision = 'allowed'
  AND g.country IS NOT NULL
  AND LENGTH(TRIM(g.country)) = 2
  AND g.id = (
    SELECT MIN(g2.id)
    FROM traffic_guard_events g2
    WHERE g2.session_id = v.session_id
      AND g2.decision = 'allowed'
      AND g2.country IS NOT NULL
      AND LENGTH(TRIM(g2.country)) = 2
  );

INSERT OR IGNORE INTO traffic_integrity_meta (key, value)
SELECT 'country_tracking_started_at',
       COALESCE(MIN(created_at), datetime('now'))
FROM confirmed_visitor_countries;
