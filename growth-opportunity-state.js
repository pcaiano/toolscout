let schemaReady=null;

export async function ensureGrowthOpportunitySchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_opportunity_state(
      opportunity_key TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      priority_score REAL NOT NULL DEFAULT 0,
      signal_json TEXT NOT NULL,
      action_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_opportunity_priority ON growth_opportunity_state(status,priority_score DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_opportunity_subject ON growth_opportunity_state(subject_type,subject_key)`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}

function safeJson(value){
  try{return JSON.stringify(value??null).slice(0,16000)}catch{return JSON.stringify({unserializable:true})}
}

export async function upsertGrowthOpportunity(env,{key,type,subject,score=0,signals={},actions=[],status='active'}){
  await ensureGrowthOpportunitySchema(env);
  const priority=Math.max(0,Math.min(100,Number(score||0)));
  await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
    VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
    ON CONFLICT(opportunity_key) DO UPDATE SET
      subject_type=excluded.subject_type,
      subject_key=excluded.subject_key,
      priority_score=excluded.priority_score,
      signal_json=excluded.signal_json,
      action_json=excluded.action_json,
      status=excluded.status,
      last_evaluated_at=datetime('now'),
      updated_at=datetime('now')`)
    .bind(String(key),String(type),String(subject),priority,safeJson(signals),safeJson(actions),String(status)).run();
  return {key:String(key),priority,status:String(status)};
}

export async function setGrowthOpportunityStatus(env,key,status){
  await ensureGrowthOpportunitySchema(env);
  await env.DB.prepare(`UPDATE growth_opportunity_state SET status=?,last_evaluated_at=datetime('now'),updated_at=datetime('now') WHERE opportunity_key=?`).bind(String(status),String(key)).run();
}
