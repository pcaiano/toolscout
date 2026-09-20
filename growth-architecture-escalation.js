const CODE_RECIPIENT_MODE='configured_in_make';
const INTERNAL_EXECUTORS=new Set(['distribution_network','distribution_autonomous','content_issue','affiliate_cycle','catalog_cycle','growth_supervisor']);
const CORE_MISSIONS=new Set([
  'opportunity_coordination','execution_contract','self_audit','rnd_audit',
  'network_cycle','autonomous_cycle','economic_learning',
  'social_intelligence','runtime_quality','coverage_cycle'
]);
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const safe=(v,m=4000)=>String(v??'').slice(0,m);
const html=v=>safe(v,12000).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function ensureSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_architecture_incidents(
      incident_id TEXT PRIMARY KEY,
      incident_key TEXT NOT NULL UNIQUE,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      engine TEXT,
      executor TEXT,
      action TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      self_corrections_json TEXT NOT NULL,
      why_code_required TEXT NOT NULL,
      recommended_intervention TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 1,
      email_status TEXT NOT NULL DEFAULT 'pending',
      dispatch_token TEXT NOT NULL UNIQUE,
      first_detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      email_sent_at TEXT,
      resolved_at TEXT,
      resolution_note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_architecture_open ON growth_architecture_incidents(status,email_status,last_detected_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_architecture_engine ON growth_architecture_incidents(engine,status,last_detected_at DESC)`)
  ]);
}

async function upsertIncident(env,x){
  await ensureSchema(env);
  const existing=await env.DB.prepare(`SELECT incident_id,status,email_status,dispatch_token FROM growth_architecture_incidents WHERE incident_key=?`).bind(x.key).first();
  const incidentId=existing?.incident_id||`gbi_${crypto.randomUUID()}`;
  const token=existing?.dispatch_token||`gbdispatch_${crypto.randomUUID()}`;
  if(existing){
    await env.DB.prepare(`UPDATE growth_architecture_incidents SET
      severity=?,status='open',engine=?,executor=?,action=?,title=?,summary=?,evidence_json=?,self_corrections_json=?,
      why_code_required=?,recommended_intervention=?,approval_required=1,last_detected_at=datetime('now'),
      resolved_at=NULL,resolution_note=NULL,
      email_status=CASE WHEN status='resolved' THEN 'pending' ELSE email_status END,
      updated_at=datetime('now')
      WHERE incident_id=?`)
      .bind(x.severity,x.engine||null,x.executor||null,x.action||null,x.title,x.summary,JSON.stringify(x.evidence||{}),JSON.stringify(x.selfCorrections||[]),x.whyCodeRequired,x.recommendedIntervention,incidentId).run();
  }else{
    await env.DB.prepare(`INSERT INTO growth_architecture_incidents(
      incident_id,incident_key,severity,status,engine,executor,action,title,summary,evidence_json,self_corrections_json,
      why_code_required,recommended_intervention,approval_required,email_status,dispatch_token,first_detected_at,last_detected_at,updated_at)
      VALUES(?,?,?,'open',?,?,?,?,?,?,?,?,?,1,'pending',?,datetime('now'),datetime('now'),datetime('now'))`)
      .bind(incidentId,x.key,x.severity,x.engine||null,x.executor||null,x.action||null,x.title,x.summary,JSON.stringify(x.evidence||{}),JSON.stringify(x.selfCorrections||[]),x.whyCodeRequired,x.recommendedIntervention,token).run();
  }
  return incidentId;
}

export async function auditArchitectureEscalations(env){
  await ensureSchema(env);
  const activeKeys=new Set();
  let opened=0;

  const missing=await env.DB.prepare(`SELECT action,subject_type,subject_key,executor,last_result,COUNT(*) n
    FROM growth_execution_contract
    WHERE status='executor_missing'
    GROUP BY action,subject_type,subject_key,executor,last_result
    ORDER BY n DESC LIMIT 100`).all();
  for(const row of missing.results||[]){
    const key=`executor_missing:${row.subject_type||'unknown'}:${row.action||'unknown'}`;activeKeys.add(key);
    await upsertIncident(env,{
      key,severity:'P1',engine:row.subject_type==='search'?'seo_geo_aio':'growth',executor:row.executor,action:row.action,
      title:`No executor for Growth action: ${row.action}`,
      summary:`${n(row.n)} active Growth execution contract(s) require action "${row.action}" but no executor is registered.`,
      evidence:{subject_type:row.subject_type,subject_key:row.subject_key,count:n(row.n),last_result:row.last_result},
      selfCorrections:['Execution Contract marked the tasks executor_missing instead of silently dropping them.','Growth Supervisor entered repair_execution_contract when the missing executor remained present.'],
      whyCodeRequired:'Registering or routing a previously unknown action class requires a code or architecture change to the execution registry or downstream executor wiring.',
      recommendedIntervention:'Inspect growth-execution-contract.js and the originating Growth action. Map the action to an existing safe executor when semantically correct, or implement a bounded executor. Re-run execution-contract invariants before deployment.'
    });opened++;
  }

  const stalled=await env.DB.prepare(`SELECT executor,action,subject_type,subject_key,last_result,attempts,COUNT(*) n
    FROM growth_execution_contract
    WHERE status='stalled' AND execution_mode='internal'
    GROUP BY executor,action,subject_type,subject_key,last_result,attempts
    ORDER BY n DESC LIMIT 100`).all();
  for(const row of stalled.results||[]){
    if(!INTERNAL_EXECUTORS.has(String(row.executor||'')))continue;
    const codeLike=String(row.last_result||'').startsWith('executor_error:')||n(row.attempts)>=2;
    if(!codeLike)continue;
    const key=`internal_executor_stalled:${row.executor||'unknown'}:${row.action||'unknown'}`;activeKeys.add(key);
    await upsertIncident(env,{
      key,severity:n(row.attempts)>=2?'P1':'P2',engine:'growth',executor:row.executor,action:row.action,
      title:`Internal Growth executor repeatedly stalled: ${row.executor}`,
      summary:`${n(row.n)} internal execution contract(s) for "${row.action}" remain stalled after runtime self-correction.`,
      evidence:{executor:row.executor,action:row.action,subject_type:row.subject_type,subject_key:row.subject_key,last_result:row.last_result,attempts:n(row.attempts),count:n(row.n)},
      selfCorrections:['Growth Execution Contract applied SLA monitoring and retry state.','Growth Supervisor kept the issue visible as a failed execution contract.'],
      whyCodeRequired:'The internal executor is present but repeated execution failure indicates that runtime prioritisation or queue repair is insufficient. The executor implementation, integration contract, schema, or architecture requires inspection.',
      recommendedIntervention:`Inspect the ${row.executor} implementation and its latest engine-run/error evidence. Repair the executor or integration contract, then verify the affected task transitions through claimed, attempted and verified.`
    });opened++;
  }

  let core={results:[]};
  try{
    core=await env.DB.prepare(`SELECT f.engine,f.mission,f.detail,f.evidence_json,COUNT(*) n,MAX(f.started_at) last_failed
      FROM engine_runs f
      WHERE f.started_at>=datetime('now','-24 hours') AND f.status='failed'
        AND NOT EXISTS(
          SELECT 1 FROM engine_runs s
          WHERE s.engine=f.engine AND s.mission=f.mission AND s.status='completed' AND s.started_at>f.started_at
        )
      GROUP BY f.engine,f.mission,f.detail,f.evidence_json
      ORDER BY last_failed DESC LIMIT 50`).all();
  }catch{}
  for(const row of core.results||[]){
    if(!CORE_MISSIONS.has(String(row.mission||'')))continue;
    const key=`unresolved_core_run:${row.engine||'unknown'}:${row.mission||'unknown'}`;activeKeys.add(key);
    await upsertIncident(env,{
      key,severity:n(row.n)>=2?'P1':'P2',engine:row.engine,executor:null,action:row.mission,
      title:`Unresolved core Growth run failure: ${row.engine}/${row.mission}`,
      summary:`Core mission "${row.mission}" has an unresolved failed run and no later successful recovery run.`,
      evidence:{engine:row.engine,mission:row.mission,detail:row.detail,evidence_json:row.evidence_json,count:n(row.n),last_failed:row.last_failed},
      selfCorrections:['The runtime waited for a later successful run to close the failure automatically.','The failure remained unresolved, so it is being escalated instead of treated as healthy.'],
      whyCodeRequired:'A core mission that cannot recover on a subsequent run may require changes to worker code, workflow configuration, schema, or engine integration.',
      recommendedIntervention:'Read the latest failed run and repository code for this mission, identify the root cause, prepare a bounded code or architecture correction, and require Pedro approval before deployment.'
    });opened++;
  }

  const open=await env.DB.prepare(`SELECT incident_id,incident_key,email_status FROM growth_architecture_incidents WHERE status='open'`).all();
  let resolved=0;
  for(const row of open.results||[]){
    if(activeKeys.has(row.incident_key))continue;
    await env.DB.prepare(`UPDATE growth_architecture_incidents SET status='resolved',resolved_at=datetime('now'),resolution_note='Condition cleared by Growth Brain/runtime correction.',email_status=CASE WHEN email_sent_at IS NOT NULL THEN 'pending_resolved' ELSE 'resolved_without_email' END,updated_at=datetime('now') WHERE incident_id=?`).bind(row.incident_id).run();
    resolved++;
  }
  return{ok:true,activeArchitectureIncidents:activeKeys.size,detectedOrUpdated:opened,resolved,policy:'operational_self_correction_first_code_architecture_escalate_for_approval'};
}

function buildOpenEmail(row){
  let evidence={},corrections=[];try{evidence=JSON.parse(row.evidence_json||'{}')}catch{}try{corrections=JSON.parse(row.self_corrections_json||'[]')}catch{}
  const subject=`[ToolScout Growth Brain][CODE APPROVAL REQUIRED][${row.severity}] ${row.title} [${row.incident_id}]`;
  const body=`
  <h2>ToolScout Growth Brain architecture escalation</h2>
  <p><strong>Approval required:</strong> yes. The Growth Brain has not changed code or architecture automatically.</p>
  <p><strong>Incident:</strong> ${html(row.incident_id)}<br>
  <strong>Severity:</strong> ${html(row.severity)}<br>
  <strong>North Star:</strong> strict_verified_human_sessions<br>
  <strong>Engine:</strong> ${html(row.engine||'n/a')}<br>
  <strong>Executor:</strong> ${html(row.executor||'n/a')}<br>
  <strong>Action:</strong> ${html(row.action||'n/a')}<br>
  <strong>Detected:</strong> ${html(row.first_detected_at)}</p>
  <h3>What failed</h3><p>${html(row.summary)}</p>
  <h3>Evidence</h3><pre>${html(JSON.stringify(evidence,null,2))}</pre>
  <h3>What the Growth Brain already tried</h3><ul>${corrections.map(x=>`<li>${html(x)}</li>`).join('')}</ul>
  <h3>Why code or architecture is required</h3><p>${html(row.why_code_required)}</p>
  <h3>Recommended intervention</h3><p>${html(row.recommended_intervention)}</p>
  <hr>
  <p><strong>Next step for Pedro:</strong> open ChatGPT and say: <em>“Lê o último alerta de arquitetura do Growth Brain, investiga o incidente ${html(row.incident_id)} e prepara a correção. Não faças deploy de alterações de código ou arquitetura sem a minha aprovação.”</em></p>`;
  return{subject,body};
}
function buildResolvedEmail(row){
  return{
    subject:`[ToolScout Growth Brain][RESOLVED] ${row.title} [${row.incident_id}]`,
    body:`<h2>Growth Brain incident resolved</h2><p><strong>Incident:</strong> ${html(row.incident_id)}</p><p>${html(row.resolution_note||'The condition cleared.')}</p><p>No action is currently required.</p>`
  };
}

export async function publicEscalationCandidates(env,limit=3){
  await ensureSchema(env);
  const nLimit=Math.max(1,Math.min(5,Number(limit)||3));
  const q=await env.DB.prepare(`SELECT * FROM growth_architecture_incidents
    WHERE email_status IN ('pending','pending_resolved')
    ORDER BY CASE severity WHEN 'P1' THEN 0 ELSE 1 END, first_detected_at ASC LIMIT ?`).bind(nLimit).all();
  return{ok:true,items:(q.results||[]).map(row=>{
    const mail=row.email_status==='pending_resolved'?buildResolvedEmail(row):buildOpenEmail(row);
    return{incident_id:row.incident_id,dispatch_token:row.dispatch_token,email_kind:row.email_status==='pending_resolved'?'resolved':'code_approval_required',subject:mail.subject,body:mail.body};
  })};
}

export async function markEscalationEmailStatus(env,dispatchToken,status){
  await ensureSchema(env);
  const state=String(status||'').toLowerCase();
  if(!['sent','failed'].includes(state))return{ok:false,error:'invalid_status'};
  const row=await env.DB.prepare(`SELECT incident_id,email_status FROM growth_architecture_incidents WHERE dispatch_token=?`).bind(String(dispatchToken||'')).first();
  if(!row)return{ok:false,error:'unknown_dispatch_token'};
  if(state==='sent'){
    const final=row.email_status==='pending_resolved'?'resolved_sent':'sent';
    await env.DB.prepare(`UPDATE growth_architecture_incidents SET email_status=?,email_sent_at=COALESCE(email_sent_at,datetime('now')),updated_at=datetime('now') WHERE incident_id=?`).bind(final,row.incident_id).run();
  }else{
    await env.DB.prepare(`UPDATE growth_architecture_incidents SET email_status='pending',updated_at=datetime('now') WHERE incident_id=?`).bind(row.incident_id).run();
  }
  return{ok:true,incident_id:row.incident_id,status:state};
}

export async function architectureEscalationSnapshot(env){
  await ensureSchema(env);
  const q=await env.DB.prepare(`SELECT incident_id,severity,status,engine,executor,action,title,summary,approval_required,email_status,first_detected_at,last_detected_at,email_sent_at,resolved_at FROM growth_architecture_incidents ORDER BY last_detected_at DESC LIMIT 100`).all();
  return{ok:true,recipientMode:CODE_RECIPIENT_MODE,items:q.results||[]};
}
