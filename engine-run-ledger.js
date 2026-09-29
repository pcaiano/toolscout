let schemaReady=null;

const CYCLE_OWNED_MISSIONS=new Map([
  ['distribution:autonomous_cycle',{minutes:15,anchorMinute:4}],
  ['distribution:network_cycle',{minutes:120,anchorMinute:15}],
  ['growth:execution_contract',{minutes:60,anchorMinute:15}],
  ['growth:opportunity_coordination',{minutes:60,anchorMinute:15}]
]);
const CYCLE_STALE_TAKEOVER_MINUTES=30;
const MISSION_CYCLE_AT_HEADER='X-ToolScout-Scheduled-Cycle-At';
const MISSION_CYCLE_OWNER_HEADER='X-ToolScout-Cycle-Owner';


export function missionCycleContext(engine,mission,now=Date.now()){
  const spec=CYCLE_OWNED_MISSIONS.get(`${String(engine||'unknown')}:${String(mission||'unknown')}`);
  if(!spec)return null;
  const minutes=Math.max(1,Number(spec.minutes)||60);
  const anchorMinute=Math.max(0,Math.min(59,Number(spec.anchorMinute)||0));
  const spanMs=minutes*60000,anchorMs=anchorMinute*60000;
  const bucket=Math.floor((Number(now)-anchorMs)/spanMs);
  const startMs=bucket*spanMs+anchorMs,endMs=startMs+spanMs;
  return {
    key:`${minutes}m@${String(anchorMinute).padStart(2,'0')}:${bucket}`,
    minutes,anchorMinute,
    startsAt:new Date(startMs).toISOString(),
    endsAt:new Date(endMs).toISOString()
  };
}

export function missionCycleHeaders(event,owner){
  const scheduledTime=Number(event?.scheduledTime);
  const at=new Date(Number.isFinite(scheduledTime)&&scheduledTime>0?scheduledTime:Date.now()).toISOString();
  return {
    [MISSION_CYCLE_AT_HEADER]:at,
    [MISSION_CYCLE_OWNER_HEADER]:String(owner||'scheduled_runtime').slice(0,120)
  };
}

export function missionCycleContextFromRequest(request,engine,mission){
  const raw=request?.headers?.get?.(MISSION_CYCLE_AT_HEADER);
  if(!raw)return null;
  const at=Date.parse(raw);
  return Number.isFinite(at)?missionCycleContext(engine,mission,at):null;
}

export function missionCycleOwnerFromRequest(request,fallback=null){
  const owner=request?.headers?.get?.(MISSION_CYCLE_OWNER_HEADER);
  return owner?String(owner).slice(0,120):(fallback==null?null:String(fallback).slice(0,120));
}

export function copyMissionCycleHeaders(fromRequest,toHeaders){
  for(const name of [MISSION_CYCLE_AT_HEADER,MISSION_CYCLE_OWNER_HEADER]){
    const value=fromRequest?.headers?.get?.(name);
    if(value)toHeaders.set(name,value);
  }
  return toHeaders;
}


export async function ensureEngineRunSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    const requiredTables=['engine_runs','engine_run_leases','engine_cycle_claims'];
    const requiredIndexes=[
      'idx_engine_runs_engine_started',
      'idx_engine_runs_status_started',
      'idx_engine_runs_started',
      'idx_engine_cycle_claims_updated'
    ];
    const tableMarks=requiredTables.map(()=>'?').join(',');
    const indexMarks=requiredIndexes.map(()=>'?').join(',');
    const [tables,indexes]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN (${tableMarks})`).bind(...requiredTables).first(),
      env.DB.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN (${indexMarks})`).bind(...requiredIndexes).first()
    ]);
    const tableCount=Number(tables?.n||0),indexCount=Number(indexes?.n||0);
    if(tableCount!==requiredTables.length||indexCount!==requiredIndexes.length){
      throw new Error(`engine_run_ledger_schema_not_migrated:tables_${tableCount}/${requiredTables.length}:indexes_${indexCount}/${requiredIndexes.length}`);
    }
    return{ok:true,source:'d1_migrations',tables:tableCount,indexes:indexCount};
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}

