import base from './command-center-integrity-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const TOKEN_SHA256='892037d8f0f5965150ee2a037675864d19dc15a2b98d212e2af9ea81911ae0cb';
const CONTENT_STAGES=new Set(['linkedin','bluesky','x']);
let schemaReady=null;

async function digestHex(value){const bytes=new TextEncoder().encode(String(value||''));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authorized(request){const token=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(token)&&await digestHex(token)===TOKEN_SHA256}
async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS external_engine_evidence (
      evidence_id TEXT PRIMARY KEY,
      engine TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT,
      detail TEXT,
      observed_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_external_engine_evidence_engine_mission ON external_engine_evidence(engine,mission_id,created_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_external_engine_evidence_created ON external_engine_evidence(created_at DESC)`)
  ])})().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
function safe(value,n=2000){return String(value??'').slice(0,n)}
function parseUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
function ageMinutes(value){const d=parseUtc(value);return d?Math.max(0,(Date.now()-d.getTime())/60000):null}

async function ingestEvidence(request,env){
  if(!await authorized(request))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
  let body;try{body=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_H})}
  const engine=safe(body?.engine,40).toLowerCase(),missionId=safe(body?.mission_id,160),stage=safe(body?.stage,40).toLowerCase(),status=safe(body?.status,40).toLowerCase(),externalId=safe(body?.external_id,500),detail=safe(body?.detail,2000),observedAt=safe(body?.observed_at,80)||new Date().toISOString();
  if(engine!=='content')return Response.json({error:'unsupported_engine'},{status:422,headers:JSON_H});
  if(!missionId||!CONTENT_STAGES.has(stage))return Response.json({error:'invalid_mission_or_stage'},{status:422,headers:JSON_H});
  if(!['completed','failed','queued'].includes(status))return Response.json({error:'invalid_status'},{status:422,headers:JSON_H});
  if(['completed','queued'].includes(status)&&!externalId)return Response.json({error:'completed_stage_requires_external_id'},{status:422,headers:JSON_H});
  // Buffer acceptance is not a vendor-confirmed X publication.
  const effectiveStatus=stage==='x'&&status==='completed'&&!/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+(?:[?#].*)?$/.test(externalId)?'queued':status;
  const when=parseUtc(observedAt);if(!when)return Response.json({error:'invalid_observed_at'},{status:422,headers:JSON_H});
  await ensureSchema(env);
  const evidenceId=`content:${missionId}:${stage}`;
  await env.DB.prepare(`INSERT INTO external_engine_evidence(evidence_id,engine,mission_id,stage,status,external_id,detail,observed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(evidence_id) DO UPDATE SET status=excluded.status,external_id=excluded.external_id,detail=excluded.detail,observed_at=excluded.observed_at,updated_at=datetime('now') WHERE excluded.observed_at>=external_engine_evidence.observed_at AND NOT (external_engine_evidence.status='completed' AND excluded.status='queued')`)
    .bind(evidenceId,engine,missionId,stage,effectiveStatus,externalId||null,detail||null,when.toISOString()).run();
  return Response.json({ok:true,verified:effectiveStatus==='completed',evidence_id:evidenceId,mission_id:missionId,stage,status:effectiveStatus,external_id:externalId},{headers:JSON_H});
}

export async function contentMissionHealth(env){
  await ensureSchema(env);
  const latest=await env.DB.prepare(`SELECT mission_id,MIN(observed_at) first_at,MAX(observed_at) last_at FROM external_engine_evidence WHERE engine='content' GROUP BY mission_id ORDER BY MAX(observed_at) DESC LIMIT 1`).first();
  if(!latest?.mission_id)return{status:'partial',last_run_at:null,mission_id:null,completed_stages:[],missing_stages:['linkedin','bluesky','x'],proof:'No multi-channel content mission has completed since mission evidence was enabled.'};
  const q=await env.DB.prepare(`SELECT stage,status,external_id,observed_at,created_at FROM external_engine_evidence WHERE engine='content' AND mission_id=? ORDER BY created_at ASC`).bind(latest.mission_id).all();
  const rows=q.results||[],completed=new Set(rows.filter(r=>r.status==='completed'&&r.external_id).map(r=>r.stage)),failed=rows.filter(r=>r.status==='failed'),missing=[...CONTENT_STAGES].filter(s=>!completed.has(s));
  const queued=rows.filter(r=>r.status==='queued');
  const lastAt=latest.last_at||rows.at(-1)?.created_at||null,age=ageMinutes(lastAt);
  let status='running';
  if(failed.length)status='failed';
  else if(missing.length===0)status=age!=null&&age>80*60?'stale':'healthy';
  else if(age!=null&&age>120)status='degraded';
  return{status,last_run_at:latest.first_at||null,last_completed_at:missing.length===0?lastAt:null,mission_id:latest.mission_id,completed_stages:[...completed],missing_stages:missing,failed_stages:failed.map(r=>r.stage),queued_stages:queued.map(r=>r.stage),age_minutes:age,proof:'external_engine_evidence with required external publication IDs; Buffer acceptance remains queued until a public X status URL is verified'};
}

function applyContentHealth(data,health){
  if(data.commandCenterIntegrity){data.commandCenterIntegrity.engines={...(data.commandCenterIntegrity.engines||{}),content:health};const prior=Array.isArray(data.commandCenterIntegrity.issues)?data.commandCenterIntegrity.issues.filter(x=>x.metric!=='engine:content'):[];if(['partial','degraded','failed','stale','unknown'].includes(health.status))prior.push({metric:'engine:content',severity:health.status==='failed'?'error':'warning',reason:health.status});data.commandCenterIntegrity.issues=prior;if(prior.some(x=>x.severity==='error'))data.commandCenterIntegrity.status='degraded';else if(prior.length)data.commandCenterIntegrity.status='warning';else data.commandCenterIntegrity.status='healthy'}
  if(data.measurementAudit){data.measurementAudit.engines={...(data.measurementAudit.engines||{}),content:health};const prior=Array.isArray(data.measurementAudit.issues)?data.measurementAudit.issues.filter(x=>x.metric!=='engine:content'):[];if(['partial','degraded','failed','stale','unknown'].includes(health.status))prior.push({metric:'engine:content',severity:health.status==='failed'?'error':'warning',reason:health.status});data.measurementAudit.issues=prior;if(prior.some(x=>x.severity==='error'))data.measurementAudit.status='degraded';else if(prior.length)data.measurementAudit.status='warning';else data.measurementAudit.status='healthy'}
  if(data.growthOps){data.growthOps.health={...(data.growthOps.health||{}),content:health};}
  return data;
}

async function augment(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const health=await contentMissionHealth(env);
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify(applyContentHealth(data,health)),{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/engine-evidence'&&request.method==='POST')return ingestEvidence(request,env);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/api/traffic-integrity-health'||url.pathname==='/analytics/api/stats'||url.pathname==='/api/stats'))return augment(response,env);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};

