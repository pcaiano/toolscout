import base from './mission-integrity-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const PROOF_SHA256='87c22cb2e3aab0b81431781fb86df292ca8e6a1dfab309ab73413c5c532ba718';
const CONTENT_STAGES=new Set(['linkedin','bluesky','x']);
let schemaReady=null;

async function digestHex(value){const bytes=new TextEncoder().encode(String(value||''));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authorized(request){const proof=String(request.headers.get('X-ToolScout-Proof')||'');return Boolean(proof)&&await digestHex(proof)===PROOF_SHA256}
async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS external_engine_evidence (evidence_id TEXT PRIMARY KEY,engine TEXT NOT NULL,mission_id TEXT NOT NULL,stage TEXT NOT NULL,status TEXT NOT NULL,external_id TEXT,detail TEXT,observed_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_external_engine_evidence_engine_mission ON external_engine_evidence(engine,mission_id,created_at DESC)`)
  ])})().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
function safe(value,n=2000){return String(value??'').slice(0,n)}
function parseUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
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
  await env.DB.prepare(`INSERT INTO external_engine_evidence(evidence_id,engine,mission_id,stage,status,external_id,detail,observed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(evidence_id) DO UPDATE SET status=excluded.status,external_id=excluded.external_id,detail=excluded.detail,observed_at=excluded.observed_at,updated_at=datetime('now') WHERE excluded.observed_at>=external_engine_evidence.observed_at AND NOT (external_engine_evidence.status='completed' AND excluded.status='queued')`).bind(evidenceId,engine,missionId,stage,effectiveStatus,externalId||null,detail||null,when.toISOString()).run();
  return Response.json({ok:true,verified:effectiveStatus==='completed',evidence_id:evidenceId,mission_id:missionId,stage,status:effectiveStatus,external_id:externalId},{headers:JSON_H});
}

export default {
  async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/api/engine-evidence'&&request.method==='POST')return ingestEvidence(request,env);return base.fetch(request,env,ctx)},
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};