async function acquireMissionCycleClaim(env,{runId,engine,mission,triggerName=null,cycleContext=null,cycleOwner=null}){
  const cycle=cycleContext;
  if(!cycle?.key)return null;
  const e=String(engine||'unknown'),m=String(mission||'unknown'),owner=String(cycleOwner||triggerName||'unspecified').slice(0,120);
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO engine_cycle_claims(engine,mission,cycle_key,owner,run_id,status,attempts,acquired_at,updated_at)
    VALUES(?,?,?,?,?,'running',1,datetime('now'),datetime('now'))`).bind(e,m,cycle.key,owner,runId).run();
  if(Number(inserted?.meta?.changes||inserted?.changes||0)>0)return{owned:true,recovered:false,cycle,owner,runId,status:'running'};

  let existing=await env.DB.prepare(`SELECT owner,run_id,status,attempts,acquired_at,completed_at,updated_at
    FROM engine_cycle_claims WHERE engine=? AND mission=? AND cycle_key=?`).bind(e,m,cycle.key).first();

  if(existing?.status==='failed'||(existing?.status==='running'&&existing?.acquired_at)){
    const staleTakeoverMinutes=Math.max(5,Math.min(CYCLE_STALE_TAKEOVER_MINUTES,Math.max(5,Number(cycle.minutes||60)-3)));
    const takeover=await env.DB.prepare(`UPDATE engine_cycle_claims
      SET owner=?,run_id=?,status='running',attempts=attempts+1,acquired_at=datetime('now'),completed_at=NULL,updated_at=datetime('now')
      WHERE engine=? AND mission=? AND cycle_key=?
        AND (status='failed' OR (status='running' AND acquired_at<=datetime('now', ?)))`)
      .bind(owner,runId,e,m,cycle.key,`-${staleTakeoverMinutes} minutes`).run();
    if(Number(takeover?.meta?.changes||takeover?.changes||0)>0){
      return{owned:true,recovered:true,cycle,owner,runId,status:'running',previousOwner:existing?.owner||null,previousRunId:existing?.run_id||null};
    }
    existing=await env.DB.prepare(`SELECT owner,run_id,status,attempts,acquired_at,completed_at,updated_at
      FROM engine_cycle_claims WHERE engine=? AND mission=? AND cycle_key=?`).bind(e,m,cycle.key).first();
  }

  return{owned:false,recovered:false,cycle,owner:existing?.owner||null,runId:existing?.run_id||null,status:existing?.status||'unknown',attempts:Number(existing?.attempts||0),acquiredAt:existing?.acquired_at||null,completedAt:existing?.completed_at||null};
}

async function completeMissionCycleClaim(env,claim,runId){
  if(!claim?.owned||!claim?.cycle)return;
  await env.DB.prepare(`UPDATE engine_cycle_claims SET status='completed',completed_at=datetime('now'),updated_at=datetime('now')
    WHERE engine=? AND mission=? AND cycle_key=? AND run_id=?`)
    .bind(claim.engine,claim.mission,claim.cycle.key,runId).run().catch(()=>{});
}

async function failMissionCycleClaim(env,claim,runId){
  if(!claim?.owned||!claim?.cycle)return;
  await env.DB.prepare(`UPDATE engine_cycle_claims SET status='failed',completed_at=datetime('now'),updated_at=datetime('now')
    WHERE engine=? AND mission=? AND cycle_key=? AND run_id=?`)
    .bind(claim.engine,claim.mission,claim.cycle.key,runId).run().catch(()=>{});
}

function safeJson(value){
  try{return JSON.stringify(value??null).slice(0,12000)}catch{return JSON.stringify({unserializable:true})}
}

export async function recordEngineRun(env,{runId,engine,mission,triggerName=null,status,detail=null,evidence=null,startedAt=null,completedAt=null}){
  await ensureEngineRunSchema(env);
  const id=String(runId||`run_${crypto.randomUUID()}`);
  await env.DB.prepare(`INSERT INTO engine_runs(run_id,engine,mission,trigger_name,status,started_at,completed_at,detail,evidence_json,created_at,updated_at)
    VALUES(?,?,?,?,?,COALESCE(?,datetime('now')),?,?,?,?,datetime('now'))
    ON CONFLICT(run_id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,detail=excluded.detail,evidence_json=excluded.evidence_json,updated_at=datetime('now')`)
    .bind(id,String(engine||'unknown'),String(mission||'unknown'),triggerName==null?null:String(triggerName),String(status||'unknown'),startedAt,completedAt,detail==null?null:String(detail).slice(0,4000),safeJson(evidence),new Date().toISOString().replace('T',' ').slice(0,19))
    .run();
  return id;
}

async function reconcileExpiredSingleFlightRuns(env,{engine=null,mission=null}={}){
  try{
    const where=engine&&mission?'AND r.engine=? AND r.mission=?':'';
    const stmt=env.DB.prepare(`UPDATE engine_runs AS r
      SET status='failed',completed_at=datetime('now'),detail='single_flight_lease_expired',
          evidence_json='{"reason":"single_flight_lease_expired","ownership":"no_active_lease"}',updated_at=datetime('now')
      WHERE r.status='running'
        AND r.evidence_json LIKE '%"single_flight":true%'
        ${where}
        AND NOT EXISTS (
          SELECT 1 FROM engine_run_leases l
          WHERE l.engine=r.engine AND l.mission=r.mission AND l.run_id=r.run_id
            AND l.expires_at>datetime('now')
        )`);
    const out=engine&&mission?await stmt.bind(engine,mission).run():await stmt.run();
    return Number(out?.meta?.changes||out?.changes||0);
  }catch{return 0}
}

async function reconcileStaleRunOwnership(env){
  try{
    const expiredSingleFlightRuns=await reconcileExpiredSingleFlightRuns(env);
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE engine_cycle_claims
        SET status='failed',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now')
        WHERE status='running'
          AND EXISTS (
            SELECT 1 FROM engine_runs r
            WHERE r.run_id=engine_cycle_claims.run_id
              AND r.status='failed'
              AND r.completed_at IS NOT NULL
          )`),
      env.DB.prepare(`DELETE FROM engine_run_leases WHERE expires_at<=datetime('now')`)
    ]);
    return{
      failedClaims:Number(results?.[0]?.meta?.changes||results?.[0]?.changes||0),
      expiredLeases:Number(results?.[1]?.meta?.changes||results?.[1]?.changes||0),
      expiredSingleFlightRuns
    };
  }catch{return{failedClaims:0,expiredLeases:0}}
}

