let schemaReady=null;

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
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_engine_runs_status_started ON engine_runs(status,started_at DESC)`)
    ]);
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
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

export async function runWithLedger(env,{engine,mission,triggerName=null},fn){
  await reapStaleEngineRuns(env,120);
  const runId=`run_${crypto.randomUUID()}`;
  const startedAt=new Date().toISOString().replace('T',' ').slice(0,19);
  await recordEngineRun(env,{runId,engine,mission,triggerName,status:'running',startedAt,evidence:{phase:'started'}});
  try{
    const result=await fn();
    const explicitFailure=result&&result.ok===false;
    const status=explicitFailure?'degraded':'completed';
    await recordEngineRun(env,{runId,engine,mission,triggerName,status,startedAt,completedAt:new Date().toISOString().replace('T',' ').slice(0,19),detail:explicitFailure?(result.reason||'Mission returned ok=false'):'Mission completed',evidence:result});
    if(explicitFailure){const error=new Error(result.reason||`${engine}:${mission} returned ok=false`);error.engineResult=result;throw error}
    return result;
  }catch(error){
    await recordEngineRun(env,{runId,engine,mission,triggerName,status:'failed',startedAt,completedAt:new Date().toISOString().replace('T',' ').slice(0,19),detail:String(error?.message||error),evidence:{name:error?.name||'Error',message:String(error?.message||error)}}).catch(()=>{});
    throw error;
  }
}

export async function latestEngineRuns(env){
  await ensureEngineRunSchema(env);
  const q=await env.DB.prepare(`SELECT r.* FROM engine_runs r JOIN (SELECT engine,MAX(started_at) started_at FROM engine_runs GROUP BY engine) x ON x.engine=r.engine AND x.started_at=r.started_at ORDER BY r.engine`).all();
  return q.results||[];
}
