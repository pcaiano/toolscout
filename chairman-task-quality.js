// One quality contract shared by producers and both Command Center queue readers.
export const CHAIRMAN_QUALITY_VERSION='chairman-quality-v1';
const generic=/(Human Gate Contract .* opened|complete the exact external step from Chairman Queue|such as|as required|human action required$|Open the (?:target community|community destination|exact action page))/i;
export function actionUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!/(?:^|\/)(?:api|openapi|swagger|mcp)(?:\/|$)|\.(?:json|yaml|yml)$/i.test(u.pathname)?u.href:null}catch{return null}
}
export function taskQualityIssues(task,now=Date.now()){
  const issues=[];
  if(!actionUrl(task.action_url))issues.push('missing_or_machine_action_url');
  const instructions=String(task.instructions||'').trim(),reason=String(task.why_human||task.reason||'').trim();
  if(instructions.length<35||generic.test(instructions))issues.push('missing_exact_instructions');
  if(reason.length<20||generic.test(reason)||reason===instructions)issues.push('missing_distinct_human_reason');
  if(!task.prepared_body&&!task.application_pack)issues.push('missing_prepared_content');
  if(!task.after_action)issues.push('missing_machine_followup');
  if(!(Number(task.estimated_minutes)>0)||!task.expected_impact)issues.push('missing_effort_or_impact');
  if(task.gate_key){
    const evidence=task.gate_evidence||{};
    const age=now-Date.parse(evidence.checked_at||'');
    if(evidence.url!==task.action_url||!evidence.detail||!Number.isFinite(age)||age<0||age>7*86400000)issues.push('missing_or_stale_gate_evidence');
  }
  return issues;
}
export function partitionChairmanTasks(items,now=Date.now()){
  const accepted=[],held=[],seen=new Set();
  for(const item of items){
    const issues=taskQualityIssues(item,now);
    const key=item.gate_key||`${item.engine}:${item.id}`;
    if(seen.has(key))continue;
    seen.add(key);
    if(issues.length)held.push({engine:item.engine,id:item.id,issues,owner:'engine',next_action:'Refresh evidence and prepare a complete task before requesting owner action.'});
    else accepted.push(item);
  }
  return {items:accepted,quality_holds:held,quality_version:CHAIRMAN_QUALITY_VERSION};
}
export const SUBMITTED_STATES=['submitted','pending_review','scheduled','live','verified'];
export async function existingParentSubmission(env,subjectKey){
  return env.DB.prepare(`SELECT p.surface_slug,p.status,p.action_url,p.live_url
    FROM distribution_contact_route_actions a JOIN distribution_opportunities p ON p.surface_slug=a.surface_slug
    WHERE a.opportunity_slug=? AND p.status IN ('submitted','pending_review','scheduled','live','verified') LIMIT 1`).bind(subjectKey).first();
}
export async function reconcileDuplicateSubmissionGates(env){
  const rows=await env.DB.prepare(`SELECT o.surface_slug,p.surface_slug canonical_slug,p.status canonical_status,COALESCE(p.live_url,p.action_url) evidence_url
    FROM distribution_contact_route_actions a JOIN distribution_opportunities p ON p.surface_slug=a.surface_slug
    JOIN distribution_opportunities o ON o.surface_slug=a.opportunity_slug
    WHERE a.execution_mode='autonomous_qualification' AND p.status IN ('submitted','pending_review','scheduled','live','verified')
      AND o.status NOT IN ('skipped','live','verified')`).all();
  for(const row of rows.results||[]){
    const detail=`Duplicate submission route reconciled with ${row.canonical_slug} (${row.canonical_status}). Monitor the canonical submission; do not resubmit.`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE distribution_opportunities SET status='skipped',human_required=0,next_action=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(detail,row.surface_slug),
      env.DB.prepare(`UPDATE human_gate_contract SET status='cancelled',resolved_at=datetime('now'),next_verification_at=NULL,result_url=?,verification_detail=?,updated_at=datetime('now') WHERE engine='distribution' AND subject_key=? AND status IN ('open','verification_pending')`).bind(row.evidence_url,detail,row.surface_slug),
      env.DB.prepare(`UPDATE distribution_contact_route_actions SET status='exhausted',last_result='duplicate_existing_submission',next_action=?,updated_at=datetime('now') WHERE opportunity_slug=?`).bind(detail,row.surface_slug),
      env.DB.prepare(`UPDATE distribution_submissions SET status='skipped',human_required=0,error=?,updated_at=datetime('now') WHERE surface_slug=? AND status NOT IN ('submitted','pending_review','live','verified')`).bind(detail,row.surface_slug),
      env.DB.prepare(`UPDATE distribution_economic_learning SET chairman_required=0,updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug),
      env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at) VALUES(?,?,'duplicate_human_gate_reconciled','completed',?,?,?,datetime('now'),datetime('now'))`).bind(`dedupe_${crypto.randomUUID()}`,row.surface_slug,row.evidence_url,row.evidence_url,detail)
    ]);
  }
  return {reconciled:(rows.results||[]).length};
}
