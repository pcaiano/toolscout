ALTER TABLE sessions ADD COLUMN classification TEXT NOT NULL DEFAULT 'unknown/legacy'
  CHECK (classification IN ('likely-human','known-bot/crawler','synthetic/test','owner','unknown/legacy'));

-- owner_flag is explicit prior evidence; all other historical rows stay unknown/legacy.
UPDATE sessions SET classification = 'owner' WHERE owner_flag = 1;

CREATE INDEX IF NOT EXISTS idx_sessions_classification ON sessions(classification);
CREATE INDEX IF NOT EXISTS idx_sessions_classification_first_seen ON sessions(classification, first_seen_at);
