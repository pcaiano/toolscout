import {resolveHumanGate} from './human-gate-contract.js';

const TEXT=new TextEncoder();
const DECODER=new TextDecoder();
let schemaReady=null;
const safe=(v,n=2000)=>String(v??'').slice(0,n);

async function key(env){
  if(!env.ADMIN_TOKEN)throw new Error('machine_credential_key_missing');
  const digest=await crypto.subtle.digest('SHA-256',TEXT.encode('toolscout-machine-credential-v1:'+env.ADMIN_TOKEN));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function b64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function unb64(value){const s=atob(String(value||''));return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function hash(value){const d=await crypto.subtle.digest('SHA-256',TEXT.encode(String(value||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function encrypt(env,slug,kind,secret){
  const k=await key(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const aad=TEXT.encode('surface:'+slug+':'+kind);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},k,TEXT.encode(secret));
  return{ciphertext:b64(new Uint8Array(cipher)),iv:b64(iv)};
}
async function decrypt(env,row){
  const k=await key(env),aad=TEXT.encode('surface:'+row.surface_slug+':'+row.credential_kind);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:aad},k,unb64(row.ciphertext));
  return DECODER.decode(plain);
}
export async function ensureAuthAutomationSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_automation_capability(
      surface_slug TEXT PRIMARY KEY,
      automation_class TEXT NOT NULL,
      credential_kind TEXT,
      credential_header TEXT,
      credential_prefix TEXT,
      credential_state TEXT NOT NULL DEFAULT 'not_required',
      human_bootstrap_required INTEGER NOT NULL DEFAULT 0,
      evidence TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_automation_class ON auth_automation_capability(automation_class,credential_state,updated_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_machine_credential(
      surface_slug TEXT PRIMARY KEY,
      credential_kind TEXT NOT NULL,
      header_name TEXT NOT NULL,
      prefix TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT,
      last_used_at TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  ]).catch(e=>{schemaReady=null;throw e});
  return schemaReady;
}
function authSpec(authType,detail){
  const type=String(authType||'').toLowerCase();
  let parsed=[];try{parsed=Array.isArray(detail)?detail:JSON.parse(detail||'[]')}catch{}
  const bearer=parsed.find(x=>String(x?.scheme||'').toLowerCase()==='bearer'||String(x?.type||'').toLowerCase()==='oauth2');
  if(type==='bearer'||type==='oauth'||type==='oauth2'||bearer)return{required:true,supported:true,kind:'bearer',header:'Authorization',prefix:'Bearer '};
  const api=parsed.find(x=>String(x?.type||'').toLowerCase()==='apikey'&&String(x?.in||'').toLowerCase()==='header');
  if(type==='api_key'||type==='apikey'||api){
    const header=String(api?.parameter||api?.header||'').trim();
    return header?{required:true,supported:true,kind:'api_key_header',header,prefix:''}:{required:true,supported:false,kind:'api_key_header',header:null,prefix:''};
  }
  if(!type||type==='none'||type==='null')return{required:false,supported:true,kind:null,header:null,prefix:''};
  if(type==='openapi_security')return{required:true,supported:false,kind:null,header:null,prefix:''};
  return{required:true,supported:false,kind:null,header:null,prefix:''};
}
async function staticAdapters(env){
  try{
    const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org/data/distribution-submission-adapters.json'));
    const j=r.ok?await r.json():{};
    return new Map((j.adapters||[]).map(x=>[String(x.surface_slug||''),x]));
  }catch{return new Map()}
}
export async function reconcileAuthAutomationClasses(env,{limit=400}={}){
  await ensureAuthAutomationSchema(env);
  const staticMap=await staticAdapters(env);
  const q=await env.DB.prepare(`SELECT o.surface_slug,o.status,o.action_url,o.next_action,o.human_required,o.distribution_score,
      a.policy_state auto_policy_state,a.confidence auto_confidence,a.auth_type auto_auth_type,a.auth_detail auto_auth_detail,
      c.auth_mode,c.challenge_type,c.automation_state
    FROM distribution_opportunities o
    LEFT JOIN distribution_auto_adapters a ON a.surface_slug=o.surface_slug
    LEFT JOIN auth_surface_capability c ON c.surface_slug=o.surface_slug
    WHERE o.status NOT IN ('rejected','skipped')
    ORDER BY o.distribution_score DESC LIMIT ?`).bind(Math.max(1,Math.min(800,Number(limit)||400))).all().catch(()=>({results:[]}));
  let classified=0;
  for(const row of q.results||[]){
    const st=staticMap.get(String(row.surface_slug||''))||null;
    if(st?.setup_state==='policy_blocked'||st?.requires_payment)continue;
    const authType=row.auto_auth_type||st?.auth_type||null;
    const detail=row.auto_auth_detail||null;
    const spec=authSpec(authType,detail);
    const cred=await env.DB.prepare(`SELECT status FROM auth_machine_credential WHERE surface_slug=? AND status='active' AND (expires_at IS NULL OR expires_at>datetime('now')) LIMIT 1`).bind(row.surface_slug).first().catch(()=>null);
    const envCredential=Boolean(st?.auth_env&&env[st.auth_env]);
    const autoVerified=(row.auto_policy_state==='verified'&&Number(row.auto_confidence||0)>=95)||Boolean(st?.enabled&&st?.allow_automatic);
    const machineRouteProven=Boolean(row.auto_policy_state==='auth_required'||row.auth_mode==='api_credential'||(spec.required&&spec.supported));
    let automationClass=null,credentialState='not_required',bootstrap=0,evidence='';
    if(autoVerified&&!spec.required){
      automationClass='public_automatic';evidence='Verified free machine adapter requires no authentication.';
    }else if(spec.required&&spec.supported&&(cred||envCredential)){
      automationClass='token_automatic';credentialState='active';evidence='Verified machine authentication is available for autonomous execution.';
    }else if(machineRouteProven&&spec.required&&spec.supported){
      automationClass='human_bootstrap_then_automatic';credentialState='missing';bootstrap=1;evidence='Machine-safe authenticated route is proven, but a reusable token/API key is still required.';
    }else if(row.auth_mode||row.status==='auth_required'||row.status==='human_action_required'||row.automation_state==='account_bootstrap_complete'){
      automationClass='human_only';credentialState='unsupported';bootstrap=row.status==='auth_required'?1:0;evidence='No reusable machine credential route is proven. Human browser action remains required for authenticated steps.';
    }else continue;
    const w=await env.DB.prepare(`INSERT INTO auth_automation_capability(surface_slug,automation_class,credential_kind,credential_header,credential_prefix,credential_state,human_bootstrap_required,evidence,last_verified_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(surface_slug) DO UPDATE SET automation_class=excluded.automation_class,credential_kind=excluded.credential_kind,
        credential_header=excluded.credential_header,credential_prefix=excluded.credential_prefix,credential_state=excluded.credential_state,
        human_bootstrap_required=excluded.human_bootstrap_required,evidence=excluded.evidence,last_verified_at=datetime('now'),updated_at=datetime('now')`)
      .bind(row.surface_slug,automationClass,spec.kind,spec.header,spec.prefix||'',credentialState,bootstrap,evidence).run().catch(()=>null);
    classified+=Number(w?.meta?.changes||w?.changes||0);
  }
  return{ok:true,observed:(q.results||[]).length,classified};
}
export async function saveMachineCredential(env,{surfaceSlug,credentialKind,secret,expiresAt=null}={}){
  await ensureAuthAutomationSchema(env);
  const slug=safe(surfaceSlug,180),value=String(secret||'').trim();
  if(!slug||value.length<8||value.length>12000)return{ok:false,error:'invalid_credential'};
  const cap=await env.DB.prepare(`SELECT * FROM auth_automation_capability WHERE surface_slug=? LIMIT 1`).bind(slug).first();
  if(!cap||cap.automation_class!=='human_bootstrap_then_automatic')return{ok:false,error:'surface_not_credential_bootstrap'};
  const kind=String(credentialKind||cap.credential_kind||'');
  if(!['bearer','api_key_header'].includes(kind)||kind!==String(cap.credential_kind||''))return{ok:false,error:'credential_kind_not_allowed'};
  const header=String(cap.credential_header||'');
  if(!/^[A-Za-z0-9-]{1,80}$/.test(header))return{ok:false,error:'credential_header_invalid'};
  const enc=await encrypt(env,slug,kind,value),secretHash=await hash(value);
  await env.DB.prepare(`INSERT INTO auth_machine_credential(surface_slug,credential_kind,header_name,prefix,ciphertext,iv,secret_hash,status,expires_at,last_verified_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'active',?,datetime('now'),datetime('now'),datetime('now'))
    ON CONFLICT(surface_slug) DO UPDATE SET credential_kind=excluded.credential_kind,header_name=excluded.header_name,prefix=excluded.prefix,
      ciphertext=excluded.ciphertext,iv=excluded.iv,secret_hash=excluded.secret_hash,status='active',expires_at=excluded.expires_at,last_verified_at=datetime('now'),updated_at=datetime('now')`)
    .bind(slug,kind,header,String(cap.credential_prefix||''),enc.ciphertext,enc.iv,secretHash,expiresAt||null).run();
  await env.DB.prepare(`UPDATE auth_automation_capability SET automation_class='token_automatic',credential_state='active',human_bootstrap_required=0,updated_at=datetime('now') WHERE surface_slug=?`).bind(slug).run();
  const auto=await env.DB.prepare(`SELECT confidence,policy_state FROM distribution_auto_adapters WHERE surface_slug=? LIMIT 1`).bind(slug).first().catch(()=>null);
  if(auto&&Number(auto.confidence||0)>=95&&auto.policy_state==='auth_required'){
    await env.DB.prepare(`UPDATE distribution_auto_adapters SET policy_state='verified',updated_at=datetime('now') WHERE surface_slug=?`).bind(slug).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='ready_to_submit',human_required=0,next_action='Reusable machine credential saved securely. Authenticated automatic submission is enabled.',updated_at=datetime('now') WHERE surface_slug=? AND status NOT IN ('verified','live','policy_blocked','rejected')`).bind(slug).run();
  }else{
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='research_required',human_required=0,next_action='Reusable machine credential saved securely. Revalidate the authenticated machine route before autonomous submission.',updated_at=datetime('now') WHERE surface_slug=? AND status NOT IN ('verified','live','policy_blocked','rejected')`).bind(slug).run();
  }
  await resolveHumanGate(env,'distribution:surface:'+slug,{detail:'Reusable machine credential stored securely; browser session/password not stored.'}).catch(()=>{});
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,detail,observed_at,created_at)
    VALUES(?,?,'machine_credential_saved','completed','Reusable token/API key admitted to encrypted credential vault. No password or browser cookie stored.',datetime('now'),datetime('now'))`)
    .bind('cred_'+crypto.randomUUID(),slug).run().catch(()=>{});
  return{ok:true,surfaceSlug:slug,automationClass:'token_automatic'};
}
export async function machineAuthHeaders(env,surfaceSlug){
  await ensureAuthAutomationSchema(env);
  const row=await env.DB.prepare(`SELECT c.*,a.automation_class FROM auth_machine_credential c JOIN auth_automation_capability a ON a.surface_slug=c.surface_slug
    WHERE c.surface_slug=? AND c.status='active' AND a.automation_class='token_automatic' AND (c.expires_at IS NULL OR c.expires_at>datetime('now')) LIMIT 1`).bind(surfaceSlug).first().catch(()=>null);
  if(!row)return null;
  let secret;try{secret=await decrypt(env,row)}catch{return null}
  await env.DB.prepare(`UPDATE auth_machine_credential SET last_used_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(surfaceSlug).run().catch(()=>{});
  return{[row.header_name]:String(row.prefix||'')+secret};
}
export async function invalidateMachineCredential(env,surfaceSlug,reason='credential_rejected'){
  await ensureAuthAutomationSchema(env);
  await env.DB.prepare(`UPDATE auth_machine_credential SET status='invalid',updated_at=datetime('now') WHERE surface_slug=?`).bind(surfaceSlug).run().catch(()=>{});
  await env.DB.prepare(`UPDATE auth_automation_capability SET automation_class='human_bootstrap_then_automatic',credential_state='invalid',human_bootstrap_required=1,evidence=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(safe(reason,500),surfaceSlug).run().catch(()=>{});
  await env.DB.prepare(`UPDATE distribution_auto_adapters SET policy_state='auth_required',updated_at=datetime('now') WHERE surface_slug=?`).bind(surfaceSlug).run().catch(()=>{});
  await env.DB.prepare(`UPDATE distribution_opportunities SET status='auth_required',human_required=1,next_action='The saved machine credential was rejected. Open the normal browser, refresh/create the token or API key, then save the replacement securely in Chairman Queue.',updated_at=datetime('now') WHERE surface_slug=?`).bind(surfaceSlug).run().catch(()=>{});
  return{ok:true};
}
export async function authAutomationSnapshot(env){
  await ensureAuthAutomationSchema(env);
  const q=await env.DB.prepare(`SELECT automation_class,credential_state,COUNT(*) n FROM auth_automation_capability GROUP BY automation_class,credential_state ORDER BY automation_class,credential_state`).all().catch(()=>({results:[]}));
  return{ok:true,classes:q.results||[]};
}
