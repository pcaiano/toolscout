export const AFFILIATE_STATES = Object.freeze([
  'research_required','no_program_found','program_exists','ready_to_apply',
  'human_action_required','submitted','pending_review','approved_needs_link',
  'link_acquired','active','verified','rejected','paused','blocked','earning'
]);

export const AFFILIATE_STATE_SET = new Set(AFFILIATE_STATES);
export const HUMAN_STATES = new Set(['ready_to_apply','human_action_required','approved_needs_link']);
export const MONETIZED_STATES = new Set(['active','verified','earning']);
export const TERMINAL_UNMONETIZABLE_STATES = new Set(['no_program_found','paused']);

const LEGACY_STATE = Object.freeze({
  no_program:'no_program_found', no_affiliate_program:'no_program_found',
  paused_for_new_affiliates:'paused', needs_info:'human_action_required',
  appeal_pending:'pending_review', blocked_pending_network_approval:'blocked'
});

export function normalizeAffiliateState(value) {
  const state = LEGACY_STATE[String(value || '')] || String(value || '');
  return AFFILIATE_STATE_SET.has(state) ? state : 'research_required';
}

export function nextActionFor(record) {
  const state = normalizeAffiliateState(record.status);
  if (record.next_action) return String(record.next_action);
  if (state === 'earning') return 'Monitor verified revenue and partner reporting';
  if (state === 'verified') return 'Monitor clicks, conversions and redirect health';
  if (state === 'active') return 'Verify /go redirect in production';
  if (state === 'link_acquired') return 'Activate affiliate URL in production';
  if (state === 'approved_needs_link') return 'Retrieve approved affiliate link';
  if (state === 'submitted' || state === 'pending_review') return 'Await existing application review';
  if (state === 'ready_to_apply') return `Apply${record.network ? ` via ${record.network}` : ''}`;
  if (state === 'human_action_required') return 'Human review required';
  if (state === 'program_exists') return record.blocker ? 'Resolve eligibility or network blocker' : 'Confirm application eligibility';
  if (state === 'blocked') return record.blocker || 'Await network unlock';
  if (state === 'rejected') return record.blocker || 'No action until reapplication criteria are met';
  if (state === 'paused') return 'No application while programme is paused';
  if (state === 'no_program_found') return 'No affiliate programme currently available';
  return 'Investigate official direct affiliate programme';
}

export function isDuplicateApplication(record) {
  return Boolean(record.submitted_at || record.application_evidence || ['submitted','pending_review','approved_needs_link','link_acquired','active','verified','earning'].includes(normalizeAffiliateState(record.status)));
}

export function safeHumanAction(record) {
  if (!HUMAN_STATES.has(normalizeAffiliateState(record.status))) return null;
  if (isDuplicateApplication(record) && normalizeAffiliateState(record.status) === 'ready_to_apply') {
    return { ...record, action:'Review / await existing application', duplicate_prevented:true };
  }
  return {
    tool_slug:record.slug, tool:record.name, network:record.network || 'Unknown',
    action:nextActionFor(record), url:record.application_url || record.program_url || null,
    reason:record.human_reason || 'Authentication, terms, declarations or manual review require the owner.',
    suggested_answers:record.form_guidance || null, status:normalizeAffiliateState(record.status),
    last_checked:record.last_verified || record.updated_at || null, duplicate_prevented:false
  };
}

export function coverageMetrics(records, clickRows=[]) {
  const monetized = records.filter(r => MONETIZED_STATES.has(normalizeAffiliateState(r.status)));
  const eligible = records.filter(r => !TERMINAL_UNMONETIZABLE_STATES.has(normalizeAffiliateState(r.status)));
  const validClicks = clickRows.filter(r => !['internal-test','synthetic','health-check','ci'].includes(String(r.source || '').toLowerCase()) && !['owner','synthetic/test','known-bot/crawler','unknown/legacy'].includes(String(r.classification || '').toLowerCase()));
  const totalClicks = validClicks.reduce((n,r)=>n+Number(r.clicks || 0),0);
  const monetizedClicks = validClicks.filter(r=>Number(r.affiliate_active_at_click)===1).reduce((n,r)=>n+Number(r.clicks || 0),0);
  return {
    total_catalog:records.length, active_tools:monetized.length, monetizable_tools:eligible.length,
    monetization_coverage:eligible.length ? monetized.length / eligible.length : null,
    catalog_coverage:records.length ? monetized.length / records.length : null,
    eligible_outbound_clicks:totalClicks, monetized_eligible_outbound_clicks:monetizedClicks,
    weighted_monetization_coverage:totalClicks ? monetizedClicks / totalClicks : null,
    weighted_coverage_status:totalClicks ? 'measured' : 'insufficient_verified_click_data'
  };
}

export function networkCoverage(records, registry=[]) {
  return registry.map(network => {
    const rows=records.filter(r=>String(r.network||'').toLowerCase()===String(network.name).toLowerCase());
    const count=s=>rows.filter(r=>s.includes(normalizeAffiliateState(r.status))).length;
    return {...network,catalog_matches:rows.length,active:count(['active','verified','earning']),submitted:count(['submitted','pending_review']),ready:count(['ready_to_apply']),blocked:count(['blocked'])};
  });
}

export function opportunityScore(record) {
  if (MONETIZED_STATES.has(normalizeAffiliateState(record.status))) return 0;
  const demand=Math.min(30, Number(record.outbound_clicks_30d || 0) * 3);
  const exposure=Math.min(20, Number(record.page_exposure || 0) * 2);
  const gap=['research_required','program_exists','ready_to_apply','human_action_required','blocked'].includes(normalizeAffiliateState(record.status)) ? 20 : 5;
  const approval=Math.max(0,Math.min(15,Number(record.approval_probability || 0.5)*15));
  const commission=Math.max(0,Math.min(10,Number(record.commission_score || 5)));
  const friction=Math.max(0,Math.min(10,Number(record.network_friction || 5)));
  const unlock=record.strategic_unlock ? 15 : 0;
  return Math.round((demand+exposure+gap+approval+commission+unlock-friction)*10)/10;
}

export function reconcileAffiliateReply(message, canonicalSlugs) {
  const slug=String(message.tool_slug||'').toLowerCase();
  if (!canonicalSlugs.has(slug)) return {accepted:false,reason:'tool_outside_canonical_catalog'};
  const decision=String(message.decision||'').toLowerCase();
  const affiliateUrl=String(message.affiliate_url||'').trim();
  if (affiliateUrl) { try { const u=new URL(affiliateUrl); if (!['http:','https:'].includes(u.protocol)) throw Error(); } catch { return {accepted:false,reason:'invalid_affiliate_url'}; } }
  const status=decision==='approved'?(affiliateUrl?'link_acquired':'approved_needs_link'):
    decision==='rejected'?'rejected':decision==='needs_info'?'human_action_required':null;
  if (!status) return {accepted:false,reason:'ambiguous_decision'};
  return {accepted:true,tool_slug:slug,status,affiliate_url:affiliateUrl||null,actor_source:'gmail_affiliate_reply_watch',evidence:[{source:'Gmail',message_id:String(message.message_id||''),received_at:String(message.received_at||'')}],notes:String(message.notes||'').slice(0,4000)};
}
