CREATE TABLE IF NOT EXISTS agent_protocol_events (
  event_id TEXT PRIMARY KEY,
  protocol TEXT NOT NULL CHECK (protocol IN ('mcp','a2a')),
  operation TEXT NOT NULL,
  client_name TEXT,
  client_version TEXT,
  success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0,1)),
  result_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_protocol_events_protocol_created
  ON agent_protocol_events(protocol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_protocol_events_operation_created
  ON agent_protocol_events(operation, created_at DESC);
