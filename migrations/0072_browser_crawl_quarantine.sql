-- Quarantine the 2026-09-16 browser-automation burst without deleting raw evidence.
-- A session is quarantined only when its page confirmation landed in a minute
-- with at least five canonical sessions and the session had no meaningful
-- engagement beyond session_started/page_confirmed.

CREATE TABLE IF NOT EXISTS traffic_quarantine_sessions (
  session_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  original_classification TEXT,
  first_confirmed_at TEXT,
  quarantined_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_traffic_quarantine_reason
  ON traffic_quarantine_sessions(reason, quarantined_at);

CREATE TABLE IF NOT EXISTS traffic_guard_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  ua_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT,
  country TEXT,
  asn INTEGER,
  suspicious_direct INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_traffic_guard_created
  ON traffic_guard_events(created_at);
CREATE INDEX IF NOT EXISTS idx_traffic_guard_fingerprint_created
  ON traffic_guard_events(fingerprint, created_at);
CREATE INDEX IF NOT EXISTS idx_traffic_guard_decision_created
  ON traffic_guard_events(decision, created_at);

INSERT OR IGNORE INTO traffic_quarantine_sessions
  (session_id, reason, original_classification, first_confirmed_at, quarantined_at)
WITH burst_minutes AS (
  SELECT substr(f.created_at,1,16) AS minute_utc
  FROM funnel_events f
  JOIN sessions s ON s.session_id=f.session_id
  WHERE f.event_type='page_confirmed'
    AND f.created_at >= '2026-09-16 19:45:00'
    AND s.classification IN ('likely-human','human')
  GROUP BY substr(f.created_at,1,16)
  HAVING COUNT(DISTINCT f.session_id) >= 5
), candidates AS (
  SELECT f.session_id, MIN(f.created_at) AS first_confirmed_at
  FROM funnel_events f
  JOIN sessions s ON s.session_id=f.session_id
  JOIN burst_minutes b ON b.minute_utc=substr(f.created_at,1,16)
  WHERE f.event_type='page_confirmed'
    AND f.created_at >= '2026-09-16 19:45:00'
    AND s.classification IN ('likely-human','human')
    AND NOT EXISTS (
      SELECT 1
      FROM funnel_events e
      WHERE e.session_id=f.session_id
        AND e.event_type NOT IN ('session_started','page_confirmed')
    )
  GROUP BY f.session_id
)
SELECT c.session_id,
       'high-rate multi-page browser crawl 2026-09-16',
       s.classification,
       c.first_confirmed_at,
       datetime('now')
FROM candidates c
JOIN sessions s ON s.session_id=c.session_id;

UPDATE sessions
SET classification='synthetic/test', owner_flag=0
WHERE session_id IN (
  SELECT session_id
  FROM traffic_quarantine_sessions
  WHERE reason='high-rate multi-page browser crawl 2026-09-16'
);

DELETE FROM confirmed_visitor_events
WHERE session_id IN (
  SELECT session_id
  FROM traffic_quarantine_sessions
  WHERE reason='high-rate multi-page browser crawl 2026-09-16'
);

INSERT OR REPLACE INTO traffic_integrity_meta(key,value)
VALUES ('crawl_quarantine_2026_09_16_applied_at', datetime('now'));
