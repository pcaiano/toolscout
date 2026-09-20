let schemaReady=null;

function safe(v,n=4000){return String(v??'').slice(0,n)}
function json(v){try{return JSON.stringify(v??null)}catch{return null}}
function normalizeUrl(value){
  try{
    const u=new URL(String(value||''));
    return u.protocol==='https:'?u.toString():null;
  }catch{return null}
}

export async function ensureHumanGateSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS human_gate_contract(
      gate_key TEXT PRIMARY KEY,
      engine TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      gate_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      title TEXT,
      reason TEXT,
      instructions TEXT,
      action_url TEXT,
      resolution_mode TEXT NOT NULL DEFAULT 'verify_publication',
      payload_json TEXT,
      result_url TEXT,
      verification_url TEXT,
      verification_attempts INTEGER NOT NULL DEFAULT 0,
      next_verification_at TEXT,
      owner_completed_at TEXT,
      resolved_at TEXT,
      last_verification_at TEXT,
      verification_detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_human_gate_status ON human_gate_contract(status,next_verification_at,updated_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_human_gate_subject ON human_gate_contract(engine,subject_type,subject_key)`)
  ]);
  await schemaReady;
  return true;
}

export function humanGateKey(engine,subjectType,subjectKey){
  return `${safe(engine,40)}:${safe(subjectType,80)}:${safe(subjectKey,180)}`;
}

export async function upsertHumanGate(env,{
  engine,
  subjectType='surface',
  subjectKey,
  gateType='human_confirmation',
  title=null,
  reason=null,
  instructions=null,
  actionUrl=null,
  resolutionMode='verify_publication',
  payload=null,
  verificationUrl=null
}){
  await ensureHumanGateSchema(env);
  const gateKey=humanGateKey(engine,subjectType,subjectKey);
  const action=normalizeUrl(actionUrl);
  const verification=normalizeUrl(verificationUrl);
  await env.DB.prepare(`INSERT INTO human_gate_contract(
      gate_key,engine,subject_type,subject_key,gate_type,status,title,reason,instructions,action_url,
      resolution_mode,payload_json,verification_url,verification_attempts,next_verification_at,
      owner_completed_at,resolved_at,last_verification_at,verification_detail,created_at,updated_at
    ) VALUES(?,?,?,?,?,'open',?,?,?,?,?,?,?,0,NULL,NULL,NULL,NULL,NULL,datetime('now'),datetime('now'))
    ON CONFLICT(gate_key) DO UPDATE SET
      gate_type=excluded.gate_type,
      status=CASE
        WHEN human_gate_contract.status IN ('resolved','cancelled') THEN 'open'
        ELSE human_gate_contract.status
      END,
      title=COALESCE(excluded.title,human_gate_contract.title),
      reason=COALESCE(excluded.reason,human_gate_contract.reason),
      instructions=COALESCE(excluded.instructions,human_gate_contract.instructions),
      action_url=COALESCE(excluded.action_url,human_gate_contract.action_url),
      resolution_mode=excluded.resolution_mode,
      payload_json=COALESCE(excluded.payload_json,human_gate_contract.payload_json),
      verification_url=COALESCE(excluded.verification_url,human_gate_contract.verification_url),
      updated_at=datetime('now')
    WHERE human_gate_contract.status IN ('resolved','cancelled')
       OR human_gate_contract.gate_type IS NOT excluded.gate_type
       OR (excluded.title IS NOT NULL AND human_gate_contract.title IS NOT excluded.title)
       OR (excluded.reason IS NOT NULL AND human_gate_contract.reason IS NOT excluded.reason)
       OR (excluded.instructions IS NOT NULL AND human_gate_contract.instructions IS NOT excluded.instructions)
       OR (excluded.action_url IS NOT NULL AND human_gate_contract.action_url IS NOT excluded.action_url)
       OR human_gate_contract.resolution_mode IS NOT excluded.resolution_mode
       OR (excluded.payload_json IS NOT NULL AND human_gate_contract.payload_json IS NOT excluded.payload_json)
       OR (excluded.verification_url IS NOT NULL AND human_gate_contract.verification_url IS NOT excluded.verification_url)`)
    .bind(
      gateKey,safe(engine,40),safe(subjectType,80),safe(subjectKey,180),safe(gateType,80),
      title?safe(title,500):null,reason?safe(reason,1600):null,instructions?safe(instructions,3000):null,
      action,safe(resolutionMode,80),payload==null?null:json(payload),verification
    ).run();
  return gateKey;
}

export async function listOpenHumanGates(env,{engine=null,limit=40}={}){
  await ensureHumanGateSchema(env);
  const capped=Math.max(1,Math.min(100,Number(limit)||40));
  if(engine){
    const q=await env.DB.prepare(`SELECT * FROM human_gate_contract
      WHERE engine=? AND status='open'
      ORDER BY updated_at DESC LIMIT ${capped}`).bind(engine).all();
    return q.results||[];
  }
  const q=await env.DB.prepare(`SELECT * FROM human_gate_contract
    WHERE status='open'
    ORDER BY updated_at DESC LIMIT ${capped}`).all();
  return q.results||[];
}

export async function markHumanGateOwnerComplete(env,gateKey,{resultUrl=null}={}){
  await ensureHumanGateSchema(env);
  const row=await env.DB.prepare(`SELECT * FROM human_gate_contract WHERE gate_key=? LIMIT 1`).bind(gateKey).first();
  if(!row)return {ok:false,error:'gate_not_found'};
  if(row.status==='resolved')return {ok:true,unchanged:true,row};
  const result=normalizeUrl(resultUrl);
  await env.DB.prepare(`UPDATE human_gate_contract
    SET status='verification_pending',
        result_url=COALESCE(?,result_url),
        owner_completed_at=COALESCE(owner_completed_at,datetime('now')),
        next_verification_at=datetime('now'),
        verification_detail='owner_completed_waiting_autonomous_verification',
        updated_at=datetime('now')
    WHERE gate_key=?`).bind(result,gateKey).run();
  return {ok:true,row:{...row,status:'verification_pending',result_url:result||row.result_url||null}};
}

export async function dueHumanGateVerifications(env,{engine='distribution',limit=12}={}){
  await ensureHumanGateSchema(env);
  const capped=Math.max(1,Math.min(50,Number(limit)||12));
  const q=await env.DB.prepare(`SELECT * FROM human_gate_contract
    WHERE engine=?
      AND status='verification_pending'
      AND (next_verification_at IS NULL OR next_verification_at<=datetime('now'))
    ORDER BY owner_completed_at ASC,updated_at ASC
    LIMIT ${capped}`).bind(engine).all();
  return q.results||[];
}

export async function deferHumanGateVerification(env,gateKey,{detail=null,hours=6}={}){
  await ensureHumanGateSchema(env);
  const h=Math.max(1,Math.min(48,Number(hours)||6));
  await env.DB.prepare(`UPDATE human_gate_contract
    SET verification_attempts=verification_attempts+1,
        last_verification_at=datetime('now'),
        next_verification_at=datetime('now','+${h} hours'),
        verification_detail=?,
        updated_at=datetime('now')
    WHERE gate_key=?`).bind(detail?safe(detail,1800):'verification_not_yet_confirmed',gateKey).run();
}

export async function resolveHumanGate(env,gateKey,{resultUrl=null,detail=null}={}){
  await ensureHumanGateSchema(env);
  const result=normalizeUrl(resultUrl);
  await env.DB.prepare(`UPDATE human_gate_contract
    SET status='resolved',
        result_url=COALESCE(?,result_url),
        verification_attempts=verification_attempts+1,
        next_verification_at=NULL,
        last_verification_at=datetime('now'),
        verification_detail=?,
        resolved_at=datetime('now'),
        updated_at=datetime('now')
    WHERE gate_key=?`).bind(result,detail?safe(detail,1800):'autonomous_verification_confirmed',gateKey).run();
}

export async function reopenHumanGate(env,gateKey,{reason=null,instructions=null}={}){
  await ensureHumanGateSchema(env);
  await env.DB.prepare(`UPDATE human_gate_contract
    SET status='open',
        reason=COALESCE(?,reason),
        instructions=COALESCE(?,instructions),
        next_verification_at=NULL,
        verification_detail='verification_exhausted_owner_followup_required',
        updated_at=datetime('now')
    WHERE gate_key=?`)
    .bind(reason?safe(reason,1600):null,instructions?safe(instructions,3000):null,gateKey).run();
}

export async function humanGateSnapshot(env){
  await ensureHumanGateSchema(env);
  const q=await env.DB.prepare(`SELECT status,engine,COUNT(*) n
    FROM human_gate_contract GROUP BY status,engine ORDER BY engine,status`).all();
  const rows=q.results||[];
  const totals={};
  for(const row of rows){
    const engine=String(row.engine||'unknown'),status=String(row.status||'unknown');
    totals[engine]??={};
    totals[engine][status]=Number(row.n||0);
  }
  return {ok:true,byEngine:totals,rows};
}
