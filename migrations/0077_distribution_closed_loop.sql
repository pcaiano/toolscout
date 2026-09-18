-- Distribution Engine closed-loop execution and footprint verification.
CREATE TABLE IF NOT EXISTS distribution_placements (
  surface_slug TEXT PRIMARY KEY,
  public_url TEXT NOT NULL,
  placement_verified INTEGER NOT NULL DEFAULT 0,
  backlink_verified INTEGER NOT NULL DEFAULT 0,
  link_rel TEXT,
  first_verified_at TEXT,
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_placements_backlink
  ON distribution_placements(backlink_verified, updated_at DESC);

-- Old editorial/community drafts were incorrectly treated as Chairman work.
UPDATE distribution_editorial_queue
SET status='autonomy_pending',
    human_required=0,
    updated_at=datetime('now')
WHERE human_required=1
  AND status='prepared'
  AND channel_type IN ('community','community_stack');

-- Original research assets stay inside autonomous route research.
UPDATE distribution_submissions
SET status='research_required',
    human_required=0,
    error=NULL,
    updated_at=datetime('now')
WHERE status='human_required'
  AND submission_type='research_asset';

-- Reverse the old fallback that escalated any non-machine-readable form.
UPDATE distribution_opportunities
SET status='research_required',
    human_required=0,
    next_action='Autonomous route research resumed. Chairman escalation is reserved for genuine human-only gates.',
    updated_at=datetime('now')
WHERE status='human_action_required'
  AND next_action LIKE 'Submission route detected but no safely verifiable machine-readable%';
