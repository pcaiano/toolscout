import fs from 'node:fs';

// Operational records only: never modifies tools.json, rankings or live routing.
const read = (p, fallback) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const tools = read('data/tools.json', []);
const pipeline = read('data/affiliate-pipeline.json', {});
const routing = read('data/affiliate.json', {});
const previous = read('data/affiliate-coverage.json', { records: [] });
const prior = new Map(previous.records.map(r => [r.tool_slug, r]));
const programs = new Map((pipeline.verified_programs || []).map(p => [p.slug, p]));
const now = new Date().toISOString();
const accepted = new Set(['ACTIVE','APPROVED_NOT_DEPLOYED','APPLIED','APPLICATION_IN_PROGRESS','CONTACTED','PROGRAM_FOUND_NOT_YET_ELIGIBLE','PROGRAM_PAUSED_OR_CLOSED','NO_AFFILIATE_PROGRAM','UNSUITABLE','HUMAN_ACTION_REQUIRED']);
const records = tools.map(t => {
  const old = prior.get(t.slug);
  if (old) return { ...old, tool_name: t.name, catalog_status: 'in_catalog' };
  const p = programs.get(t.slug) || {};
  return {
    tool_slug: t.slug, tool_name: t.name, canonical_domain: new URL(t.sourceUrl).hostname.replace(/^www\./, ''), catalog_status: 'in_catalog',
    affiliate_program_exists: null, program_type: null, network: p.network || null,
    official_program_url: p.source || null, application_url: p.application_url || null,
    affiliate_status: null, workflow_stage: 'reconciliation_required',
    applied_at: null, contacted_at: null, last_checked_at: null,
    next_action: 'Reconcile existing evidence, then verify official program and execute authorized application.',
    human_action_required: false, human_action_reason: null,
    affiliate_link: routing[t.slug]?.enabled ? routing[t.slug].url : null,
    affiliate_link_verified_at: null, commission_summary: p.commission_note || null,
    cookie_window: null, eligibility_notes: null, rejection_reason: null,
    evidence: [], notes: [], legacy: { pipeline: p, routing: routing[t.slug] || null },
    created_at: now, review_due_at: now
  };
});
const classified = records.filter(r => accepted.has(r.affiliate_status) && r.evidence.length && r.last_checked_at);
const uncontacted = records.filter(r => r.eligibility_confirmed === true && !r.applied_at && !r.application_submission_confirmed && !r.contacted_at && !['ACTIVE','APPROVED_NOT_DEPLOYED','APPLIED','CONTACTED'].includes(r.affiliate_status));
const metrics = {
  total_catalog: tools.length, classified: classified.length,
  affiliate_status_coverage: tools.length ? classified.length / tools.length : 0,
  unresolved_records: records.length - classified.length,
  programs_found: records.filter(r => r.affiliate_program_exists === true).length,
  active: records.filter(r => r.affiliate_status === 'ACTIVE').length,
  eligible_programs_not_contacted: uncontacted.length,
  eligible_programs_not_contacted_is_lower_bound: records.some(r => !accepted.has(r.affiliate_status)),
  eligibility_unresolved: records.filter(r => !accepted.has(r.affiliate_status) || (r.affiliate_program_exists === true && r.eligibility_confirmed == null && !['ACTIVE','APPLIED','APPROVED_NOT_DEPLOYED','PROGRAM_PAUSED_OR_CLOSED','UNSUITABLE'].includes(r.affiliate_status))).length,
  sprint_complete: classified.length === tools.length && uncontacted.length === 0
};
write('data/affiliate-coverage.json', { schema_version: 1, generated_at: now, status: metrics.sprint_complete ? 'complete' : 'in_progress', metrics, records });
write('reports/affiliate-human-actions.json', records.filter(r => r.human_action_required).map(r => ({ tool:r.tool_name,status:r.affiliate_status,what_has_already_been_done:r.completed_work,exact_human_action_required:r.human_action_reason,direct_page:r.application_url,estimated_human_time:r.estimated_human_time,resume:r.resume })));
write('reports/affiliate-agent-queue.json', records.filter(r => !r.human_action_required && (!accepted.has(r.affiliate_status) || (r.review_due_at && r.review_due_at <= now))).map(r => ({tool_slug:r.tool_slug,next_action:r.next_action,review_due_at:r.review_due_at})));
console.log(JSON.stringify(metrics));
