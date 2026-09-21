const HOUR=3600000;
const TERMINAL=new Set(['verified','human_required','blocked','cancelled']);
const EXECUTORS=Object.freeze({
  distribution_network:{engine:'distribution',mode:'internal',claim:90,attempt:180,verify:1440},
  distribution_autonomous:{engine:'distribution',mode:'internal',claim:90,attempt:180,verify:1440},
  make_sender:{engine:'distribution',mode:'external',claim:360,attempt:300,verify:720},
  content_issue:{engine:'content',mode:'internal',claim:90,attempt:240,verify:1440},
  audience_make:{engine:'audience',mode:'external',claim:90,attempt:300,verify:720},
  seo_github:{engine:'seo_geo_aio',mode:'external',claim:360,attempt:300,verify:720},
  affiliate_cycle:{engine:'affiliate',mode:'internal',claim:180,attempt:360,verify:2880},
  catalog_cycle:{engine:'catalog',mode:'internal',claim:360,attempt:360,verify:2880},
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
  backlink_reference_outreach:'make_sender',
  verify_backlink_acquisition:'distribution_autonomous',
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
const READY_CAPS=Object.freeze({
  distribution_network:1,
  distribution_autonomous:1,
  make_sender:1,
  content_issue:1,
  audience_make:1,
  seo_github:1,
  affiliate_cycle:1,
  catalog_cycle:1,
  growth_supervisor:1
});
const GENERIC_BATCH_EXECUTORS=new Set(['distribution_network','distribution_autonomous','affiliate_cycle']);

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const dt=minutes=>new Date(Date.now()+minutes*60000).toISOString().replace('T',' ').slice(0,19);
const sqlTime=v=>String(v||'').replace('T',' ').replace('Z','').slice(0,19);
async function all(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
async function first(env,sql,bindings=[]){try{let q=env.DB.prepare(sql);if(bindings.length)q=q.bind(...bindings);return await q.first()}catch{return null}}
async function assetJson(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}
let availabilityCache={at:0,value:null};
async function executionAvailability(env){
  if(availabilityCache.value&&Date.now()-availabilityCache.at<60000)return availabilityCache.value;
  const github=await assetJson(env,'/data/github-actions-resume-policy.json',{enabled:true,reason:null});
  const value={
    seo_github:{available:github?.enabled!==false,reason:github?.enabled===false?String(github?.reason||'github_actions_disabled'):null}
  };
  availabilityCache={at:Date.now(),value};return value;
}
async function hash(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32)}

export function executionRegistry(){return{actions:ACTION_EXECUTOR,executors:EXECUTORS,supervisor:SUPERVISOR_EXECUTOR}}

let executionSchemaReady=null;
export async function ensureExecutionContractSchema(env){
  if(executionSchemaReady)return executionSchemaReady;
  executionSchemaReady=env.DB.batch([
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
  ]).catch(error=>{executionSchemaReady=null;throw error});
  return executionSchemaReady;
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
        WHEN growth_execution_contract.status='cancelled' THEN excluded.status
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
       OR (excluded.status='executor_missing' AND growth_execution_contract.status<>'executor_missing')`)
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
  const mapped=`CASE
    WHEN g.subject_type='search' AND j.value IN ('distribution_amplification','backlink_reference_outreach') THEN 'distribution_network'
    ELSE CASE j.value ${executorCase} ELSE CASE WHEN g.subject_type='search' THEN 'seo_github' ELSE NULL END END
  END`;

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
           ELSE 'deferred' END status,
      NULL claim_deadline,
      NULL attempt_deadline,
      NULL verify_deadline,
      datetime('now'),datetime('now')
    FROM growth_opportunity_state g, json_each(g.action_json) j
    WHERE g.status='active'
      AND j.value NOT IN ('distribution_measurement','search_measurement')
    ON CONFLICT(task_id) DO UPDATE SET
      opportunity_key=excluded.opportunity_key,subject_type=excluded.subject_type,subject_key=excluded.subject_key,
      executor=excluded.executor,engine=excluded.engine,execution_mode=excluded.execution_mode,priority_score=excluded.priority_score,
      status=CASE
        WHEN growth_execution_contract.status IN ('verified','human_required','blocked') THEN growth_execution_contract.status
        WHEN excluded.status='executor_missing' THEN 'executor_missing'
        WHEN growth_execution_contract.status='executor_missing' AND excluded.status<>'executor_missing' THEN excluded.status
        WHEN growth_execution_contract.status='cancelled' THEN excluded.status
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
       OR (excluded.status='executor_missing' AND growth_execution_contract.status<>'executor_missing')`).run();

  await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='cancelled',last_result='source_no_longer_active',completed_at=datetime('now'),updated_at=datetime('now')
    WHERE source_kind='opportunity'
      AND status NOT IN ('verified','human_required','blocked','cancelled')
      AND NOT EXISTS(
        SELECT 1 FROM growth_opportunity_state g,json_each(g.action_json) j
        WHERE g.status='active'
          AND g.opportunity_key=growth_execution_contract.source_id
          AND j.value=growth_execution_contract.action
          AND j.value NOT IN ('distribution_measurement','search_measurement')
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

  const legacyBacklog=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='deferred',
        claim_deadline=NULL,
        attempt_deadline=NULL,
        verify_deadline=NULL,
        claimed_at=NULL,
        attempted_at=NULL,
        last_result='legacy_sla_backlog_requeued_v3',
        updated_at=datetime('now')
    WHERE created_at<'2026-09-21 09:05:00'
      AND status='stalled'
      AND last_result IN ('claim_sla_missed','attempt_sla_missed','verification_sla_missed','queued_awaiting_executor_capacity','executor_capacity_backlog')`).run();
  const staleLegacyClaims=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='deferred',
        claim_deadline=NULL,
        attempt_deadline=NULL,
        verify_deadline=NULL,
        claimed_at=NULL,
        attempted_at=NULL,
        last_result='legacy_stale_claim_released_v3',
        updated_at=datetime('now')
    WHERE created_at<'2026-09-21 09:05:00'
      AND status IN ('claimed','attempted')
      AND claimed_at IS NOT NULL
      AND claimed_at<datetime('now','-6 hours')`).run();
  const contentTaskBindingRecovery=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='deferred',
        claim_deadline=NULL,
        attempt_deadline=NULL,
        verify_deadline=NULL,
        claimed_at=NULL,
        attempted_at=NULL,
        last_result='requeued_after_content_task_binding_fix',
        updated_at=datetime('now')
    WHERE executor='content_issue'
      AND status='stalled'
      AND last_result='executor_error:task is not defined'`).run();
  const admission=await rebalanceExecutionAdmission(env);
  const counts=await first(env,`SELECT
    SUM(CASE WHEN source_kind='opportunity' AND status<>'cancelled' THEN 1 ELSE 0 END) opportunity_tasks,
    SUM(CASE WHEN status='executor_missing' THEN 1 ELSE 0 END) missing,
    SUM(CASE WHEN status='human_required' THEN 1 ELSE 0 END) human_required,
    SUM(CASE WHEN status='deferred' THEN 1 ELSE 0 END) deferred
    FROM growth_execution_contract`);
  return{ok:true,opportunityTasks:n(counts?.opportunity_tasks),supervisorTasks,missingExecutors:n(counts?.missing)+missing,humanRequired:n(counts?.human_required),deferred:n(counts?.deferred),legacyBacklogNormalized:Number(legacyBacklog?.meta?.changes||legacyBacklog?.changes||0),staleLegacyClaimsReleased:Number(staleLegacyClaims?.meta?.changes||staleLegacyClaims?.changes||0),contentTaskBindingRecovered:Number(contentTaskBindingRecovery?.meta?.changes||contentTaskBindingRecovery?.changes||0),admission,cancelledSupervisor:staleSupervisor.length,write_policy:'capacity_bounded_task_specific_v3'};
}

export async function rebalanceExecutionAdmission(env){
  await ensureExecutionContractSchema(env);
  const availability=await executionAvailability(env);

  const legacy=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='deferred',claim_deadline=NULL,attempt_deadline=NULL,verify_deadline=NULL,
        claimed_at=NULL,attempted_at=NULL,last_result='legacy_generic_execution_requeued_v2',updated_at=datetime('now')
    WHERE status IN ('claimed','attempted')
      AND NOT EXISTS (
        SELECT 1 FROM growth_execution_events e
        WHERE e.task_id=growth_execution_contract.task_id AND e.event_type='claimed'
      )`).run();

  const batchRelease=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='deferred',claim_deadline=NULL,attempt_deadline=NULL,verify_deadline=NULL,
        claimed_at=NULL,attempted_at=NULL,last_result='batch_executor_waiting_for_subject_evidence_v3',updated_at=datetime('now')
    WHERE source_kind='opportunity'
      AND executor IN ('distribution_network','distribution_autonomous','affiliate_cycle')
      AND status IN ('pending','claimed','attempted','stalled')
      AND COALESCE(last_result,'') NOT LIKE 'executor_error:%'`).run();

  let unavailableReleased=0;
  if(availability?.seo_github?.available===false){
    const reason=String(availability.seo_github.reason||'github_actions_disabled').slice(0,600);
    const w=await env.DB.prepare(`UPDATE growth_execution_contract
      SET status='deferred',claim_deadline=NULL,attempt_deadline=NULL,verify_deadline=NULL,
          claimed_at=NULL,attempted_at=NULL,last_result=?,updated_at=datetime('now')
      WHERE executor='seo_github'
        AND status IN ('pending','claimed','attempted','stalled')`).bind(`executor_unavailable:seo_github:${reason}`).run();
    unavailableReleased=Number(w?.meta?.changes||w?.changes||0);
  }

  const result={
    promoted:0,
    deferred:Number(legacy?.meta?.changes||legacy?.changes||0)+Number(batchRelease?.meta?.changes||batchRelease?.changes||0)+unavailableReleased,
    legacyRequeued:Number(legacy?.meta?.changes||legacy?.changes||0),
    batchOpportunityReleased:Number(batchRelease?.meta?.changes||batchRelease?.changes||0),
    unavailableReleased,
    availability,
    executors:{}
  };

  for(const [executor,spec] of Object.entries(EXECUTORS)){
    if(spec.mode==='human')continue;
    const cap=Math.max(1,Number(READY_CAPS[executor]||1));
    if(executor==='seo_github'&&availability?.seo_github?.available===false){
      result.executors[executor]={cap,available:false,reason:availability.seo_github.reason||'github_actions_disabled',inFlight:0,pendingKept:0,promoted:0};
      continue;
    }
    const inFlightRow=await first(env,`SELECT COUNT(*) n FROM growth_execution_contract WHERE executor=? AND status IN ('claimed','attempted')`,[executor]);
    const inFlight=n(inFlightRow?.n),readySlots=Math.max(0,cap-inFlight);

    const pendingWhere=GENERIC_BATCH_EXECUTORS.has(executor)?" AND source_kind='supervisor'":"";
    const pending=await env.DB.prepare(`SELECT task_id FROM growth_execution_contract WHERE executor=? AND status='pending'${pendingWhere} ORDER BY CASE WHEN executor='catalog_cycle' AND subject_type='catalog_gap' THEN 0 ELSE 1 END,priority_score DESC,created_at ASC`).bind(executor).all();
    const pendingIds=(pending.results||[]).map(x=>x.task_id);
    const keep=pendingIds.slice(0,readySlots),demote=pendingIds.slice(readySlots);
    if(demote.length){
      for(let i=0;i<demote.length;i+=40){
        const ids=demote.slice(i,i+40),marks=ids.map(()=>'?').join(',');
        const w=await env.DB.prepare(`UPDATE growth_execution_contract SET status='deferred',claim_deadline=NULL,attempt_deadline=NULL,verify_deadline=NULL,last_result='deferred_by_capacity',updated_at=datetime('now') WHERE task_id IN (${marks}) AND status='pending'`).bind(...ids).run();
        result.deferred+=Number(w?.meta?.changes||w?.changes||0);
      }
    }
    let promoted=0;
    const remaining=Math.max(0,readySlots-keep.length);
    if(remaining>0){
      const deferredWhere=GENERIC_BATCH_EXECUTORS.has(executor)?" AND source_kind='supervisor'":"";
      const rows=await env.DB.prepare(`SELECT task_id FROM growth_execution_contract WHERE executor=? AND status='deferred'${deferredWhere} ORDER BY CASE WHEN executor='catalog_cycle' AND subject_type='catalog_gap' THEN 0 ELSE 1 END,priority_score DESC,created_at ASC LIMIT ?`).bind(executor,remaining).all();
      const ids=(rows.results||[]).map(x=>x.task_id);
      if(ids.length){
        const marks=ids.map(()=>'?').join(',');
        const claimDeadline=spec.claim!=null?dt(spec.claim):null;
        const w=await env.DB.prepare(`UPDATE growth_execution_contract SET status='pending',claim_deadline=?,attempt_deadline=NULL,verify_deadline=NULL,last_result='admitted_to_ready_queue',updated_at=datetime('now') WHERE task_id IN (${marks}) AND status='deferred'`).bind(claimDeadline,...ids).run();
        promoted=Number(w?.meta?.changes||w?.changes||0);result.promoted+=promoted;
      }
    }
    result.executors[executor]={cap,available:true,inFlight,pendingKept:keep.length,promoted};
  }
  return result;
}

export async function claimExecutorTasks(env,executor,{limit=50,maxInFlight=null,result='executor_claimed'}={}){
  await ensureExecutionContractSchema(env);
  await rebalanceExecutionAdmission(env);
  const spec=EXECUTORS[executor]||null;
  let effective=Math.max(0,Math.min(100,Number(limit)||0)),inFlight=0;
  if(maxInFlight!=null){
    const row=await first(env,`SELECT COUNT(*) n FROM growth_execution_contract WHERE executor=? AND status IN ('claimed','attempted')`,[executor]);
    inFlight=n(row?.n);
    effective=Math.max(0,Math.min(effective,Math.max(0,Number(maxInFlight)-inFlight)));
  }
  if(effective<=0)return{claimed:0,taskIds:[],tasks:[],inFlight,capacity:Number(maxInFlight||limit||0)};
  const rows=await env.DB.prepare(`SELECT task_id,source_kind,source_id,opportunity_key,subject_type,subject_key,action,executor,engine,priority_score,status,created_at FROM growth_execution_contract WHERE executor=? AND status IN ('pending','stalled') ORDER BY CASE WHEN executor='catalog_cycle' AND subject_type='catalog_gap' THEN 0 ELSE 1 END,priority_score DESC,created_at ASC LIMIT ?`).bind(executor,effective).all();
  const tasks=rows.results||[],ids=tasks.map(x=>x.task_id);
  if(!ids.length)return{claimed:0,taskIds:[],tasks:[],inFlight,capacity:Number(maxInFlight||limit||0)};
  const qs=ids.map(()=>'?').join(',');
  const claim=spec?.claim!=null?dt(spec.claim):null,attempt=spec?.attempt!=null?dt(spec.attempt):null,verify=spec?.verify!=null?dt(spec.verify):null;
  await env.DB.prepare(`UPDATE growth_execution_contract SET status='claimed',claimed_at=datetime('now'),claim_deadline=?,attempt_deadline=?,verify_deadline=?,last_result=?,updated_at=datetime('now') WHERE task_id IN (${qs})`).bind(claim,attempt,verify,result,...ids).run();
  for(const task of tasks){
    await env.DB.prepare(`INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
      .bind(`ge_${crypto.randomUUID()}`,task.task_id,'claimed',executor,'claimed',String(result||'executor_claimed').slice(0,1000)).run().catch(()=>{});
  }
  return{claimed:ids.length,taskIds:ids,tasks,inFlightBefore:inFlight,capacity:Number(maxInFlight||limit||0)};
}

