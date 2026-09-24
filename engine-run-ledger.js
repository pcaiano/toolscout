let schemaReady=null;

const CYCLE_OWNED_MISSIONS=new Map([
  ['distribution:autonomous_cycle',{minutes:60,anchorMinute:15}],
  ['distribution:network_cycle',{minutes:120,anchorMinute:15}],
  ['growth:execution_contract',{minutes:60,anchorMinute:15}],
  ['growth:opportunity_coordination',{minutes:60,anchorMinute:15}]
]);
const CYCLE_STALE_TAKEOVER_MINUTES=30;

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


export async function ensureEngineRunSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS engine_runs (
        run_id TEXT PRIMARY KEY,
        engine TEXT NOT NULL,
        mission TEXT NOT NULL,
        trigger_name TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        detail TEXT,
        evidence_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_engine_runs_engine_started ON engine_runs(engine,started_at DESC)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_engine_runs_status_started ON engine_runs(status,started_at DESC)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_engine_runs_started ON engine_runs(started_at DESC)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS engine_run_leases (
        engine TEXT NOT NULL,
        mission TEXT NOT NULL,
        run_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        PRIMARY KEY(engine,mission)
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS engine_cycle_claims (
        engine TEXT NOT NULL,
        mission TEXT NOT NULL,
        cycle_key TEXT NOT NULL,
        owner TEXT NOT NULL,
        run_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        attempts INTEGER NOT NULL DEFAULT 1,
        acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(engine,mission,cycle_key)
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_engine_cycle_claims_updated ON engine_cycle_claims(updated_at DESC)`)
    ]);
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
    const takeover=await env.DB.prepare(`UPDATE engine_cycle_claims
      SET owner=?,run_id=?,status='running',attempts=attempts+1,acquired_at=datetime('now'),completed_at=NULL,updated_at=datetime('now')
      WHERE engine=? AND mission=? AND cycle_key=?
        AND (status='failed' OR (status='running' AND acquired_at<=datetime('now', ?)))`)
      .bind(owner,runId,e,m,cycle.key,`-${CYCLE_STALE_TAKEOVER_MINUTES} minutes`).run();
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

export async function reapStaleEngineRuns(env,minutes=120){
  await ensureEngineRunSchema(env);
  try{
    const r=await env.DB.prepare(`UPDATE engine_runs
      SET status='failed',completed_at=datetime('now'),detail='stale_run_abandoned',evidence_json='{"reason":"stale_run_abandoned"}',updated_at=datetime('now')
      WHERE status='running' AND started_at<datetime('now', ?)`)
      .bind(`-${Math.max(30,Number(minutes)||120)} minutes`).run();
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
    // A prior run older than its lease plus a small grace period cannot still
    // legitimately own the mission. Close it before acquiring the next lease
    // so observability never leaves orphaned "running" rows for hours.
    const staleMinutes=singleFlight+5;
    await env.DB.prepare(`UPDATE engine_runs
      SET status='failed',completed_at=datetime('now'),detail='single_flight_lease_expired',
          evidence_json='{"reason":"single_flight_lease_expired"}',updated_at=datetime('now')
      WHERE engine=? AND mission=? AND status='running' AND started_at<datetime('now', ?)`)
      .bind(e,m,`-${staleMinutes} minutes`).run().catch(()=>{});

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
