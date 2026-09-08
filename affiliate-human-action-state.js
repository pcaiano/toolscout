import { normalizeAffiliateState } from './affiliate-operations.js';

const EVENT_STATE=Object.freeze({
  contacted:'pending_review',
  submitted:'submitted',
  rejected:'rejected',
  needs_info:'human_action_required',
  approved_needs_link:'approved_needs_link'
});

function clean(value,max=2000){return String(value||'').trim().slice(0,max)}

export async function recordAffiliateHumanAction(env,input={}){
  const toolSlug=clean(input.tool_slug,120).toLowerCase();
  const event=clean(input.event,64).toLowerCase();
  const targetState=EVENT_STATE[event];
  if(!toolSlug)return {ok:false,error:'tool_slug_required'};
  if(!targetState)return {ok:false,error:'unsupported_event'};
  const existing=await env.DB.prepare('SELECT tool_slug,status,submitted_at,response_at,notes FROM affiliate_workflow WHERE tool_slug=?').bind(toolSlug).first();
  if(!existing)return {ok:false,error:'unknown_affiliate_workflow_tool'};
  const current=normalizeAffiliateState(existing.status);
  if(['active','verified','earning'].includes(current)&&!['rejected'].includes(targetState))return {ok:false,error:'cannot_downgrade_active_affiliate'};
  const now=new Date().toISOString();
  const note=clean(input.note,2000);
  const evidence=clean(input.evidence,1000) || `Owner confirmed human affiliate action: ${event}`;
  const submittedAt=event==='submitted'?(existing.submitted_at||now):existing.submitted_at;
  const responseAt=['rejected','needs_info','approved_needs_link'].includes(event)?(existing.response_at||now):existing.response_at;
  const mergedNotes=[existing.notes,evidence,note].filter(Boolean).join(' | ').slice(0,4000);
  await env.DB.prepare(`UPDATE affiliate_workflow SET status=?,submitted_at=?,response_at=?,notes=?,source_actor='command_center_human_action',updated_at=datetime('now') WHERE tool_slug=?`).bind(targetState,submittedAt,responseAt,mergedNotes,toolSlug).run();
  return {ok:true,tool_slug:toolSlug,event,status:targetState,recorded_at:now};
}