export async function reapStaleEngineRuns(env,minutes=120){
  await ensureEngineRunSchema(env);
  try{
    const r=await env.DB.prepare(`UPDATE engine_runs
      SET status='failed',completed_at=datetime('now'),detail='stale_run_abandoned',evidence_json='{"reason":"stale_run_abandoned"}',updated_at=datetime('now')
      WHERE status='running' AND started_at<datetime('now', ?)`)
      .bind(`-${Math.max(30,Number(minutes)||120)} minutes`).run();
    await reconcileStaleRunOwnership(env);
    return Number(r?.meta?.changes||r?.changes||0);
  }catch{return 0}
}

export async function runWithLedger(env,{engine,mission,triggerName=null,singleFlightMinutes=0,cycleContext=null,cycleOwner=null},fn){
  await reapStaleEngineRuns(env,120);
  await ensureEngineRunSchema(env);
  const runId=`run_${crypto.randomUUID()}`;
  const e=String(engine||'unknown'),m=String(mission||'unknown');
  const singleFlight=Math.max(0,Number(singleFlightMinutes)||0);
  let leased=false,cycleClaim=null;

  if(singleFlight>0){
    // Ownership truth is lease-based. If a single-flight run no longer owns an
    // unexpired lease, close the stale ledger row before admitting a successor.
    await reconcileExpiredSingleFlightRuns(env,{engine:e,mission:m});
    // A prior run older than its lease plus a small grace period cannot still
    // legitimately own the mission. Close it before acquiring the next lease
    // so observability never leaves orphaned "running" rows for hours.
    const staleMinutes=singleFlight+5;
    await env.DB.prepare(`UPDATE engine_runs
      SET status='failed',completed_at=datetime('now'),detail='single_flight_lease_expired',
          evidence_json='{"reason":"single_flight_lease_expired"}',updated_at=datetime('now')
      WHERE engine=? AND mission=? AND status='running' AND started_at<datetime('now', ?)`)
      .bind(e,m,`-${staleMinutes} minutes`).run().catch(()=>{});
    await reconcileStaleRunOwnership(env);

    await env.DB.prepare(`DELETE FROM engine_run_leases WHERE engine=? AND mission=? AND expires_at<=datetime('now')`).bind(e,m).run().catch(()=>{});
    const expiresAt=new Date(Date.now()+singleFlight*60000).toISOString().replace('T',' ').slice(0,19);
    const lease=await env.DB.prepare(`INSERT OR IGNORE INTO engine_run_leases(engine,mission,run_id,acquired_at,expires_at) VALUES(?,?,?,datetime('now'),?)`)
      .bind(e,m,runId,expiresAt).run();
    leased=Number(lease?.meta?.changes||lease?.changes||0)>0;
    if(!leased){
      const active=await env.DB.prepare(`SELECT run_id,acquired_at,expires_at FROM engine_run_leases WHERE engine=? AND mission=?`).bind(e,m).first();
      return{ok:true,skipped:true,reason:'mission_already_running',activeRunId:active?.run_id||null,activeAcquiredAt:active?.acquired_at||null,activeExpiresAt:active?.expires_at||null};
    }
  }

  cycleClaim=await acquireMissionCycleClaim(env,{runId,engine:e,mission:m,triggerName,cycleContext,cycleOwner});
  if(cycleClaim&&!cycleClaim.owned){
    if(leased)await env.DB.prepare(`DELETE FROM engine_run_leases WHERE engine=? AND mission=? AND run_id=?`).bind(e,m,runId).run().catch(()=>{});
    return{
      ok:true,skipped:true,
      reason:cycleClaim.status==='completed'?'mission_cycle_completed':'mission_cycle_owned',
      cycleKey:cycleClaim.cycle?.key||null,
      cycleStartsAt:cycleClaim.cycle?.startsAt||null,
      cycleEndsAt:cycleClaim.cycle?.endsAt||null,
      cycleOwner:cycleClaim.owner||null,
      activeRunId:cycleClaim.runId||null,
      cycleStatus:cycleClaim.status||null
    };
  }
  if(cycleClaim){cycleClaim.engine=e;cycleClaim.mission=m}

  const startedAt=new Date().toISOString().replace('T',' ').slice(0,19);
  try{
    await recordEngineRun(env,{runId,engine:e,mission:m,triggerName,status:'running',startedAt,evidence:{phase:'started',single_flight:singleFlight>0,cycle_key:cycleClaim?.cycle?.key||null,cycle_owner:cycleClaim?.owner||null,cycle_recovered:Boolean(cycleClaim?.recovered)}});
    const result=await fn();
    const explicitFailure=result&&result.ok===false;
    const status=explicitFailure?'degraded':'completed';
    const finalEvidence=result&&typeof result==='object'&&!Array.isArray(result)
      ?{...result,_cycle:{key:cycleClaim?.cycle?.key||null,owner:cycleClaim?.owner||null,recovered:Boolean(cycleClaim?.recovered)}}
      :{result,_cycle:{key:cycleClaim?.cycle?.key||null,owner:cycleClaim?.owner||null,recovered:Boolean(cycleClaim?.recovered)}};
    await recordEngineRun(env,{runId,engine:e,mission:m,triggerName,status,startedAt,completedAt:new Date().toISOString().replace('T',' ').slice(0,19),detail:explicitFailure?(result.reason||'Mission returned ok=false'):'Mission completed',evidence:finalEvidence});
    if(explicitFailure){const error=new Error(result.reason||`${e}:${m} returned ok=false`);error.engineResult=result;throw error}
    await completeMissionCycleClaim(env,cycleClaim,runId);
    return result;
  }catch(error){
    await recordEngineRun(env,{runId,engine:e,mission:m,triggerName,status:'failed',startedAt,completedAt:new Date().toISOString().replace('T',' ').slice(0,19),detail:String(error?.message||error),evidence:{name:error?.name||'Error',message:String(error?.message||error),_cycle:{key:cycleClaim?.cycle?.key||null,owner:cycleClaim?.owner||null,recovered:Boolean(cycleClaim?.recovered)}}}).catch(()=>{});
    await failMissionCycleClaim(env,cycleClaim,runId);
    throw error;
  }finally{
    if(leased)await env.DB.prepare(`DELETE FROM engine_run_leases WHERE engine=? AND mission=? AND run_id=?`).bind(e,m,runId).run().catch(()=>{});
  }
}

export async function latestEngineRuns(env){
  await ensureEngineRunSchema(env);
  const q=await env.DB.prepare(`SELECT r.* FROM engine_runs r JOIN (SELECT engine,MAX(started_at) started_at FROM engine_runs GROUP BY engine) x ON x.engine=r.engine AND x.started_at=r.started_at ORDER BY r.engine`).all();
  return q.results||[];
}
