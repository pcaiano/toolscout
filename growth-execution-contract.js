const HOUR=3600000;
const TERMINAL=new Set(['verified','human_required','blocked','cancelled']);
const EXECUTORS=Object.freeze({
  distribution_network:{engine:'distribution',mode:'internal',claim:90,attempt:180,verify:1440},
  distribution_autonomous:{engine:'distribution',mode:'internal',claim:90,attempt:180,verify:1440},
  make_sender:{engine:'distribution',mode:'external',claim:360,attempt:720,verify:2880},
  content_issue:{engine:'content',mode:'internal',claim:90,attempt:240,verify:1440},
  audience_make:{engine:'audience',mode:'external',claim:90,attempt:240,verify:1440},
  seo_github:{engine:'seo_geo_aio',mode:'external',claim:360,attempt:720,verify:2880},
  affiliate_cycle:{engine:'affiliate',mode:'internal',claim:180,attempt:720,verify:2880},
  catalog_cycle:{engine:'catalog',mode:'internal',claim:360,attempt:720,verify:2880},
  growth_supervisor:{engine:'growth',mode:'internal',claim:90,attempt:180,verify:360},
  human_gate:{engine:'human',mode:'human',claim:null,attempt:null,verify:null}
});
const ACTION_EXECUTOR=Object.freeze({
  execute_alternate_routes:'distribution_network',
  publisher_contact_discovery:'distribution_network',
  autonomous_route_qualification:'distribution_autonomous',
  repair_stalled_route_execution:'distribution_network',
  resolve_supported_route_auth:'distribution_autonomous',
  scale_proven_surface:'distribution_network',
  publisher_outreach:'make_sender',
  distribution_amplification:'make_sender',
  vendor_amplification:'make_sender',
  content_relevance_amplification:'content_issue',
  content_amplification:'content_issue',
  content_mention:'content_issue',
  affiliate_social:'content_issue',
  surface_only_true_human_gate:'human_gate',
  surface_only_true_human_route_gate:'human_gate',

  deepen_existing_search_asset:'seo_github',
  improve_click_capture:'seo_github',
  protect_current_ranking:'seo_github',
  strengthen_internal_links:'seo_github',
  observe_low_sample_ranking:'seo_github',

  activate_affiliate_route:'affiliate_cycle',
  capture_approved_referral_link:'affiliate_cycle',
  discover_and_qualify_affiliate_program:'affiliate_cycle',
  measure_affiliate_yield:'affiliate_cycle',
  monitor_affiliate_decision:'affiliate_cycle',
  monitor_retry_evidence:'affiliate_cycle',
  prepare_affiliate_application_pack:'affiliate_cycle',
  production_verify_affiliate_route:'affiliate_cycle',
  recheck_affiliate_program_on_evidence_or_cadence:'affiliate_cycle',
  reconcile_affiliate_state:'affiliate_cycle',

  confirm_source_breakage:'catalog_cycle',
  deep_catalog_review:'catalog_cycle',
  monitor_runtime_coverage_profile:'catalog_cycle',
  refresh_catalog_profile_for_observed_search_demand:'catalog_cycle',
  refresh_profile_if_confirmed:'catalog_cycle',
  refresh_volatile_catalog_facts:'catalog_cycle',
  resolve_missing_critical_catalog_fields:'catalog_cycle',
  resolve_profile_evidence_hold:'catalog_cycle',
  suppress_unverifiable_profile:'catalog_cycle',
  verify_changed_catalog_facts:'catalog_cycle',

  distribution_measurement:'growth_supervisor',
  search_measurement:'seo_github',
  catalog_impact_review:'catalog_cycle',
  discover_catalog_candidates:'catalog_cycle',
  admit_only_after_quality_gates:'catalog_cycle',
  prepare_whats_new_candidate:'catalog_cycle',
  verify_first_party_sources:'catalog_cycle',
  verify_news_materiality:'catalog_cycle',
  search_update_angle:'content_issue',
  verify_official_source:'catalog_cycle',
  research_first_party_candidate_profile:'catalog_cycle'
});
const SUPERVISOR_EXECUTOR=Object.freeze({
  distribution:'distribution_network',
  content:'content_issue',
  audience:'audience_make',
  seo_geo_aio:'seo_github',
  affiliate:'affiliate_cycle',
  catalog:'catalog_cycle'
});

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const dt=minutes=>new Date(Date.now()+minutes*60000).toISOString().replace('T',' ').slice(0,19);
const sqlTime=v=>String(v||'').replace('T',' ').replace('Z','').slice(0,19);
async function all(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
async function first(env,sql,bindings=[]){try{let q=env.DB.prepare(sql);if(bindings.length)q=q.bind(...bindings);return await q.first()}catch{return null}}
async function assetJson(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}
async function hash(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32)}