export async function markExecutorAttempt(env,executor,result,{verified=false,blocked=false,failed=false,taskIds=null}={}){
  await ensureExecutionContractSchema(env);
  const ids=Array.isArray(taskIds)?taskIds.filter(Boolean).slice(0,100):[];
  const status=failed?'stalled':blocked?'blocked':verified?'verified':'attempted';
  const completion=verified||blocked?",completed_at=datetime('now')":"";
  const verification=verified?",verified_at=datetime('now')":"";
  const failureDetail=String(result||'executor_attempted').slice(0,1000);
  let sql=`UPDATE growth_execution_contract SET status=?,attempts=attempts+1,attempted_at=datetime('now'),last_result=?,updated_at=datetime('now')${completion}${verification} WHERE executor=? AND status='claimed'`;
  const bindings=[status,failureDetail,executor];
  if(ids.length){sql+=` AND task_id IN (${ids.map(()=>'?').join(',')})`;bindings.push(...ids)}
  const w=await env.DB.prepare(sql).bind(...bindings).run();
  const changed=Number(w?.meta?.changes||w?.changes||0);
  const eventType=failed?'executor_failed':verified?'verified':blocked?'blocked':'attempted';
  if(ids.length){
    for(const taskId of ids)await env.DB.prepare(`INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
      .bind(`ge_${crypto.randomUUID()}`,taskId,eventType,executor,status,failureDetail).run().catch(()=>{});
  }
  return{changed,status};
}

export async function recordExecutionProof(env,{taskId,executor=null,status='verified',detail='execution_verified',evidence=null,externalId=null}={}){
  await ensureExecutionContractSchema(env);
  if(!taskId)return{ok:false,error:'task_id_required'};
  const task=await first(env,`SELECT task_id,executor,status,source_kind,subject_type,subject_key,action FROM growth_execution_contract WHERE task_id=?`,[taskId]);
  if(!task)return{ok:false,error:'unknown_task'};
  if(executor&&task.executor!==executor)return{ok:false,error:'executor_mismatch',expected:task.executor};
  if(task.status==='verified'&&status==='verified')return{ok:true,idempotent:true,taskId};
  const normalized=status==='failed'?'stalled':status==='blocked'?'blocked':'verified';
  const payload={...(evidence&&typeof evidence==='object'?evidence:{}),external_id:externalId||undefined,proof_task_id:taskId,proof_executor:task.executor};
  const verified=normalized==='verified';
  const sql=`UPDATE growth_execution_contract SET status=?,attempts=CASE WHEN attempted_at IS NULL THEN attempts+1 ELSE attempts END,attempted_at=COALESCE(attempted_at,datetime('now')),completed_at=${verified?"datetime('now')":"completed_at"},verified_at=${verified?"datetime('now')":"verified_at"},last_result=?,evidence_json=?,updated_at=datetime('now') WHERE task_id=?`;
  await env.DB.prepare(sql).bind(normalized,String(detail||normalized).slice(0,1000),JSON.stringify(payload).slice(0,4000),taskId).run();
  await env.DB.prepare(`INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind(`ge_${crypto.randomUUID()}`,taskId,verified?'verified':normalized==='stalled'?'executor_failed':'blocked',task.executor,normalized,String(detail||normalized).slice(0,1000)).run().catch(()=>{});
  return{ok:true,taskId,status:normalized};
}

export async function deferExecutionTask(env,taskId,result='deferred_without_task_specific_proof'){
  await ensureExecutionContractSchema(env);
  const row=await first(env,`SELECT task_id,executor,status FROM growth_execution_contract WHERE task_id=?`,[taskId]);
  if(!row)return{ok:false,error:'unknown_task'};
  if(TERMINAL.has(String(row.status||'')))return{ok:true,idempotent:true,status:row.status};
  const w=await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='deferred',claim_deadline=NULL,attempt_deadline=NULL,verify_deadline=NULL,
        claimed_at=NULL,attempted_at=NULL,last_result=?,updated_at=datetime('now')
    WHERE task_id=? AND status NOT IN ('verified','human_required','blocked','cancelled')`).bind(String(result||'deferred_without_task_specific_proof').slice(0,1000),taskId).run();
  await env.DB.prepare(`INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind(`ge_${crypto.randomUUID()}`,taskId,'deferred',row.executor,'deferred',String(result||'deferred_without_task_specific_proof').slice(0,1000)).run().catch(()=>{});
  return{ok:true,changed:Number(w?.meta?.changes||w?.changes||0),status:'deferred'};
}

export async function runExecutionIntegritySelfTest(env){
  await ensureExecutionContractSchema(env);
  const taskId=`selftest|${crypto.randomUUID()}`;
  const executor='growth_supervisor';
  try{
    await env.DB.prepare(`INSERT INTO growth_execution_contract(
      task_id,source_kind,source_id,opportunity_key,subject_type,subject_key,action,executor,engine,execution_mode,priority_score,status,
      claim_deadline,attempt_deadline,verify_deadline,claimed_at,created_at,updated_at)
      VALUES(?, 'self_test', ?, NULL, 'self_test', 'closed_loop_integrity', 'integrity_self_test', ?, 'growth', 'internal', 0, 'claimed',
        datetime('now','+5 minutes'),datetime('now','+5 minutes'),datetime('now','+5 minutes'),datetime('now'),datetime('now'),datetime('now'))`)
      .bind(taskId,taskId,executor).run();
    await env.DB.prepare(`INSERT INTO growth_execution_events(event_id,task_id,event_type,executor,status,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
      .bind(`ge_${crypto.randomUUID()}`,taskId,'claimed',executor,'claimed','integrity_self_test_claimed').run();

    await markExecutorAttempt(env,executor,'integrity_self_test_injected_failure',{failed:true,taskIds:[taskId]});
    const failedRow=await first(env,`SELECT status,last_result FROM growth_execution_contract WHERE task_id=?`,[taskId]);
    const failedEvent=await first(env,`SELECT event_type,status FROM growth_execution_events WHERE task_id=? AND event_type='executor_failed' ORDER BY created_at DESC LIMIT 1`,[taskId]);

    const recovery=await recordExecutionProof(env,{taskId,executor,status:'verified',detail:'integrity_self_test_recovered',evidence:{self_test:true,phase:'recovery'}});
    const verifiedRow=await first(env,`SELECT status,verified_at FROM growth_execution_contract WHERE task_id=?`,[taskId]);
    const ok=failedRow?.status==='stalled'&&failedEvent?.event_type==='executor_failed'&&recovery?.ok===true&&verifiedRow?.status==='verified';
    return{ok,failureVisible:failedRow?.status==='stalled',failureEventRecorded:failedEvent?.event_type==='executor_failed',recoveryVerified:verifiedRow?.status==='verified'};
  }finally{
    await env.DB.prepare(`DELETE FROM growth_execution_events WHERE task_id=?`).bind(taskId).run().catch(()=>{});
    await env.DB.prepare(`DELETE FROM growth_execution_contract WHERE task_id=?`).bind(taskId).run().catch(()=>{});
  }
}

export async function verifySupervisorExecutorTasks(env,executor,result='supervisor_executor_completed',taskIds=null){
  await ensureExecutionContractSchema(env);
  const ids=Array.isArray(taskIds)?taskIds.filter(Boolean).slice(0,100):[];
  if(!ids.length)return{verified:0};
  let verified=0;
  for(const taskId of ids){
    const row=await first(env,`SELECT source_kind,status FROM growth_execution_contract WHERE task_id=? AND executor=?`,[taskId,executor]);
    if(row?.source_kind!=='supervisor'||!['claimed','attempted','stalled'].includes(String(row?.status||'')))continue;
    const out=await recordExecutionProof(env,{taskId,executor,status:'verified',detail:result,evidence:{proof_kind:'supervisor_executor_cycle'}});
    if(out?.ok)verified++;
  }
  return{verified};
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
  return{stalled:Number(w?.meta?.changes||w?.changes||0),recoveredQueueBacklog:0,policy:'missed_sla_stays_visible_until_reclaimed_or_proved'};
}

export async function reconcileExecutionContracts(env){
  await ensureExecutionContractSchema(env);
  await reconcileExecutionDeadlines(env);
  const tasks=await all(env,`SELECT * FROM growth_execution_contract
    WHERE status IN ('pending','claimed','attempted','stalled','executor_missing')
       OR (status='deferred' AND executor IN ('distribution_network','distribution_autonomous','affiliate_cycle'))
    ORDER BY CASE status WHEN 'claimed' THEN 0 WHEN 'attempted' THEN 1 WHEN 'stalled' THEN 2 WHEN 'pending' THEN 3 WHEN 'executor_missing' THEN 4 ELSE 5 END,
             priority_score DESC,created_at ASC
    LIMIT 160`);
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
      if(t.subject_type==='search'&&opportunity){
        evidence=await first(env,`SELECT action_id,status,created_at,target_url FROM growth_action_events WHERE opportunity_key=? AND created_at>=? AND engine LIKE 'distribution%' AND status IN ('sent','verified','completed','attributed') ORDER BY created_at DESC LIMIT 1`,[opportunity,created]);
        if(evidence)evidence={...evidence,verified:true,proof_scope:'opportunity'};
      }else{
        evidence=await first(env,`SELECT event_type,status,created_at,surface_slug,asset_id FROM distribution_events WHERE created_at>=? AND (surface_slug=? OR asset_id=?) ORDER BY created_at DESC LIMIT 1`,[created,subject,subject]);
        if(evidence&&['completed','verified','live'].includes(String(evidence.status||'')))evidence={...evidence,verified:true,proof_scope:'subject'};
      }
    }else if(t.executor==='distribution_autonomous'){
      evidence=await first(env,`SELECT result,created_at FROM distribution_qualification_events WHERE surface_slug=? AND created_at>=? ORDER BY created_at DESC LIMIT 1`,[subject,created]);
      if(evidence)evidence={...evidence,verified:true};
    }else if(t.executor==='content_issue'){
      if(t.subject_type==='tool')evidence=await first(env,`SELECT brief_id,created_at FROM content_engine_briefs WHERE created_at>=? AND selected_tool_slug=? ORDER BY created_at DESC LIMIT 1`,[created,subject]);
      else if(t.subject_type==='search')evidence=await first(env,`SELECT brief_id,created_at FROM content_engine_briefs WHERE created_at>=? AND target_json LIKE ? ORDER BY created_at DESC LIMIT 1`,[created,`%${subject.replaceAll('%','')}%`]);
      else evidence=await first(env,`SELECT brief_id,created_at FROM content_engine_briefs WHERE created_at>=? ORDER BY created_at DESC LIMIT 1`,[created]);
      if(evidence)evidence={...evidence,verified:true};
    }else if(t.executor==='audience_make'&&t.source_kind==='supervisor'){
      evidence=await first(env,`SELECT event_id,event_type,created_at,post_uri FROM audience_events WHERE status='published' AND event_type='outbound_reply' AND created_at>=COALESCE(?,?) ORDER BY created_at ASC LIMIT 1`,[sqlTime(t.claimed_at),created]);
      if(evidence)evidence={...evidence,verified:true,proof_scope:'single_inflight_supervisor_task'};
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
      const proof=await recordExecutionProof(env,{taskId:t.task_id,executor:t.executor,status:'verified',detail:'execution_verified',evidence});
      if(proof?.ok)verified++;
      continue;
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
  const [states,executors,missing,stalled,ages,stalledReasons,stalledTasks,activeClaims]=await Promise.all([
    all(env,`SELECT status,COUNT(*) n FROM growth_execution_contract GROUP BY status`),
    all(env,`SELECT executor,status,COUNT(*) n FROM growth_execution_contract GROUP BY executor,status ORDER BY executor,status`),
    first(env,`SELECT COUNT(*) n FROM growth_execution_contract WHERE status='executor_missing'`),
    first(env,`SELECT COUNT(*) n FROM growth_execution_contract WHERE status='stalled'`),
    first(env,`SELECT
      MIN(CASE WHEN status='pending' THEN updated_at END) oldest_pending,
      MIN(CASE WHEN status='claimed' THEN claimed_at END) oldest_claimed,
      MIN(CASE WHEN status='attempted' THEN attempted_at END) oldest_attempted
      FROM growth_execution_contract`),
    all(env,`SELECT executor,last_result,COUNT(*) n,MAX(attempts) max_attempts,MIN(updated_at) oldest_updated_at
      FROM growth_execution_contract
      WHERE status='stalled'
      GROUP BY executor,last_result
      ORDER BY n DESC,executor,last_result`),
    all(env,`SELECT task_id,source_kind,opportunity_key,subject_type,subject_key,action,executor,attempts,last_result,created_at,updated_at,claim_deadline,attempt_deadline,verify_deadline
      FROM growth_execution_contract
      WHERE status='stalled'
      ORDER BY priority_score DESC,updated_at ASC
      LIMIT 60`),
    all(env,`SELECT task_id,source_kind,opportunity_key,subject_type,subject_key,action,executor,status,attempts,last_result,claimed_at,attempted_at,claim_deadline,attempt_deadline,verify_deadline
      FROM growth_execution_contract
      WHERE status IN ('claimed','attempted')
      ORDER BY claimed_at ASC
      LIMIT 30`)
  ]);
  const ageHours=value=>{if(!value)return null;const t=Date.parse(String(value).replace(' ','T')+'Z');return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):null};
  const stateMap=Object.fromEntries(states.map(x=>[x.status,n(x.n)]));
  return{
    integrityVersion:'task-specific-v2',
    states:stateMap,
    executors,
    missingExecutors:n(missing?.n),
    stalled:n(stalled?.n),
    ready:n(stateMap.pending),
    inFlight:n(stateMap.claimed)+n(stateMap.attempted),
    deferred:n(stateMap.deferred),
    oldestPendingAgeHours:ageHours(ages?.oldest_pending),
    oldestClaimedAgeHours:ageHours(ages?.oldest_claimed),
    oldestAttemptedAgeHours:ageHours(ages?.oldest_attempted),
    stalledReasons:(stalledReasons||[]).map(x=>({...x,n:n(x.n),max_attempts:n(x.max_attempts),oldest_age_hours:ageHours(x.oldest_updated_at)})),
    stalledTasks:(stalledTasks||[]).map(x=>({...x,age_hours:ageHours(x.updated_at)})),
    activeClaims:(activeClaims||[]).map(x=>({...x,claim_age_hours:ageHours(x.claimed_at),attempt_age_hours:ageHours(x.attempted_at)}))
  };
}
