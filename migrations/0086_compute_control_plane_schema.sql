-- ToolScout 2.0: move compute/control-plane schema creation out of request runtime.
-- Safe on existing production D1: CREATE IF NOT EXISTS and INSERT OR IGNORE only.

CREATE TABLE IF NOT EXISTS compute_overflow_jobs(
  job_id TEXT PRIMARY KEY,
  job_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL,
  subject_type TEXT,
  subject_key TEXT,
  priority_score REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  batch_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT (datetime('now')),
  leased_at TEXT,
  completed_at TEXT,
  result_json TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_status_priority ON compute_overflow_jobs(status,priority_score DESC,available_at);
CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_batch ON compute_overflow_jobs(batch_id,status);
CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_subject_type_created ON compute_overflow_jobs(subject_key,job_type,created_at);
CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_type_status_completed ON compute_overflow_jobs(job_type,status,completed_at);

CREATE TABLE IF NOT EXISTS compute_overflow_batches(
  batch_id TEXT PRIMARY KEY,
  completion_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'dispatched',
  job_count INTEGER NOT NULL DEFAULT 0,
  trigger_http_status INTEGER,
  fetched_at TEXT,
  dispatched_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  result_summary_json TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compute_overflow_batches_status ON compute_overflow_batches(status,dispatched_at);

CREATE TABLE IF NOT EXISTS compute_overflow_locks(
  lock_name TEXT PRIMARY KEY,
  lease_until TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compute_overflow_events(
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT,
  job_id TEXT,
  batch_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compute_overflow_metrics(
  id TEXT PRIMARY KEY,
  metric_day TEXT NOT NULL DEFAULT (date('now')),
  queued INTEGER NOT NULL DEFAULT 0,
  leased INTEGER NOT NULL DEFAULT 0,
  completed_today INTEGER NOT NULL DEFAULT 0,
  failed_today INTEGER NOT NULL DEFAULT 0,
  created_today INTEGER NOT NULL DEFAULT 0,
  active_batches INTEGER NOT NULL DEFAULT 0,
  completed_batches_today INTEGER NOT NULL DEFAULT 0,
  last_dispatched_at TEXT,
  last_completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO compute_overflow_metrics(id,metric_day) VALUES('global',date('now'));

CREATE TABLE IF NOT EXISTS compute_overflow_funnel_metrics(
  id TEXT PRIMARY KEY,
  metric_day TEXT NOT NULL DEFAULT (date('now')),
  bootstrapped INTEGER NOT NULL DEFAULT 0,
  research_completed_today INTEGER NOT NULL DEFAULT 0,
  classified_research_jobs_today INTEGER NOT NULL DEFAULT 0,
  submission_routes_found_today INTEGER NOT NULL DEFAULT 0,
  machine_candidates_found_today INTEGER NOT NULL DEFAULT 0,
  form_routes_seen_today INTEGER NOT NULL DEFAULT 0,
  auth_routes_seen_today INTEGER NOT NULL DEFAULT 0,
  captcha_routes_seen_today INTEGER NOT NULL DEFAULT 0,
  policy_blockers_seen_today INTEGER NOT NULL DEFAULT 0,
  actions_authorized_today INTEGER NOT NULL DEFAULT 0,
  actions_completed_today INTEGER NOT NULL DEFAULT 0,
  submissions_accepted_today INTEGER NOT NULL DEFAULT 0,
  placements_verified_today INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO compute_overflow_funnel_metrics(id,metric_day) VALUES('global',date('now'));

CREATE TABLE IF NOT EXISTS compute_overflow_budget(
  kind TEXT PRIMARY KEY,
  metric_day TEXT NOT NULL DEFAULT (date('now')),
  used_today INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO compute_overflow_budget(kind,metric_day,used_today) VALUES('research',date('now'),0);
INSERT OR IGNORE INTO compute_overflow_budget(kind,metric_day,used_today) VALUES('execution',date('now'),0);

CREATE TABLE IF NOT EXISTS contact_supply_domain(
  domain TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_key TEXT,
  source_name TEXT,
  source_url TEXT,
  priority_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  contact_email TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_source TEXT,
  contact_source_url TEXT,
  route_type TEXT,
  route_url TEXT,
  provider TEXT,
  provider_person_id TEXT,
  public_attempts INTEGER NOT NULL DEFAULT 0,
  apollo_status TEXT NOT NULL DEFAULT 'plan_blocked',
  next_research_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_researched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contact_supply_status_priority ON contact_supply_domain(status,priority_score DESC,next_research_at);
CREATE INDEX IF NOT EXISTS idx_contact_supply_email ON contact_supply_domain(contact_email,status);

CREATE TABLE IF NOT EXISTS contact_supply_metrics(
  id TEXT PRIMARY KEY,
  target_ready INTEGER NOT NULL DEFAULT 200,
  min_ready INTEGER NOT NULL DEFAULT 150,
  catalog_domains INTEGER NOT NULL DEFAULT 0,
  network_domains INTEGER NOT NULL DEFAULT 0,
  vendor_domains INTEGER NOT NULL DEFAULT 0,
  ready_email INTEGER NOT NULL DEFAULT 0,
  ready_route INTEGER NOT NULL DEFAULT 0,
  cooldown INTEGER NOT NULL DEFAULT 0,
  researching INTEGER NOT NULL DEFAULT 0,
  unresolved INTEGER NOT NULL DEFAULT 0,
  apollo_eligible INTEGER NOT NULL DEFAULT 0,
  apollo_status TEXT NOT NULL DEFAULT 'plan_blocked_people_api',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO contact_supply_metrics(id,target_ready,min_ready) VALUES('global',200,150);

CREATE TABLE IF NOT EXISTS auth_automation_capability(
  surface_slug TEXT PRIMARY KEY,
  automation_class TEXT NOT NULL,
  credential_kind TEXT,
  credential_header TEXT,
  credential_prefix TEXT,
  credential_state TEXT NOT NULL DEFAULT 'not_required',
  human_bootstrap_required INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_opportunities_overflow ON distribution_opportunities(human_required,status,distribution_score DESC,updated_at);
CREATE INDEX IF NOT EXISTS idx_distribution_submissions_lookup ON distribution_submissions(surface_slug,submission_type,asset_url,status);
CREATE INDEX IF NOT EXISTS idx_distribution_submissions_verify ON distribution_submissions(submission_type,status,submitted_at);
CREATE INDEX IF NOT EXISTS idx_distribution_auto_adapters_policy ON distribution_auto_adapters(policy_state,confidence,surface_slug);
CREATE INDEX IF NOT EXISTS idx_distribution_qualification_created_result ON distribution_qualification_events(created_at,result);
CREATE INDEX IF NOT EXISTS idx_vendor_amplification_domain_status ON distribution_vendor_amplification(vendor_domain,status);
CREATE INDEX IF NOT EXISTS idx_network_outreach_domain_status ON distribution_network_outreach(domain,status);