export function executionRegistry(){return{actions:ACTION_EXECUTOR,executors:EXECUTORS,supervisor:SUPERVISOR_EXECUTOR}}

export async function ensureExecutionContractSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_execution_contract(
      task_id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      opportunity_key TEXT,
      subject_type TEXT,
      subject_key TEXT,
      action TEXT NOT NULL,
      executor TEXT,
      engine TEXT,
      execution_mode TEXT,
      priority_score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      claim_deadline TEXT,
      attempt_deadline TEXT,
      verify_deadline TEXT,
      claimed_at TEXT,
      attempted_at TEXT,
      completed_at TEXT,
      verified_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_result TEXT,
      evidence_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_execution_status ON growth_execution_contract(status,priority_score DESC,updated_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_execution_executor ON growth_execution_contract(executor,status,priority_score DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_execution_source ON growth_execution_contract(source_kind,source_id,status)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_execution_events(
      event_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      executor TEXT,
      status TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_execution_events_task ON growth_execution_events(task_id,created_at DESC)`)
  ]);
}

async function upsertTask(env,{sourceKind,sourceId,opportunityKey=null,subjectType=null,subjectKey=null,action,executor,priority=0}){
  const spec=EXECUTORS[executor]||null;
  const taskId=await hash(`${sourceKind}|${sourceId}|${action}`);
  const status=!spec?'executor_missing':spec.mode==='human'?'human_required':'pending';
  const claim=spec?.claim!=null?dt(spec.claim):null,attempt=spec?.attempt!=null?dt(spec.attempt):null,verify=spec?.verify!=null?dt(spec.verify):null;
  const engine=spec?.engine||'unmapped',mode=spec?.mode||'unmapped';
  const write=await env.DB.prepare(`INSERT INTO growth_execution_contract(
      task_id,source_kind,source_id,opportunity_key,subject_type,subject_key,action,executor,engine,execution_mode,priority_score,status,
      claim_deadline,attempt_deadline,verify_deadline,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(task_id) DO UPDATE SET
      opportunity_key=excluded.opportunity_key,subject_type=excluded.subject_type,subject_key=excluded.subject_key,
      executor=excluded.executor,engine=excluded.engine,execution_mode=excluded.execution_mode,priority_score=excluded.priority_score,
      status=CASE
        WHEN growth_execution_contract.status IN ('verified','human_required','blocked') THEN growth_execution_contract.status
        WHEN excluded.status='executor_missing' THEN 'executor_missing'
        WHEN growth_execution_contract.status='executor_missing' AND excluded.status<>'executor_missing' THEN excluded.status
        WHEN growth_execution_contract.status='cancelled' THEN 'pending'
        ELSE growth_execution_contract.status END,
      claim_deadline=CASE WHEN growth_execution_contract.status='cancelled' THEN excluded.claim_deadline ELSE growth_execution_contract.claim_deadline END,
      attempt_deadline=CASE WHEN growth_execution_contract.status='cancelled' THEN excluded.attempt_deadline ELSE growth_execution_contract.attempt_deadline END,
      verify_deadline=CASE WHEN growth_execution_contract.status='cancelled' THEN excluded.verify_deadline ELSE growth_execution_contract.verify_deadline END,
      updated_at=datetime('now')
    WHERE growth_execution_contract.opportunity_key IS NOT excluded.opportunity_key
       OR growth_execution_contract.subject_type IS NOT excluded.subject_type
       OR growth_execution_contract.subject_key IS NOT excluded.subject_key
       OR growth_execution_contract.executor IS NOT excluded.executor
       OR growth_execution_contract.engine IS NOT excluded.engine
       OR growth_execution_contract.execution_mode IS NOT excluded.execution_mode
       OR growth_execution_contract.priority_score IS NOT excluded.priority_score
       OR growth_execution_contract.status='cancelled'
       OR excluded.status='executor_missing'`)
    .bind(taskId,sourceKind,sourceId,opportunityKey,subjectType,subjectKey,action,executor||null,engine,mode,Number(priority||0),status,claim,attempt,verify).run();
  if(Number(write?.meta?.changes||write?.changes||0)>0&&status==='executor_missing'){
    await env.DB.prepare(`INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
      .bind(`ge_${crypto.randomUUID()}`,taskId,'executor_missing',executor||null,status,`No executor is registered for action ${action}.`).run().catch(()=>{});
  }
  return taskId;
}

export async function syncExecutionContracts(env){
  await ensureExecutionContractSchema(env);
  const q=v=>"'"+String(v).replaceAll("'","''")+"'";
  const executorCase=Object.entries(ACTION_EXECUTOR).map(([action,executor])=>`WHEN ${q(action)} THEN ${q(executor)}`).join(' ');
  const engineCase=Object.entries(EXECUTORS).map(([executor,spec])=>`WHEN ${q(executor)} THEN ${q(spec.engine)}`).join(' ');
  const modeCase=Object.entries(EXECUTORS).map(([executor,spec])=>`WHEN ${q(executor)} THEN ${q(spec.mode)}`).join(' ');
  const claimCase=Object.entries(EXECUTORS).filter(([,s])=>s.claim!=null).map(([e,s])=>`WHEN ${q(e)} THEN datetime('now','+${Number(s.claim)} minutes')`).join(' ');
  const attemptCase=Object.entries(EXECUTORS).filter(([,s])=>s.attempt!=null).map(([e,s])=>`WHEN ${q(e)} THEN datetime('now','+${Number(s.attempt)} minutes')`).join(' ');
  const verifyCase=Object.entries(EXECUTORS).filter(([,s])=>s.verify!=null).map(([e,s])=>`WHEN ${q(e)} THEN datetime('now','+${Number(s.verify)} minutes')`).join(' ');
  const mapped=`CASE j.value ${executorCase} ELSE NULL END`;

  await env.DB.prepare(`INSERT INTO growth_execution_contract(
      task_id,source_kind,source_id,opportunity_key,subject_type,subject_key,action,executor,engine,execution_mode,priority_score,status,
      claim_deadline,attempt_deadline,verify_deadline,created_at,updated_at)
    SELECT
      substr('opportunity|'||g.opportunity_key||'|'||j.value,1,500),
      'opportunity',g.opportunity_key,g.opportunity_key,g.subject_type,g.subject_key,j.value,
      ${mapped} executor,
      CASE ${mapped} ${engineCase} ELSE 'unmapped' END engine,
      CASE ${mapped} ${modeCase} ELSE 'unmapped' END execution_mode,
      g.priority_score,
      CASE WHEN ${mapped} IS NULL THEN 'executor_missing'
           WHEN ${mapped}='human_gate' THEN 'human_required'
           ELSE 'pending' END status,
      CASE ${mapped} ${claimCase} ELSE NULL END claim_deadline,
      CASE ${mapped} ${attemptCase} ELSE NULL END attempt_deadline,
      CASE ${mapped} ${verifyCase} ELSE NULL END verify_deadline,
      datetime('now'),datetime('now')
    FROM growth_opportunity_state g, json_each(g.action_json) j
    WHERE g.status='active'
    ON CONFLICT(task_id) DO UPDATE SET
      opportunity_key=excluded.opportunity_key,subject_type=excluded.subject_type,subject_key=excluded.subject_key,
      executor=excluded.executor,engine=excluded.engine,execution_mode=excluded.execution_mode,priority_score=excluded.priority_score,
      status=CASE
        WHEN growth_execution_contract.status IN ('verified','human_required','blocked') THEN growth_execution_contract.status
        WHEN excluded.status='executor_missing' THEN 'executor_missing'
        WHEN growth_execution_contract.status='executor_missing' AND excluded.status<>'executor_missing' THEN excluded.status
        WHEN growth_execution_contract.status='cancelled' THEN 'pending'
        ELSE growth_execution_contract.status END,
      claim_deadline=CASE WHEN growth_execution_contract.status='cancelled' THEN excluded.claim_deadline ELSE growth_execution_contract.claim_deadline END,
      attempt_deadline=CASE WHEN growth_execution_contract.status='cancelled' THEN excluded.attempt_deadline ELSE growth_execution_contract.attempt_deadline END,
      verify_deadline=CASE WHEN growth_execution_contract.status='cancelled' THEN excluded.verify_deadline ELSE growth_execution_contract.verify_deadline END,
      updated_at=datetime('now')
    WHERE growth_execution_contract.opportunity_key IS NOT excluded.opportunity_key
       OR growth_execution_contract.subject_type IS NOT excluded.subject_type
       OR growth_execution_contract.subject_key IS NOT excluded.subject_key
       OR growth_execution_contract.executor IS NOT excluded.executor
       OR growth_execution_contract.engine IS NOT excluded.engine
       OR growth_execution_contract.execution_mode IS NOT excluded.execution_mode
       OR growth_execution_contract.priority_score IS NOT excluded.priority_score
       OR growth_execution_contract.status='cancelled'
       OR excluded.status='executor_missing'`).run();

  await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='cancelled',last_result='source_no_longer_active',completed_at=datetime('now'),updated_at=datetime('now')
    WHERE source_kind='opportunity'
      AND status NOT IN ('verified','human_required','blocked','cancelled')
      AND NOT EXISTS(
        SELECT 1 FROM growth_opportunity_state g,json_each(g.action_json) j
        WHERE g.status='active'
          AND g.opportunity_key=growth_execution_contract.source_id
          AND j.value=growth_execution_contract.action
      )`).run();

  await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='cancelled',last_result='superseded_by_set_based_contract',completed_at=datetime('now'),updated_at=datetime('now')
    WHERE source_kind='opportunity'
      AND status<>'cancelled'
      AND task_id NOT LIKE 'opportunity|%'
      AND EXISTS(
        SELECT 1 FROM growth_execution_contract current
        WHERE current.task_id=substr('opportunity|'||growth_execution_contract.source_id||'|'||growth_execution_contract.action,1,500)
          AND current.status<>'cancelled'
      )`).run();

  const supervisors=await all(env,`SELECT engine,status,directive FROM growth_supervisor_state WHERE engine IN ('distribution','content','audience','seo_geo_aio','affiliate','catalog')`);
  let supervisorTasks=0,missing=0;
  const activeSupervisorIds=new Set();
  for(const row of supervisors){
    if(!row.directive||row.status==='working')continue;
    const executor=SUPERVISOR_EXECUTOR[row.engine]||null,sourceId=`${row.engine}:${row.directive}`;
    const id=await upsertTask(env,{sourceKind:'supervisor',sourceId,subjectType:'engine',subjectKey:row.engine,action:`directive:${row.directive}`,executor,priority:95});
    activeSupervisorIds.add(id);supervisorTasks++;if(!executor)missing++;
  }
  const existingSupervisor=await all(env,`SELECT task_id FROM growth_execution_contract WHERE source_kind='supervisor' AND status NOT IN ('verified','human_required','blocked','cancelled')`);
  const staleSupervisor=existingSupervisor.map(x=>x.task_id).filter(id=>!activeSupervisorIds.has(id));
  if(staleSupervisor.length){
    for(let i=0;i<staleSupervisor.length;i+=20){
      const batch=staleSupervisor.slice(i,i+20),marks=batch.map(()=>'?').join(',');
      await env.DB.prepare(`UPDATE growth_execution_contract SET status='cancelled',last_result='supervisor_directive_changed',completed_at=datetime('now'),updated_at=datetime('now') WHERE task_id IN (${marks})`).bind(...batch).run();
    }
  }

  const counts=await first(env,`SELECT
    SUM(CASE WHEN source_kind='opportunity' AND status<>'cancelled' THEN 1 ELSE 0 END) opportunity_tasks,
    SUM(CASE WHEN status='executor_missing' THEN 1 ELSE 0 END) missing,
    SUM(CASE WHEN status='human_required' THEN 1 ELSE 0 END) human_required
    FROM growth_execution_contract`);
  return{ok:true,opportunityTasks:n(counts?.opportunity_tasks),supervisorTasks,missingExecutors:n(counts?.missing)+missing,humanRequired:n(counts?.human_required),cancelledSupervisor:staleSupervisor.length,write_policy:'set_based_material_change_only'};
}

export async function claimExecutorTasks(env,executor,{limit=50,maxInFlight=null,result='executor_claimed'}={}){
  await ensureExecutionContractSchema(env);
  const spec=EXECUTORS[executor]||null;
  let effective=Math.max(0,Math.min(100,Number(limit)||0)),inFlight=0;
  if(maxInFlight!=null){
    const row=await first(env,`SELECT COUNT(*) n FROM growth_execution_contract WHERE executor=? AND status IN ('claimed','attempted')`,[executor]);
    inFlight=n(row?.n);
    effective=Math.max(0,Math.min(effective,Math.max(0,Number(maxInFlight)-inFlight)));
  }
  if(effective<=0)return{claimed:0,taskIds:[],inFlight,capacity:Number(maxInFlight||limit||0)};
  const rows=await env.DB.prepare(`SELECT task_id,status FROM growth_execution_contract WHERE executor=? AND status IN ('pending','stalled') ORDER BY priority_score DESC,created_at ASC LIMIT ?`).bind(executor,effective).all();
  const ids=(rows.results||[]).map(x=>x.task_id);if(!ids.length)return{claimed:0,taskIds:[],inFlight,capacity:Number(maxInFlight||limit||0)};
  const qs=ids.map(()=>'?').join(',');
  const claim=spec?.claim!=null?dt(spec.claim):null,attempt=spec?.attempt!=null?dt(spec.attempt):null,verify=spec?.verify!=null?dt(spec.verify):null;
  await env.DB.prepare(`UPDATE growth_execution_contract SET status='claimed',claimed_at=datetime('now'),claim_deadline=?,attempt_deadline=?,verify_deadline=?,last_result=?,updated_at=datetime('now') WHERE task_id IN (${qs})`).bind(claim,attempt,verify,result,...ids).run();
  return{claimed:ids.length,taskIds:ids,inFlightBefore:inFlight,capacity:Number(maxInFlight||limit||0)};
}

export async function markExecutorAttempt(env,executor,result,{verified=false,blocked=false}={}){
  await ensureExecutionContractSchema(env);
  const status=blocked?'blocked':verified?'verified':'attempted';
  const completion=verified||blocked?',completed_at=datetime(\'now\')':'';
  const verification=verified?',verified_at=datetime(\'now\')':'';
  const sql=`UPDATE growth_execution_contract SET status=?,attempts=attempts+1,attempted_at=datetime('now'),last_result=?,updated_at=datetime('now')${completion}${verification} WHERE executor=? AND status='claimed'`;
  const w=await env.DB.prepare(sql).bind(status,String(result||'executor_attempted').slice(0,1000),executor).run();
  return{changed:Number(w?.meta?.changes||w?.changes||0),status};
}

export async function verifySupervisorExecutorTasks(env,executor,result='supervisor_executor_completed'){
  await ensureExecutionContractSchema(env);
  const w=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='verified',attempts=attempts+1,attempted_at=COALESCE(attempted_at,datetime('now')),
        completed_at=datetime('now'),verified_at=datetime('now'),last_result=?,updated_at=datetime('now')
    WHERE executor=? AND source_kind='supervisor' AND status IN ('claimed','attempted')`)
    .bind(String(result||'supervisor_executor_completed').slice(0,1000),executor).run();
  return{verified:Number(w?.meta?.changes||w?.changes||0)};
}

export async function reconcileExecutionDeadlines(env){
  await ensureExecutionContractSchema(env);
  const w=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='stalled',
        last_result=CASE
          WHEN status='pending' THEN 'claim_sla_missed'
          WHEN status='claimed' THEN 'attempt_sla_missed'
          ELSE 'verification_sla_missed' END,
        updated_at=datetime('now')
    WHERE status IN ('pending','claimed','attempted')
      AND (
        (status='pending' AND claim_deadline IS NOT NULL AND claim_deadline<datetime('now'))
        OR (status='claimed' AND attempt_deadline IS NOT NULL AND attempt_deadline<datetime('now'))
        OR (status='attempted' AND verify_deadline IS NOT NULL AND verify_deadline<datetime('now'))
      )`).run();
  return{stalled:Number(w?.meta?.changes||w?.changes||0)};
}

export async function reconcileExecutionContracts(env){
  await ensureExecutionContractSchema(env);
  await reconcileExecutionDeadlines(env);
  const tasks=await all(env,`SELECT * FROM growth_execution_contract WHERE status IN ('pending','claimed','attempted','stalled','executor_missing') ORDER BY priority_score DESC,created_at ASC LIMIT 60`);
  let verified=0,stalled=0,missing=0;
  const now=Date.now();
  for(const t of tasks){
    if(t.status==='executor_missing'){missing++;continue}
    const created=sqlTime(t.created_at),subject=String(t.subject_key||''),opportunity=String(t.opportunity_key||'');
    let evidence=null;
    if(t.executor==='make_sender'){
      if(t.subject_type==='tool'){
        evidence=await first(env,`SELECT status,updated_at,outreach_sent_at FROM distribution_vendor_amplification WHERE tool_slug=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 1`,[subject,created]);
        if(evidence?.status==='sent')evidence={...evidence,verified:true};
      }else if(t.subject_type==='surface'){
        evidence=await first(env,`SELECT status,updated_at,outreach_sent_at FROM distribution_network_outreach WHERE surface_slug=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 1`,[subject,created]);
        if(['sent','adopted'].includes(String(evidence?.status||'')))evidence={...evidence,verified:true};
      }
    }else if(t.executor==='distribution_network'){
      evidence=await first(env,`SELECT event_type,status,created_at FROM distribution_events WHERE created_at>=? AND (surface_slug=? OR asset_id=? OR detail LIKE ?) ORDER BY created_at DESC LIMIT 1`,[created,subject,subject,`%${subject.replaceAll('%','')}%`]);
      if(evidence&&['completed','verified','live','submitted'].includes(String(evidence.status||'')))evidence={...evidence,verified:true};
    }else if(t.executor==='distribution_autonomous'){
      evidence=await first(env,`SELECT result,created_at FROM distribution_qualification_events WHERE surface_slug=? AND created_at>=? ORDER BY created_at DESC LIMIT 1`,[subject,created]);
      if(evidence)evidence={...evidence,verified:true};
    }else if(t.executor==='content_issue'){
      if(t.subject_type==='tool')evidence=await first(env,`SELECT brief_id,created_at FROM content_engine_briefs WHERE created_at>=? AND selected_tool_slug=? ORDER BY created_at DESC LIMIT 1`,[created,subject]);
      else if(t.subject_type==='search')evidence=await first(env,`SELECT brief_id,created_at FROM content_engine_briefs WHERE created_at>=? AND target_json LIKE ? ORDER BY created_at DESC LIMIT 1`,[created,`%${subject.replaceAll('%','')}%`]);
      else evidence=await first(env,`SELECT brief_id,created_at FROM content_engine_briefs WHERE created_at>=? ORDER BY created_at DESC LIMIT 1`,[created]);
      if(evidence)evidence={...evidence,verified:true};
    }else if(t.executor==='audience_make'){
      evidence=await first(env,`SELECT event_id,event_type,created_at FROM audience_events WHERE status='published' AND created_at>=? ORDER BY created_at DESC LIMIT 1`,[created]);
      if(evidence)evidence={...evidence,verified:true};
    }else if(t.executor==='seo_github'){
      const report=await assetJson(env,'/reports/organic-growth-actions.json',{generatedAt:null,newInterventions:[],activeOptimizations:[]});
      const generated=Date.parse(String(report.generatedAt||'')),createdAt=Date.parse(String(t.created_at||'').replace(' ','T')+'Z');
      const intent=subject.replace(/^\//,'').replace(/\.html$/,'');
      const matched=[...(report.newInterventions||[]),...(report.activeOptimizations||[])].some(x=>String(x?.intent||x?.path||'').replace(/^\//,'').replace(/\.html$/,'')===intent);
      if(Number.isFinite(generated)&&Number.isFinite(createdAt)&&generated>=createdAt&&matched)evidence={generatedAt:report.generatedAt,intent,verified:true};
    }else if(t.executor==='affiliate_cycle'){
      evidence=await first(env,`SELECT status,updated_at FROM affiliate_workflow WHERE tool_slug=? AND updated_at>=? ORDER BY updated_at DESC LIMIT 1`,[subject,created]);
      if(evidence)evidence={...evidence,verified:true};
    }else if(t.executor==='catalog_cycle'){
      evidence=await first(env,`SELECT quality_status,last_checked_at FROM catalog_runtime_state WHERE tool_slug=? AND last_checked_at>=? ORDER BY last_checked_at DESC LIMIT 1`,[subject,created]);
      if(evidence)evidence={...evidence,verified:true};
    }else if(t.executor==='growth_supervisor'){
      evidence=await first(env,`SELECT completed_at FROM engine_runs WHERE engine='growth' AND mission='self_audit' AND status='completed' AND completed_at>=? ORDER BY completed_at DESC LIMIT 1`,[created]);
      if(evidence)evidence={...evidence,verified:true};
    }

    if(evidence?.verified){
      await env.DB.prepare(`UPDATE growth_execution_contract SET status='verified',verified_at=datetime('now'),completed_at=COALESCE(completed_at,datetime('now')),last_result='execution_verified',evidence_json=?,updated_at=datetime('now') WHERE task_id=? AND status<>'verified'`).bind(JSON.stringify(evidence).slice(0,4000),t.task_id).run();
      verified++;continue;
    }

    const claimDeadline=Date.parse(String(t.claim_deadline||'').replace(' ','T')+'Z');
    const attemptDeadline=Date.parse(String(t.attempt_deadline||'').replace(' ','T')+'Z');
    const verifyDeadline=Date.parse(String(t.verify_deadline||'').replace(' ','T')+'Z');
    let reason=null;
    if(t.status==='pending'&&Number.isFinite(claimDeadline)&&now>claimDeadline)reason='claim_sla_missed';
    else if(t.status==='claimed'&&Number.isFinite(attemptDeadline)&&now>attemptDeadline)reason='attempt_sla_missed';
    else if(t.status==='attempted'&&Number.isFinite(verifyDeadline)&&now>verifyDeadline)reason='verification_sla_missed';
    if(reason){
      await env.DB.prepare(`UPDATE growth_execution_contract SET status='stalled',last_result=?,updated_at=datetime('now') WHERE task_id=? AND status<>'stalled'`).bind(reason,t.task_id).run();
      await env.DB.prepare(`INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`).bind(`ge_${crypto.randomUUID()}`,t.task_id,'sla_missed',t.executor,'stalled',reason).run().catch(()=>{});
      stalled++;
    }
  }
  return{ok:true,checked:tasks.length,verified,stalled,missingExecutors:missing};
}

export async function executionContractSnapshot(env){
  await ensureExecutionContractSchema(env);
  const [states,executors,missing,stalled]=await Promise.all([
    all(env,`SELECT status,COUNT(*) n FROM growth_execution_contract GROUP BY status`),
    all(env,`SELECT executor,status,COUNT(*) n FROM growth_execution_contract GROUP BY executor,status ORDER BY executor,status`),
    first(env,`SELECT COUNT(*) n FROM growth_execution_contract WHERE status='executor_missing'`),
    first(env,`SELECT COUNT(*) n FROM growth_execution_contract WHERE status='stalled'`)
  ]);
  return{states:Object.fromEntries(states.map(x=>[x.status,n(x.n)])),executors,missingExecutors:n(missing?.n),stalled:n(stalled?.n)};
}
