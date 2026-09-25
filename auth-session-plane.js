import {upsertHumanGate,resolveHumanGate,reopenHumanGate} from './human-gate-contract.js';

const TEXT=new TextEncoder();
const DECODER=new TextDecoder();
const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
let schemaReady=null;

const safe=(v,n=4000)=>String(v??'').slice(0,n);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
function httpsUrl(value){
  try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password?u.toString():null}catch{return null}
}
function domainOf(value){try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function bytesToB64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function b64ToBytes(value){const s=atob(String(value||''));return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function sha256(value){const d=await crypto.subtle.digest('SHA-256',TEXT.encode(String(value||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function vaultKey(env){
  if(!env.ADMIN_TOKEN)throw new Error('auth_vault_secret_missing');
  const digest=await crypto.subtle.digest('SHA-256',TEXT.encode('toolscout-auth-vault-v1:'+env.ADMIN_TOKEN));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encryptState(env,domain,state){
  const key=await vaultKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=TEXT.encode(JSON.stringify(state||{}));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:TEXT.encode(domain)},key,plain);
  return{ciphertext:bytesToB64(new Uint8Array(cipher)),iv:bytesToB64(iv)};
}
async function decryptState(env,domain,row){
  if(!row?.ciphertext||!row?.iv)return null;
  const key=await vaultKey(env);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(row.iv),additionalData:TEXT.encode(domain)},key,b64ToBytes(row.ciphertext));
  return JSON.parse(DECODER.decode(plain));
}
async function config(env,key){
  try{const row=await env.DB.prepare('SELECT value FROM external_runtime_config WHERE key=? LIMIT 1').bind(key).first();return String(row?.value||'')}catch{return''}
}
async function configRow(env,key){
  try{return await env.DB.prepare('SELECT value,updated_at FROM external_runtime_config WHERE key=? LIMIT 1').bind(key).first()}catch{return null}
}
export async function refreshAuthBrokerRuntimeHealth(env,{force=false}={}){
  const existing=await configRow(env,'auth_broker_runtime_health');
  if(!force&&existing?.updated_at&&Date.now()-Date.parse(String(existing.updated_at).replace(' ','T')+'Z')<10*60*1000){
    try{return JSON.parse(existing.value||'{}')}catch{}
  }
  const brokerUrl=(await config(env,'auth_broker_url')).replace(/\/$/,'');
  const sharedSecret=await config(env,'auth_broker_shared_secret');
  if(!httpsUrl(brokerUrl)||sharedSecret.length<32)return{ok:false,serviceOk:false,error:'auth_broker_not_configured'};
  const checkedAt=new Date().toISOString();
  let serviceOk=false,serviceStatus=0,serviceError=null;
  try{
    const service=await fetch(brokerUrl+'/health',{headers:{'User-Agent':'ToolScout-Auth-Plane/1.0'},signal:AbortSignal.timeout(12000)});
    serviceStatus=service.status;
    let data={};try{data=await service.json()}catch{}
    serviceOk=Boolean(service.ok&&data.ok);
    if(!serviceOk)serviceError=data.error||'broker_service_health_failed';
  }catch(error){serviceError=safe(error?.message||error,300)}
  if(!serviceOk){
    const result={ok:false,serviceOk:false,httpStatus:serviceStatus,browser:null,version:null,browserVerified:false,checkedAt,error:serviceError||'auth_broker_unreachable'};
    await env.DB.prepare(`INSERT INTO external_runtime_config(key,value,updated_at) VALUES('auth_broker_runtime_health',?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')`).bind(JSON.stringify(result)).run().catch(()=>{});
    return result;
  }
  let result;
  try{
    const response=await fetch(brokerUrl+'/browser-health',{headers:{Authorization:'Bearer '+sharedSecret,'User-Agent':'ToolScout-Auth-Plane/1.0'},signal:AbortSignal.timeout(45000)});
    let data={};try{data=await response.json()}catch{}
    const browserVerified=Boolean(response.ok&&data.ok);
    result={ok:true,serviceOk:true,httpStatus:response.status,browser:data.browser||null,version:data.version||null,browserVerified,checkedAt,
      diagnosticStatus:browserVerified?'browser_verified':'browser_probe_degraded',
      warning:browserVerified?null:(data.error||'browser_health_probe_failed'),
      error:null};
  }catch(error){
    result={ok:true,serviceOk:true,httpStatus:serviceStatus,browser:null,version:null,browserVerified:false,checkedAt,
      diagnosticStatus:'browser_probe_timeout',warning:safe(error?.message||error,300),error:null};
  }
  await env.DB.prepare(`INSERT INTO external_runtime_config(key,value,updated_at) VALUES('auth_broker_runtime_health',?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')`).bind(JSON.stringify(result)).run().catch(()=>{});
  return result;
}
export async function ensureAuthPlaneSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_surface_capability(
      surface_slug TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      action_url TEXT NOT NULL,
      auth_mode TEXT NOT NULL DEFAULT 'unknown',
      challenge_type TEXT,
      automation_state TEXT NOT NULL DEFAULT 'candidate',
      session_reusable INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 0,
      evidence TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_surface_state ON auth_surface_capability(automation_state,confidence DESC,updated_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_session_vault(
      domain TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      state_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT,
      last_used_at TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_handoff(
      handoff_id TEXT PRIMARY KEY,
      surface_slug TEXT NOT NULL,
      domain TEXT NOT NULL,
      target_url TEXT NOT NULL,
      completion_token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'starting',
      challenge_type TEXT,
      broker_session_id TEXT,
      handoff_url TEXT,
      current_url TEXT,
      result_json TEXT,
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_handoff_status ON auth_handoff(status,expires_at,updated_at)`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
function classifyRow(row){
  const slug=String(row.surface_slug||''),url=String(row.action_url||''),next=String(row.next_action||''),status=String(row.status||'');
  const lower=(url+' '+next).toLowerCase();
  if(slug==='open-launch-com')return{authMode:'human_bootstrap_session',challengeType:'captcha_or_human_verification',state:'human_bootstrap_required',sessionReusable:1,confidence:98,evidence:'Live sign-up page verified 2026-09-25; account bootstrap and CAPTCHA/human verification required.'};
  if(slug==='best-of-ai')return{authMode:'human_bootstrap_session',challengeType:'login_required',state:'human_bootstrap_required',sessionReusable:1,confidence:98,evidence:'BestOfAI /tool/add verified HTTP 401 with visible "You must be logged in" on 2026-09-25.'};
  if(/api\/|api\./i.test(url)&&/(token|api key|authentication)/i.test(next))return{authMode:'api_credential',challengeType:null,state:'credential_required',sessionReusable:0,confidence:90,evidence:safe(next,1000)};
  if(status==='auth_required'||/(sign[ -]?in|login|log in|register|sign-up|sign up)/i.test(lower))return{authMode:'reusable_session_candidate',challengeType:/captcha|turnstile|human verification/i.test(lower)?'captcha_or_human_verification':'login_required',state:'candidate',sessionReusable:1,confidence:70,evidence:safe(next,1000)};
  if(/captcha|turnstile|human-only confirmation/i.test(lower))return{authMode:'human_challenge',challengeType:'captcha_or_human_verification',state:'human_challenge_required',sessionReusable:0,confidence:75,evidence:safe(next,1000)};
  return null;
}
export async function classifyAuthBacklog(env,{limit=120}={}){
  await ensureAuthPlaneSchema(env);
  const q=await env.DB.prepare(`SELECT surface_slug,status,action_url,next_action,human_required,distribution_score
    FROM distribution_opportunities
    WHERE action_url IS NOT NULL
      AND (
        status IN ('auth_required','human_action_required')
        OR lower(COALESCE(next_action,'')) LIKE '%auth route%'
        OR lower(COALESCE(next_action,'')) LIKE '%login%'
        OR lower(COALESCE(next_action,'')) LIKE '%sign in%'
        OR lower(COALESCE(next_action,'')) LIKE '%token%'
      )
      AND status NOT IN ('policy_blocked','rejected','skipped','live','verified')
    ORDER BY distribution_score DESC LIMIT ?`).bind(Math.max(1,Math.min(300,Number(limit)||120))).all().catch(()=>({results:[]}));
  let classified=0;
  for(const row of q.results||[]){
    const c=classifyRow(row);if(!c)continue;
    const action=httpsUrl(row.action_url),domain=domainOf(action);if(!action||!domain)continue;
    const w=await env.DB.prepare(`INSERT INTO auth_surface_capability(surface_slug,domain,action_url,auth_mode,challenge_type,automation_state,session_reusable,confidence,evidence,last_verified_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(surface_slug) DO UPDATE SET domain=excluded.domain,action_url=excluded.action_url,auth_mode=excluded.auth_mode,challenge_type=excluded.challenge_type,
        automation_state=CASE WHEN auth_surface_capability.automation_state IN ('authenticated','route_validated') THEN auth_surface_capability.automation_state ELSE excluded.automation_state END,
        session_reusable=excluded.session_reusable,confidence=MAX(auth_surface_capability.confidence,excluded.confidence),evidence=excluded.evidence,last_verified_at=datetime('now'),updated_at=datetime('now')
      WHERE auth_surface_capability.action_url IS NOT excluded.action_url OR auth_surface_capability.auth_mode IS NOT excluded.auth_mode
        OR auth_surface_capability.challenge_type IS NOT excluded.challenge_type OR auth_surface_capability.evidence IS NOT excluded.evidence
        OR auth_surface_capability.confidence<excluded.confidence`)
      .bind(row.surface_slug,domain,action,c.authMode,c.challengeType,c.state,c.sessionReusable,c.confidence,c.evidence).run().catch(()=>null);
    classified+=Number(w?.meta?.changes||w?.changes||0);
    if(c.state==='human_bootstrap_required'&&c.confidence>=95){
      const reason=c.challengeType==='captcha_or_human_verification'
        ?'This surface requires one-time account bootstrap and a human verification challenge before ToolScout can reuse the authenticated session.'
        :'This surface requires one-time owner authentication before ToolScout can reuse the authenticated session.';
      const instructions='Open the action in your normal browser. Sign in or create only the minimum free account and complete MFA or CAPTCHA yourself if shown. Do not buy promotion or accept optional paid upgrades. When the required human step is complete, return to the Chairman Queue and press Mark done. ToolScout will resume autonomous verification without requiring a remote browser session.';
      const gateKey='distribution:surface:'+row.surface_slug;
      await env.DB.prepare(`UPDATE distribution_opportunities SET status='auth_required',human_required=1,action_url=?,next_action=?,updated_at=datetime('now')
        WHERE surface_slug=? AND status NOT IN ('verified','live','policy_blocked','rejected')`).bind(action,instructions,row.surface_slug).run().catch(()=>{});
      await env.DB.prepare(`UPDATE human_gate_contract SET status='open',owner_completed_at=NULL,resolved_at=NULL,result_url=NULL,next_verification_at=NULL,
        reason=?,instructions=?,action_url=?,resolution_mode='auth_session_saved',verification_detail=NULL,updated_at=datetime('now')
        WHERE gate_key=? AND status IN ('cancelled','resolved')`).bind(reason,instructions,action,gateKey).run().catch(()=>{});
      await upsertHumanGate(env,{
        engine:'distribution',subjectType:'surface',subjectKey:row.surface_slug,gateType:'authentication',
        title:`${row.surface_slug}: authenticate once`,reason,instructions,actionUrl:action,resolutionMode:'human_browser_completed',
        payload:{name:'ToolScout',website:'https://trytoolscout.org/',domain:'trytoolscout.org',
          description:'ToolScout is an independent software discovery and recommendation platform.',
          tagline:'Find the right software for the job without the noise.',
          gate_evidence:{url:action,checked_at:new Date().toISOString(),detail:c.evidence}}
      }).catch(()=>{});
    }
  }
  return{ok:true,observed:(q.results||[]).length,classified};
}
async function vaultRow(env,domain){await ensureAuthPlaneSchema(env);return env.DB.prepare(`SELECT * FROM auth_session_vault WHERE domain=? AND status='active' AND (expires_at IS NULL OR expires_at>datetime('now')) LIMIT 1`).bind(domain).first().catch(()=>null)}
export async function authPlaneHealth(env){
  await ensureAuthPlaneSchema(env);
  const [q,runtimeRow]=await Promise.all([
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM auth_surface_capability) capabilities,
      (SELECT COUNT(*) FROM auth_surface_capability WHERE automation_state='human_bootstrap_required') bootstrap_required,
      (SELECT COUNT(*) FROM auth_surface_capability WHERE automation_state IN ('authenticated','route_validated')) authenticated,
      (SELECT COUNT(*) FROM auth_session_vault WHERE status='active' AND (expires_at IS NULL OR expires_at>datetime('now'))) active_sessions,
      (SELECT COUNT(*) FROM auth_handoff WHERE status IN ('starting','open') AND expires_at>datetime('now')) open_handoffs`).first().catch(()=>({})),
    configRow(env,'auth_broker_runtime_health')
  ]);
  let brokerRuntime=null;try{brokerRuntime=JSON.parse(runtimeRow?.value||'null')}catch{}
  return{ok:true,status:(await config(env,'auth_broker_url'))?'configured':'awaiting_broker',capabilities:num(q?.capabilities),bootstrapRequired:num(q?.bootstrap_required),authenticated:num(q?.authenticated),activeSessions:num(q?.active_sessions),openHandoffs:num(q?.open_handoffs),brokerRuntime,brokerRuntimeUpdatedAt:runtimeRow?.updated_at||null,captchaPolicy:'human_only_no_bypass',credentialStorage:'no_passwords_session_state_aes_gcm'};
}
function sessionExpiry(state){
  const now=Math.floor(Date.now()/1000),max=now+30*86400;
  const expiries=(Array.isArray(state?.cookies)?state.cookies:[]).map(c=>Number(c?.expires||0)).filter(x=>x>now&&Number.isFinite(x));
  const sec=expiries.length?Math.min(max,Math.max(now+3600,Math.min(...expiries))):now+7*86400;
  return new Date(sec*1000).toISOString().replace('T',' ').replace('Z','');
}
export async function createAuthHandoff(env,surfaceSlug,{origin='https://trytoolscout.org'}={}){
  await ensureAuthPlaneSchema(env);
  await classifyAuthBacklog(env,{limit:120});
  const cap=await env.DB.prepare(`SELECT a.*,o.status opportunity_status,o.human_required,o.distribution_score FROM auth_surface_capability a
    JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug WHERE a.surface_slug=? LIMIT 1`).bind(surfaceSlug).first();
  if(!cap)return{ok:false,error:'auth_capability_not_found'};
  if(!['human_bootstrap_session','reusable_session_candidate'].includes(String(cap.auth_mode)))return{ok:false,error:'auth_mode_not_handoff_eligible'};
  if(!['auth_required','human_action_required','research_required'].includes(String(cap.opportunity_status)))return{ok:false,error:'opportunity_not_handoff_eligible'};
  const brokerUrl=(await config(env,'auth_broker_url')).replace(/\/$/,'');
  const sharedSecret=await config(env,'auth_broker_shared_secret');
  if(!httpsUrl(brokerUrl)||sharedSecret.length<32)return{ok:false,error:'auth_broker_not_configured'};
  const existing=await env.DB.prepare(`SELECT * FROM auth_handoff WHERE surface_slug=? AND status IN ('starting','open') AND expires_at>datetime('now') ORDER BY created_at DESC LIMIT 1`).bind(surfaceSlug).first().catch(()=>null);
  if(existing?.handoff_url){
    let alive=false;
    try{
      const probe=await fetch(existing.handoff_url,{method:'GET',redirect:'manual',headers:{'User-Agent':'ToolScout-Auth-Plane/1.0'},signal:AbortSignal.timeout(5000)});
      alive=probe.status===200;
      try{await probe.body?.cancel()}catch{}
    }catch{}
    if(alive)return{ok:true,reused:true,handoffId:existing.handoff_id,handoffUrl:existing.handoff_url,expiresAt:existing.expires_at};
    await env.DB.prepare(`UPDATE auth_handoff SET status='failed',result_json=?,updated_at=datetime('now') WHERE handoff_id=?`)
      .bind(JSON.stringify({error:'broker_session_lost',reconciledAt:new Date().toISOString()}),existing.handoff_id).run().catch(()=>{});
  }
  const vault=await vaultRow(env,cap.domain);
  let initialState=null;
  if(vault){try{initialState=await decryptState(env,cap.domain,vault)}catch{}}
  const handoffId='ah_'+crypto.randomUUID(),completionToken=crypto.randomUUID()+'.'+crypto.randomUUID();
  const completionHash=await sha256(completionToken);
  await env.DB.prepare(`INSERT INTO auth_handoff(handoff_id,surface_slug,domain,target_url,completion_token_hash,status,challenge_type,expires_at,created_at,updated_at)
    VALUES(?,?,?,?,?,'starting',?,datetime('now','+20 minutes'),datetime('now'),datetime('now'))`)
    .bind(handoffId,surfaceSlug,cap.domain,cap.action_url,completionHash,cap.challenge_type||'login_required').run();
  const completionUrl=new URL('/api/auth-plane/handoffs/'+encodeURIComponent(handoffId)+'/complete',origin).toString();
  let response;
  try{
    response=await fetch(brokerUrl+'/auth/start',{method:'POST',headers:{Authorization:'Bearer '+sharedSecret,'Content-Type':'application/json','User-Agent':'ToolScout-Auth-Plane/1.0'},
      body:JSON.stringify({handoffId,surfaceSlug,targetUrl:cap.action_url,completionUrl,completionToken,initialState,challengeType:cap.challenge_type||null}),
      signal:AbortSignal.timeout(15000)});
  }catch(error){
    await env.DB.prepare(`UPDATE auth_handoff SET status='failed',result_json=?,updated_at=datetime('now') WHERE handoff_id=?`).bind(JSON.stringify({error:safe(error?.message||error,500)}),handoffId).run();
    return{ok:false,error:'auth_broker_start_failed'};
  }
  let data={};try{data=await response.json()}catch{}
  if(!response.ok||!httpsUrl(data.handoffUrl)){
    await env.DB.prepare(`UPDATE auth_handoff SET status='failed',result_json=?,updated_at=datetime('now') WHERE handoff_id=?`).bind(JSON.stringify({http:response.status,data}),handoffId).run();
    return{ok:false,error:'auth_broker_rejected',status:response.status};
  }
  await env.DB.prepare(`UPDATE auth_handoff SET status='open',broker_session_id=?,handoff_url=?,updated_at=datetime('now') WHERE handoff_id=?`)
    .bind(safe(data.sessionId,180),safe(data.handoffUrl,1600),handoffId).run();
  return{ok:true,handoffId,handoffUrl:data.handoffUrl,expiresAt:data.expiresAt||null,reusedSession:Boolean(initialState)};
}
export async function completeAuthHandoff(request,env,handoffId){
  await ensureAuthPlaneSchema(env);
  const row=await env.DB.prepare(`SELECT * FROM auth_handoff WHERE handoff_id=? LIMIT 1`).bind(handoffId).first();
  if(!row)return new Response(JSON.stringify({error:'handoff_not_found'}),{status:404,headers:H});
  if(row.status==='completed')return new Response(JSON.stringify({ok:true,idempotent:true}),{headers:H});
  if(Date.parse((row.expires_at||'').replace(' ','T')+'Z')<Date.now())return new Response(JSON.stringify({error:'handoff_expired'}),{status:410,headers:H});
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token||(await sha256(token))!==row.completion_token_hash)return new Response(JSON.stringify({error:'invalid_completion_capability'}),{status:403,headers:H});
  let body={};try{body=await request.json()}catch{return new Response(JSON.stringify({error:'invalid_json'}),{status:400,headers:H})}
  const state=body?.sessionState;
  if(!state||!Array.isArray(state.cookies))return new Response(JSON.stringify({error:'session_state_required'}),{status:400,headers:H});
  const enc=await encryptState(env,row.domain,state),hash=await sha256(JSON.stringify(state));
  const expiresAt=sessionExpiry(state);
  await env.DB.prepare(`INSERT INTO auth_session_vault(domain,ciphertext,iv,state_hash,status,expires_at,last_used_at,last_verified_at,created_at,updated_at)
    VALUES(?,?,?,?,'active',?,datetime('now'),datetime('now'),datetime('now'),datetime('now'))
    ON CONFLICT(domain) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,state_hash=excluded.state_hash,status='active',
      expires_at=excluded.expires_at,last_used_at=datetime('now'),last_verified_at=datetime('now'),updated_at=datetime('now')`)
    .bind(row.domain,enc.ciphertext,enc.iv,hash,expiresAt).run();
  await env.DB.prepare(`UPDATE auth_handoff SET status='completed',current_url=?,result_json=?,completed_at=datetime('now'),updated_at=datetime('now') WHERE handoff_id=?`)
    .bind(safe(body.currentUrl,1800),JSON.stringify({challengeResolved:Boolean(body.challengeResolved),saved:true}),handoffId).run();
  await env.DB.prepare(`UPDATE auth_surface_capability SET automation_state='authenticated',session_reusable=1,last_verified_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run();
  await env.DB.prepare(`UPDATE distribution_opportunities SET status='research_required',human_required=0,
      next_action='Reusable authenticated session saved by Auth Plane. Resume autonomous post-login route validation; do not resubmit or pay without canonical verification.',
      updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run();
  const gateKey='distribution:surface:'+row.surface_slug;
  await resolveHumanGate(env,gateKey,{resultUrl:body.currentUrl||row.target_url,detail:'Authentication bootstrap completed; reusable session state saved. Autonomous post-login route validation can resume.'}).catch(()=>{});
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at)
    VALUES(?,?,'auth_session_saved','completed',?,?,?,datetime('now'),datetime('now'))`)
    .bind('authsaved_'+crypto.randomUUID(),row.surface_slug,row.target_url,safe(body.currentUrl||row.target_url,1800),'Human completed login/challenge. Password/OTP was not stored; only encrypted reusable session state was admitted.').run().catch(()=>{});
  return new Response(JSON.stringify({ok:true,surfaceSlug:row.surface_slug,status:'authenticated',expiresAt}),{headers:H});
}
export async function resumeAuthenticatedRoute(env,surfaceSlug){
  await ensureAuthPlaneSchema(env);
  const cap=await env.DB.prepare(`SELECT * FROM auth_surface_capability WHERE surface_slug=? LIMIT 1`).bind(surfaceSlug).first();
  if(!cap)return{ok:false,error:'auth_capability_not_found'};
  const vault=await vaultRow(env,cap.domain);if(!vault)return{ok:false,error:'active_session_not_found'};
  const brokerUrl=(await config(env,'auth_broker_url')).replace(/\/$/,'');
  const sharedSecret=await config(env,'auth_broker_shared_secret');
  if(!httpsUrl(brokerUrl)||sharedSecret.length<32)return{ok:false,error:'auth_broker_not_configured'};
  let state;try{state=await decryptState(env,cap.domain,vault)}catch{return{ok:false,error:'session_decrypt_failed'}}
  let response;
  try{
    response=await fetch(brokerUrl+'/auth/inspect',{method:'POST',headers:{Authorization:'Bearer '+sharedSecret,'Content-Type':'application/json','User-Agent':'ToolScout-Auth-Plane/1.0'},
      body:JSON.stringify({surfaceSlug,targetUrl:cap.action_url,sessionState:state}),signal:AbortSignal.timeout(45000)});
  }catch(error){return{ok:false,error:'auth_broker_inspect_failed',detail:safe(error?.message||error,300)}}
  let data={};try{data=await response.json()}catch{}
  if(!response.ok)return{ok:false,error:'auth_broker_inspect_rejected',status:response.status,detail:data};
  if(data.sessionState&&Array.isArray(data.sessionState.cookies)){
    const enc=await encryptState(env,cap.domain,data.sessionState),hash=await sha256(JSON.stringify(data.sessionState));
    await env.DB.prepare(`UPDATE auth_session_vault SET ciphertext=?,iv=?,state_hash=?,last_used_at=datetime('now'),last_verified_at=datetime('now'),updated_at=datetime('now') WHERE domain=?`)
      .bind(enc.ciphertext,enc.iv,hash,cap.domain).run();
  }
  if(data.challengeDetected){
    await env.DB.prepare(`UPDATE auth_surface_capability SET automation_state='human_challenge_required',challenge_type=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(safe(data.challengeType||'captcha_or_human_verification',80),surfaceSlug).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='auth_required',human_required=1,next_action='Authenticated browser reached a human challenge. Complete only the challenge in Auth Plane; automation will resume afterward.',updated_at=datetime('now') WHERE surface_slug=?`).bind(surfaceSlug).run();
    await reopenHumanGate(env,'distribution:surface:'+surfaceSlug,{reason:'Authenticated session reached a human verification challenge.',instructions:'Open the Auth Plane handoff, complete the human challenge only, then Save session & resume. Do not buy promotion or accept optional paid upgrades.'}).catch(()=>{});
    return{ok:true,status:'human_challenge_required',challengeType:data.challengeType||null};
  }
  const route=String(data.routeType||'unknown');
  await env.DB.prepare(`UPDATE auth_surface_capability SET automation_state=?,evidence=?,last_verified_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`)
    .bind(route==='submission_form'?'route_validated':'authenticated',safe(data.evidence||'',1600),surfaceSlug).run();
  await env.DB.prepare(`UPDATE distribution_opportunities SET status='research_required',human_required=0,next_action=?,updated_at=datetime('now') WHERE surface_slug=?`)
    .bind(route==='submission_form'
      ?'Authenticated route validated by Auth Plane. Prepare an exact field-level submission contract before any irreversible submit.'
      :'Authenticated session is valid, but no verified free submission form was proven. Continue autonomous route research.',surfaceSlug).run();
  return{ok:true,status:route==='submission_form'?'route_validated':'authenticated_no_route',routeType:route,form:data.form||null,evidence:data.evidence||null};
}
export async function authenticatedResumeSweep(env,{limit=4}={}){
  await ensureAuthPlaneSchema(env);
  const q=await env.DB.prepare(`SELECT a.surface_slug FROM auth_surface_capability a JOIN auth_session_vault v ON v.domain=a.domain
    WHERE a.automation_state='authenticated' AND v.status='active' AND (v.expires_at IS NULL OR v.expires_at>datetime('now'))
    ORDER BY a.updated_at ASC LIMIT ?`).bind(Math.max(1,Math.min(12,Number(limit)||4))).all().catch(()=>({results:[]}));
  const results=[];
  for(const row of q.results||[])results.push({surfaceSlug:row.surface_slug,...await resumeAuthenticatedRoute(env,row.surface_slug)});
  return{ok:true,checked:results.length,results};
}
