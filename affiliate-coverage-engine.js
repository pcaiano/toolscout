import { normalizeAffiliateState, MONETIZED_STATES, TERMINAL_UNMONETIZABLE_STATES } from './affiliate-operations.js';

const HUMAN_CLASSIFICATIONS = new Set(['likely-human','human']);
const EXCLUDED_SOURCES = new Set(['internal-test','synthetic','health-check','ci']);

export function leakageScore(record) {
  if (MONETIZED_STATES.has(normalizeAffiliateState(record.status))) return 0;
  const clicks = Math.max(0, Number(record.unmonetized_clicks_30d || 0));
  const demand = Math.min(50, clicks * 4);
  const approval = Math.max(0, Math.min(20, Number(record.approval_probability ?? 0.5) * 20));
  const economics = Math.max(0, Math.min(20, Number(record.commission_score ?? 5) * 2));
  const friction = Math.max(0, Math.min(15, Number(record.network_friction ?? 5)));
  const unlock = record.strategic_unlock ? 15 : 0;
  return Math.round((demand + approval + economics + unlock - friction) * 10) / 10;
}

export function coverageEngineSnapshot(records, clickRows = []) {
  const valid = clickRows.filter(r => {
    const source = String(r.source || '').toLowerCase();
    const classification = String(r.classification || '').toLowerCase();
    return !EXCLUDED_SOURCES.has(source) && (HUMAN_CLASSIFICATIONS.has(classification) || (!classification.includes('bot') && !classification.includes('synthetic') && classification !== 'owner' && classification !== 'unknown/legacy'));
  });
  const total = valid.reduce((n,r)=>n+Number(r.clicks||0),0);
  const monetized = valid.filter(r=>Number(r.affiliate_active_at_click)===1).reduce((n,r)=>n+Number(r.clicks||0),0);
  const unmonetized = Math.max(0,total-monetized);
  const byTool = new Map();
  for (const row of valid) {
    const slug=String(row.tool_slug||''); if(!slug) continue;
    const item=byTool.get(slug)||{outbound:0,monetized:0};
    item.outbound+=Number(row.clicks||0);
    if(Number(row.affiliate_active_at_click)===1)item.monetized+=Number(row.clicks||0);
    byTool.set(slug,item);
  }
  const queue=records.map(r=>{
    const clicks=byTool.get(r.slug)||{outbound:0,monetized:0};
    const item={...r,outbound_clicks_30d:clicks.outbound,monetized_clicks_30d:clicks.monetized,unmonetized_clicks_30d:Math.max(0,clicks.outbound-clicks.monetized)};
    item.leakage_score=leakageScore(item);
    return item;
  }).filter(r=>!MONETIZED_STATES.has(normalizeAffiliateState(r.status)) && !TERMINAL_UNMONETIZABLE_STATES.has(normalizeAffiliateState(r.status))).sort((a,b)=>b.leakage_score-a.leakage_score||b.unmonetized_clicks_30d-a.unmonetized_clicks_30d);
  return {window_days:30,human_outbound_clicks:total,monetized_human_outbound_clicks:monetized,unmonetized_human_outbound_clicks:unmonetized,weighted_coverage:total?monetized/total:null,recoverable_queue:queue.slice(0,25)};
}

export function automationBoundary(record) {
  const status=normalizeAffiliateState(record.status);
  if (['submitted','pending_review'].includes(status)) return {mode:'monitor',reason:'existing_application'};
  if (['approved_needs_link','human_action_required','ready_to_apply'].includes(status)) return {mode:'human',reason:'authentication_terms_captcha_or_owner_declaration'};
  if (status==='blocked') return {mode:'blocked',reason:record.blocker||'network_or_eligibility_blocker'};
  if (status==='research_required'||status==='program_exists') return {mode:'research',reason:'public_program_discovery_and_qualification'};
  if (status==='link_acquired') return {mode:'activate',reason:'validated_affiliate_link_ready'};
  return {mode:'monitor',reason:'no_unsafe_automatic_action'};
}
