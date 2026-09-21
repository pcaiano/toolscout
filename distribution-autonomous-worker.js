import {actionUrl as validHumanActionUrl,existingParentSubmission,reconcileDuplicateSubmissionGates} from './chairman-task-quality.js';
import base from './distribution-submission-worker.js';
import {distributionSurfaceMetrics} from './distribution-impact-worker.js';
import {runWithLedger} from './engine-run-ledger.js';
import {ensureHumanGateSchema,humanGateKey,upsertHumanGate,dueHumanGateVerifications,deferHumanGateVerification,resolveHumanGate,humanGateSnapshot} from './human-gate-contract.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const SAFE_FIELDS=new Set(['name','title','url','website','website_url','description','tagline','category','categories','slug','domain','homepage','product_url','tool_url']);
const POLICY_BLOCK_RE=/(paid submission|requires? payment|payment required|credit card required|requires? (?:a )?reciprocal (?:link|badge)|must (?:add|place|install) (?:our )?(?:badge|backlink)|automated submissions? (?:are )?(?:not allowed|prohibited|forbidden)|bots? (?:are )?(?:not allowed|prohibited|forbidden))/i;
const HUMAN_BLOCK_RE=/(captcha|turnstile|hcaptcha|recaptcha|terms acceptance|accept (?:the )?terms|agree to (?:the )?terms|explicit (?:user|owner) approval|user confirmation required|confirm before submission)/i;
const AUTH_RE=/(account required|sign in|login required|api key|bearer token|oauth)/i;
const ROUTE_RE=/(submit|submission|listing|listings|tool|tools|startup|startups|directory|register|add)/i;
const DOC_RE=/(openapi|swagger|api-docs|api\/docs|developer|for-llms|agent|mcp|registry|submit)/i;
const QUALIFY_LIMIT=24;
const EXECUTION_LIMIT=12;
const RESEARCH_COOLDOWN_HOURS=6;
async function runDiscoveryRefresh(env){
  if(!env.ADMIN_TOKEN)return {ok:false,reason:'admin_token_unavailable'};
  try{
    const response=await base.fetch(new Request('https://trytoolscout.org/api/distribution/discovery/refresh',{method:'POST',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`}}),env);
    if(!response?.ok)return {ok:false,status:Number(response?.status||0),reason:'discovery_refresh_failed'};
    return await response.json();
  }catch(e){return {ok:false,reason:String(e?.message||e).slice(0,300)}}
}
function safe(v,n=4000){return String(v??'').slice(0,n)}
function host(v){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
const TECHNICAL_HOST_RE=/^(?:api|cdn|static|assets|asset|img|images|media|js|css|fonts|edge|storage)\./i;
function isTechnicalSurface(value){const h=host(value);return TECHNICAL_HOST_RE.test(h)||/(?:githubassets\.com|githubusercontent\.com)$/i.test(h)}
function sameHostFamily(a,b){const x=host(a),y=host(b);return x===y||x.endsWith('.'+y)||y.endsWith('.'+x)}
async function text(url,timeout=4000){try{const r=await fetch(url,{headers:{'User-Agent':'ToolScout-Distribution-Qualifier/1.0','Accept':'text/html,application/json;q=0.9,*/*;q=0.8'},redirect:'follow',signal:AbortSignal.timeout(timeout)});if(!r.ok)return null;return {url:r.url,contentType:r.headers.get('content-type')||'',body:(await r.text()).slice(0,800000)}}catch{return null}}
function links(html,base){const out=new Set();for(const m of String(html||'').matchAll(/href=["']([^"']+)["']/gi)){try{const u=new URL(m[1],base);if(u.protocol==='https:')out.add(u.href)}catch{}}return [...out]}
const ACTION_ROUTE_RE=/(submit|submission|add(?:-|_|\/)?(?:tool|startup|product)|new(?:-|_|\/)?(?:tool|startup|product)|register|sign(?:-|_|\/)?up|list(?:-|_|\/)?your)/i;
async function externalRouteFailureCount(env,surfaceSlug){
  try{
    const row=await env.DB.prepare(`SELECT COUNT(*) AS count FROM distribution_qualification_events WHERE surface_slug=? AND result='external_verification_failed' AND created_at>=datetime('now','-72 hours')`).bind(surfaceSlug).first();
    return Number(row?.count||0);
  }catch{return 0}
}
async function recordExternalRouteFailure(env,row,detail){
  try{
    await env.DB.prepare(`INSERT INTO distribution_qualification_events(qualification_id,surface_slug,source_url,result,detail,created_at) VALUES(?,?,?,?,?,datetime('now'))`).bind(`qual_${crypto.randomUUID()}`,row.surface_slug,row.action_url,'external_verification_failed',safe(detail,1200)).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run();
  }catch{}
}
async function rediscoverActionUrl(env,row){
  if(await externalRouteFailureCount(env,row.surface_slug)<2)return null;
  const candidates=[];
  try{
    const discovered=await env.DB.prepare(`SELECT source_url FROM distribution_discovery_sources WHERE parent_surface_slug=? AND status='active' ORDER BY confidence DESC,updated_at DESC LIMIT 12`).bind(row.surface_slug).all();
    for(const x of discovered.results||[])if(ACTION_ROUTE_RE.test(String(x.source_url||'')))candidates.push(String(x.source_url));
  }catch{}
  try{
    const current=new URL(row.action_url);
    const home=await text(current.origin+'/',3000);
    if(home){
      for(const u of links(home.body,home.url))if(sameHostFamily(u,home.url)&&ACTION_ROUTE_RE.test(u))candidates.push(u);
    }
  }catch{}
  const probeCandidates=[...new Set(candidates)].filter(u=>u&&u!==row.action_url).slice(0,4);
  const probed=await Promise.all(probeCandidates.map(async candidate=>({candidate,probe:await text(candidate,3000)})));
  for(const item of probed){
    const probe=item.probe;if(!probe)continue;
    try{
      await env.DB.prepare(`UPDATE distribution_opportunities SET action_url=?,last_checked_at=datetime('now'),next_action=CASE WHEN status='human_action_required' THEN 'Submission route was re-discovered automatically after repeated external verification failures. Use the refreshed action URL for the required human step.' ELSE next_action END,updated_at=datetime('now') WHERE surface_slug=?`).bind(probe.url,row.surface_slug).run();
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`route_${crypto.randomUUID()}`,row.surface_slug,'action_url_rediscovered','completed',row.action_url,probe.url,'Persistent external verification failures triggered autonomous action-URL re-discovery.').run();
    }catch{}
    return {url:probe.url,page:probe};
  }
  return null;
}
async function refreshPersistentActionUrls(env){
  let checked=0,recovered=0,externalFailures=0;
  try{
    const q=await env.DB.prepare(`SELECT surface_slug,action_url,status,last_checked_at FROM distribution_opportunities WHERE action_url IS NOT NULL AND status IN ('human_action_required','auth_required','research_required') AND (last_checked_at IS NULL OR last_checked_at<=datetime('now','-6 hours')) ORDER BY last_checked_at ASC LIMIT 3`).all();
    const results=await Promise.all((q.results||[]).map(async row=>{
      if(isTechnicalSurface(row.action_url)){
        await env.DB.prepare(`UPDATE distribution_opportunities SET status='skipped',human_required=0,next_action='Technical infrastructure host excluded from distribution discovery.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run().catch(()=>{});
        return {checked:1,recovered:0,externalFailure:0};
      }
      const probe=await text(row.action_url,3000);
      if(probe){
        await env.DB.prepare(`UPDATE distribution_opportunities SET last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run();
        return {checked:1,recovered:0,externalFailure:0};
      }
      await recordExternalRouteFailure(env,row,'action_url_verification_failed');
      const found=await rediscoverActionUrl(env,row);
      return {checked:1,recovered:found?1:0,externalFailure:1};
    }));
    checked=results.reduce((n,x)=>n+x.checked,0);
    recovered=results.reduce((n,x)=>n+x.recovered,0);
    externalFailures=results.reduce((n,x)=>n+x.externalFailure,0);
  }catch{}
  return {checked,recovered,externalFailures};
}
function resolveSchemaRef(spec,schema){if(!schema)return null;if(!schema.$ref)return schema;const path=String(schema.$ref).replace(/^#\//,'').split('/');let cur=spec;for(const p of path)cur=cur?.[p];return cur||null}
function schemaObject(spec,op){const rb=op?.requestBody?.content?.['application/json']?.schema;return resolveSchemaRef(spec,rb)}
function listingPayloadFromSchema(spec,schema){const resolved=resolveSchemaRef(spec,schema);if(!resolved||resolved.type!=='object')return null;const props=resolved.properties||{},required=resolved.required||[],payload={};for(const key of Object.keys(props)){if(key==='listing_type')payload[key]='company';else if(key==='name'||key==='title')payload[key]='ToolScout';else if(key==='slug')payload[key]='toolscout';else if(key==='tagline')payload[key]='Find the right software for the job without the noise.';else if(key==='description')payload[key]='ToolScout is an independent software discovery and recommendation platform.';else if(['url','website_url','homepage','product_url','tool_url'].includes(key))payload[key]='https://trytoolscout.org/';else if(key==='domain')payload[key]='trytoolscout.org';else if(key==='categories')payload[key]=['Software'];else if(key==='category')payload[key]='Software';else if(key==='is_stealth')payload[key]=false;else if(key==='type_data')payload[key]={}}for(const key of required)if(payload[key]===undefined)return null;return payload}
function payloadFromSchema(spec,schema){const resolved=resolveSchemaRef(spec,schema);if(!resolved||resolved.type!=='object')return null;const props=resolved.properties||{},required=resolved.required||[];if(props.listing){const listing=listingPayloadFromSchema(spec,props.listing);if(!listing)return null;const payload={listing};if(props.attribution)payload.attribution={agent_name:'ToolScout Distribution Engine',represented_organization:'ToolScout'};if(required.includes('website'))payload.website='';for(const key of required)if(payload[key]===undefined)return null;return payload}for(const key of required){if(!SAFE_FIELDS.has(key)||/(terms|agree|consent|captcha|password|token|key)/i.test(key))return null}const payload={};for(const key of Object.keys(props)){if(!SAFE_FIELDS.has(key))continue;if(key==='name'||key==='title')payload[key]='ToolScout';else if(['url','website','website_url','homepage','product_url','tool_url'].includes(key))payload[key]='https://trytoolscout.org/';else if(key==='description')payload[key]='ToolScout is an independent software discovery and recommendation platform.';else if(key==='tagline')payload[key]='Find the right software for the job without the noise.';else if(key==='category')payload[key]='Software';else if(key==='categories')payload[key]=['Software'];else if(key==='slug')payload[key]='toolscout';else if(key==='domain')payload[key]='trytoolscout.org'}for(const key of required)if(payload[key]===undefined)return null;return payload}
function tagAttr(tag,name){const m=String(tag||'').match(new RegExp('\\b'+name+'\\s*=\\s*["\\\']([^"\\\']*)["\\\']','i'));return m?m[1]:null}
function safeFormPayload(html){
  const payload={};
  let useful=0;
  const fields=[...String(html||'').matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map(m=>m[0]);
  for(const tag of fields){
    const name=String(tagAttr(tag,'name')||'').trim();
    if(!name)continue;
    const type=String(tagAttr(tag,'type')||'text').toLowerCase();
    const required=/\brequired\b/i.test(tag);
    if(/password|file|checkbox|radio|submit|button/i.test(type)){
      if(required)return null;
      continue;
    }
    if(/csrf|token|captcha|terms|agree|consent|password|auth|payment|card/i.test(name))return null;
    if(type==='hidden'){
      const value=tagAttr(tag,'value');
      if(value==null||String(value).length>300)return null;
      payload[name]=String(value);
      continue;
    }
    if(!SAFE_FIELDS.has(name)){
      if(required)return null;
      continue;
    }
    if(name==='name'||name==='title')payload[name]='ToolScout';
    else if(['url','website','website_url','homepage','product_url','tool_url'].includes(name))payload[name]='https://trytoolscout.org/';
    else if(name==='description')payload[name]='ToolScout is an independent software discovery and recommendation platform.';
    else if(name==='tagline')payload[name]='Find the right software for the job without the noise.';
    else if(name==='category')payload[name]='Software';
    else if(name==='categories')payload[name]='Software';
    else if(name==='slug')payload[name]='toolscout';
    else if(name==='domain')payload[name]='trytoolscout.org';
    useful++;
  }
  return useful>=2?payload:null;
}
function htmlFormAdapter(homepage,html){
  if(POLICY_BLOCK_RE.test(html)||HUMAN_BLOCK_RE.test(html)||AUTH_RE.test(html))return null;
  for(const match of String(html||'').matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)){
    const open=match[1]||'',body=match[2]||'';
    const method=String(tagAttr(open,'method')||'GET').toUpperCase();
    if(method!=='POST'||HUMAN_BLOCK_RE.test(body)||POLICY_BLOCK_RE.test(body)||AUTH_RE.test(body))continue;
    const action=tagAttr(open,'action')||homepage;
    let endpoint;try{endpoint=new URL(action,homepage).toString()}catch{continue}
    if(!sameHostFamily(endpoint,homepage)||!endpoint.startsWith('https://'))continue;
    const payload=safeFormPayload(body);
    if(!payload)continue;
    return {endpoint,payload,method:'POST',content_type:'application/x-www-form-urlencoded',confidence:96,verification_source:homepage,verification_endpoint:null,verification_method:'GET',public_url:null,auth_required:false,auth_detail:null};
  }
  return null;
}
function serverBase(spec,source){try{const s=spec?.servers?.[0]?.url;if(s)return new URL(s,source).toString()}catch{}return new URL(source).origin+'/'}
function operationSecurity(spec,op){return op?.security!==undefined?op.security:(Array.isArray(spec?.security)?spec.security:null)}
function securityRequiresAuth(security){if(!Array.isArray(security)||security.length===0)return false;return !security.some(req=>req&&typeof req==='object'&&Object.keys(req).length===0)}
function authDetail(spec,security){
  if(!Array.isArray(security)||security.length===0)return null;
  const schemes=spec?.components?.securitySchemes||{};
  const names=[...new Set(security.flatMap(x=>Object.keys(x||{})))];
  return names.map(name=>{const s=schemes[name]||{};return {name,type:s.type||'unknown',scheme:s.scheme||null,in:s.in||null}}); 
}
function verificationFromSpec(spec,source,homepage){
  if(!spec||typeof spec!=='object'||!spec.paths)return null;
  const replacements={slug:'toolscout',domain:'trytoolscout.org',name:'toolscout',tool:'toolscout',startup:'toolscout',app:'toolscout'};
  for(const [path,methods] of Object.entries(spec.paths)){
    const op=methods?.get;
    if(!op||!ROUTE_RE.test(path+' '+safe(op.summary,300)+' '+safe(op.operationId,200)))continue;
    const sec=operationSecurity(spec,op);
    if(securityRequiresAuth(sec))continue;
    const params=[...String(path).matchAll(/\{([^}]+)\}/g)].map(m=>m[1]);
    if(!params.length&&!/toolscout/i.test(path))continue;
    if(params.some(p=>replacements[String(p).toLowerCase()]===undefined))continue;
    let filled=String(path);
    for(const p of params)filled=filled.replaceAll(`{${p}}`,encodeURIComponent(replacements[String(p).toLowerCase()]));
    const endpoint=new URL(filled,serverBase(spec,source)).toString();
    if(!sameHostFamily(endpoint,homepage))continue;
    return {verification_endpoint:endpoint,verification_method:'GET',public_url:endpoint};
  }
  return null;
}
function openApiAdapter(spec,source,homepage){
  if(!spec||typeof spec!=='object'||!spec.paths)return null;
  for(const [path,methods] of Object.entries(spec.paths)){
    const op=methods?.post;
    if(!op||!ROUTE_RE.test(path+' '+safe(op.summary,300)+' '+safe(op.operationId,200)))continue;
    const schema=schemaObject(spec,op),payload=payloadFromSchema(spec,schema);
    if(!payload)continue;
    const endpoint=new URL(path,serverBase(spec,source)).toString();
    if(!sameHostFamily(endpoint,homepage))continue;
    const blob=JSON.stringify({summary:op.summary,description:op.description,schema}).slice(0,12000);
    if(POLICY_BLOCK_RE.test(blob)||HUMAN_BLOCK_RE.test(blob))continue;
    const security=operationSecurity(spec,op),authRequired=securityRequiresAuth(security);
    const verification=verificationFromSpec(spec,source,homepage)||{};
    return {
      endpoint,payload,confidence:98,verification_source:source,
      auth_required:authRequired,auth_detail:authDetail(spec,security),
      verification_endpoint:verification.verification_endpoint||null,
      verification_method:verification.verification_method||'GET',
      public_url:verification.public_url||null
    };
  }
  return null;
}
async function findOpenApi(homepage,html){
  const guesses=[...links(html,homepage).filter(u=>DOC_RE.test(u)).slice(0,2),new URL('/openapi.json',homepage).toString(),new URL('/swagger.json',homepage).toString()];
  const unique=[...new Set(guesses)].filter(u=>sameHostFamily(u,homepage)).slice(0,4);
  const probes=await Promise.all(unique.map(u=>text(u,2500)));
  for(const r of probes){
    if(!r)continue;
    try{
      const j=JSON.parse(r.body);
      if(j.openapi||j.swagger){
        const a=openApiAdapter(j,r.url,homepage);
        if(a)return a;
      }
    }catch{}
  }
  return null;
}
async function relatedPolicyText(homepage,html){const terms=links(html,homepage).find(u=>/(terms|terms-of-service|tos|acceptable-use)/i.test(u));if(!terms)return '';const r=await text(terms,2500);return r?.body||''}
async function mark(env,row,result,detail){try{await env.DB.prepare(`INSERT INTO distribution_qualification_events(qualification_id,surface_slug,source_url,result,detail,created_at) VALUES(?,?,?,?,?,datetime('now'))`).bind(`qual_${crypto.randomUUID()}`,row.surface_slug,row.action_url,result,safe(detail,1200)).run();await env.DB.prepare(`UPDATE distribution_opportunities SET status=CASE WHEN status IN ('discovered','candidate') THEN 'research_required' ELSE status END,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run()}catch{}}
async function storeAutoAdapter(env,row,h,adapter,policyState){
  await env.DB.prepare(`INSERT INTO distribution_auto_adapters(surface_slug,source_url,endpoint,method,content_type,payload_template_json,confidence,policy_state,verification_source,verification_endpoint,public_url,verification_method,auth_type,auth_detail,last_checked_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET source_url=excluded.source_url,endpoint=excluded.endpoint,method=excluded.method,content_type=excluded.content_type,payload_template_json=excluded.payload_template_json,confidence=excluded.confidence,policy_state=excluded.policy_state,verification_source=excluded.verification_source,verification_endpoint=excluded.verification_endpoint,public_url=excluded.public_url,verification_method=excluded.verification_method,auth_type=excluded.auth_type,auth_detail=excluded.auth_detail,last_checked_at=datetime('now'),updated_at=datetime('now')`)
    .bind(row.surface_slug,h.url,adapter.endpoint,adapter.method||'POST',adapter.content_type||'application/json',JSON.stringify(adapter.payload),adapter.confidence,policyState,adapter.verification_source,adapter.verification_endpoint||null,adapter.public_url||null,adapter.verification_method||'GET',adapter.auth_required?'openapi_security':null,adapter.auth_detail?JSON.stringify(adapter.auth_detail):null).run();
}
function humanGatePayload(){
  return {
    name:'ToolScout',
    website:'https://trytoolscout.org/',
    domain:'trytoolscout.org',
    description:'ToolScout is an independent software discovery and recommendation platform.',
    tagline:'Find the right software for the job without the noise.'
  };
}
function isMachineOnlyActionUrl(value){
  try{
    const u=new URL(String(value||''));
    return /(?:^|\/)(?:api|openapi|swagger|mcp)(?:\/|$)|\.(?:json|yaml|yml)$/i.test(u.pathname);
  }catch{return false}
}
async function resolveHumanActionUrl(value){
  let candidate=String(value||'');
  let parsed;try{parsed=new URL(candidate)}catch{return candidate}
  if(parsed.protocol!=='https:')return candidate;
  if(!isMachineOnlyActionUrl(candidate))return candidate;
  for(const path of ['/submit','/add','/register','/signup','/sign-up']){
    const direct=await text(parsed.origin+path,3500);
    if(direct)return direct.url;
  }
  const home=await text(parsed.origin+'/',3500);
  if(!home)return parsed.origin+'/';
  const candidates=[...new Set(links(home.body,home.url)
    .filter(u=>sameHostFamily(u,home.url)&&ACTION_ROUTE_RE.test(u)&&!isMachineOnlyActionUrl(u))
    .filter(u=>!/(privacy|terms|legal|blog|docs|help|support|pricing)(?:[\/?#]|$)/i.test(new URL(u).pathname))
  )].sort((a,b)=>{
    const score=u=>/\/submit(?:[\/?#]|$)/i.test(u)?0:/add|list-your|new-tool|new-product/i.test(u)?1:/register|sign-up|signup/i.test(u)?2:3;
    return score(a)-score(b);
  }).slice(0,6);
  for(const u of candidates){
    const page=await text(u,3500);
    if(page)return page.url;
  }
  return parsed.origin+'/';
}
async function openDistributionHumanGate(env,row,{gateType='human_confirmation',actionUrl=null,reason=null,verificationUrl=null}={}){
  const target=row.surface_name||row.surface_slug;
  const isAuth=gateType==='authentication';
  const humanActionUrl=await resolveHumanActionUrl(actionUrl||row.action_url);
  if(await existingParentSubmission(env,row.surface_slug)){await reconcileDuplicateSubmissionGates(env);return null;}
  const previous=await env.DB.prepare('SELECT status FROM human_gate_contract WHERE gate_key=?').bind(humanGateKey('distribution','surface',row.surface_slug)).first();
  if(previous&&previous.status!=='open')return null;
  const page=validHumanActionUrl(humanActionUrl)?await text(humanActionUrl,4500):null;
  // A sign-in link in a navigation bar is not proof that submission requires login.
  const authProof=page&&(/<input[^>]+type=["']password["']/i.test(page.body)||/(?:must|need to|required to) (?:be logged|sign|log) in|login required|account required/i.test(page.body));
  const captchaProof=page&&/<(?:div|iframe|input)[^>]+(?:g-recaptcha|h-captcha|cf-turnstile|captcha)/i.test(page.body);
  if(!page||!(isAuth?authProof:captchaProof)){
    const detail='Chairman quality hold: no verified, actionable owner-only step on the destination. Engine must research the route and prepare exact instructions.';
    await env.DB.batch([
      env.DB.prepare("UPDATE distribution_opportunities SET status='research_required',human_required=0,next_action=?,updated_at=datetime('now') WHERE surface_slug=?").bind(detail,row.surface_slug),
      env.DB.prepare("UPDATE human_gate_contract SET status='cancelled',verification_detail=?,resolved_at=datetime('now'),updated_at=datetime('now') WHERE gate_key=? AND status='open'").bind(detail,humanGateKey('distribution','surface',row.surface_slug)),
      env.DB.prepare("INSERT INTO distribution_events(event_id,surface_slug,event_type,status,detail,observed_at,created_at) VALUES(?,?,'chairman_quality_hold','research_required',?,datetime('now'),datetime('now'))").bind(`quality_${crypto.randomUUID()}`,row.surface_slug,detail)
    ]);
    return null;
  }
  const finalActionUrl=page.url;
  const evidenceDetail=isAuth?'The destination displays a password form or an explicit login requirement.':'The destination displays an interactive CAPTCHA widget.';
  const humanReason=`${target}: ${evidenceDetail} Only the owner can complete this account or browser challenge.`;
  const instructions=isAuth
    ?`Open ${finalActionUrl}. Sign in to your ${target} account. Complete the ToolScout submission with the prepared name, website, tagline and description below. If a submission already exists, do not submit again; copy its result URL instead. Return here and mark the step done with that URL. Do not buy promotion or add a reciprocal badge.`
    :`Open ${finalActionUrl}. Complete the CAPTCHA shown on the submission form. Fill the ToolScout fields with the prepared details below and submit once. Return here and mark the step done with the result URL. Do not buy promotion or add a reciprocal badge.`;
  const gateKey=await upsertHumanGate(env,{
    engine:'distribution',
    subjectType:'surface',
    subjectKey:row.surface_slug,
    gateType,
    title:`${target}: human step required`,
    reason:humanReason,
    instructions,
    actionUrl:finalActionUrl,
    resolutionMode:'verify_publication',
    payload:{...humanGatePayload(),gate_evidence:{url:finalActionUrl,checked_at:new Date().toISOString(),detail:evidenceDetail}},
    verificationUrl
  });
  await env.DB.prepare(`UPDATE distribution_opportunities
    SET human_required=1,
        action_url=?,
        next_action=?,
        updated_at=datetime('now')
    WHERE surface_slug=?`).bind(finalActionUrl,instructions,row.surface_slug).run().catch(()=>{});
  return gateKey;
}
async function qualifyOne(env,row){
  let effectiveRow=row;
  if(isTechnicalSurface(row.action_url)){
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='skipped',human_required=0,next_action='Technical infrastructure host excluded from distribution discovery.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run().catch(()=>{});
    await mark(env,row,'skipped','technical_infrastructure_host');
    return 'skipped';
  }
  let h=await text(row.action_url);
  if(!h){
    await recordExternalRouteFailure(env,row,'homepage_unreachable');
    const recovered=await rediscoverActionUrl(env,row);
    if(recovered){effectiveRow={...row,action_url:recovered.url};h=recovered.page}
  }
  if(!h){await mark(env,effectiveRow,'research_required','homepage_unreachable');return 'research_required'}
  const relatedPolicy=await relatedPolicyText(h.url,h.body);
  if(POLICY_BLOCK_RE.test(h.body)||(relatedPolicy&&POLICY_BLOCK_RE.test(relatedPolicy))){
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='policy_blocked',human_required=0,next_action='Autonomous policy scan found a payment, reciprocal-link or anti-automation blocker. Keep suppressed unless policy changes.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
    await mark(env,effectiveRow,'policy_blocked','policy_blocker');
    return 'policy_blocked';
  }
  if(HUMAN_BLOCK_RE.test(h.body)||(relatedPolicy&&HUMAN_BLOCK_RE.test(relatedPolicy))){
    const reason='Autonomous research exhausted safe routes and detected a genuine human-only gate such as CAPTCHA, explicit confirmation or material terms acceptance.';
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='human_action_required',human_required=1,action_url=?,next_action=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(h.url,reason,effectiveRow.surface_slug).run();
    await openDistributionHumanGate(env,{...effectiveRow,action_url:h.url},{gateType:'human_confirmation',actionUrl:h.url,reason});
    await mark(env,{...effectiveRow,action_url:h.url},'human_action_required','hard_human_gate');
    return 'human_action_required';
  }
  const adapter=await findOpenApi(h.url,h.body);
  if(adapter){
    if(adapter.auth_required){
      await storeAutoAdapter(env,effectiveRow,h,adapter,'auth_required');
      const reason='Verified submission API discovered automatically, but the external service requires owner authentication before ToolScout can be submitted.';
      await env.DB.prepare(`UPDATE distribution_opportunities SET status='auth_required',human_required=1,automation_potential=85,acceptance_probability=70,action_url=?,next_action=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(h.url,reason,effectiveRow.surface_slug).run();
      await openDistributionHumanGate(env,{...effectiveRow,action_url:h.url},{gateType:'authentication',actionUrl:h.url,reason,verificationUrl:adapter.verification_endpoint||adapter.public_url||null});
      await mark(env,{...effectiveRow,action_url:h.url},'auth_required',`verified_authenticated_adapter:${adapter.endpoint}`);
      return 'auth_required';
    }
    await storeAutoAdapter(env,effectiveRow,h,adapter,'verified');
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='ready_to_submit',human_required=0,automation_potential=95,acceptance_probability=70,next_action='Verified no-auth JSON submission adapter discovered automatically.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
    await mark(env,effectiveRow,'ready_to_submit',`verified_auto_adapter:${adapter.endpoint}`);
    return 'ready_to_submit';
  }
  const formAdapter=htmlFormAdapter(h.url,h.body);
  if(formAdapter){
    await storeAutoAdapter(env,effectiveRow,h,formAdapter,'verified');
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='ready_to_submit',human_required=0,automation_potential=90,acceptance_probability=65,next_action='Verified same-host no-auth form adapter discovered automatically.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
    await mark(env,effectiveRow,'ready_to_submit',`verified_safe_form_adapter:${formAdapter.endpoint}`);
    return 'ready_to_submit';
  }
  const linkedActionUrls=[...new Set(links(h.body,h.url)
    .filter(u=>u!==h.url&&sameHostFamily(u,h.url)&&ACTION_ROUTE_RE.test(u))
    .filter(u=>!/(privacy|terms|legal|blog|docs|help|support|pricing)(?:[\\/?#]|$)/i.test(new URL(u).pathname))
  )].slice(0,5);
  let linkedAuth=false,linkedHuman=false,linkedPolicy=false,linkedAuthUrl=null,linkedHumanUrl=null;
  if(linkedActionUrls.length){
    const linkedPages=await Promise.all(linkedActionUrls.map(async u=>({u,page:await text(u,3500)})));
    for(const item of linkedPages){
      const page=item.page;if(!page)continue;
      const policy=await relatedPolicyText(page.url,page.body);
      if(POLICY_BLOCK_RE.test(page.body)||(policy&&POLICY_BLOCK_RE.test(policy))){linkedPolicy=true;continue}
      if(HUMAN_BLOCK_RE.test(page.body)||(policy&&HUMAN_BLOCK_RE.test(policy))){linkedHuman=true;linkedHumanUrl=page.url;continue}
      const linkedApi=await findOpenApi(page.url,page.body);
      if(linkedApi){
        if(linkedApi.auth_required){linkedAuth=true;linkedAuthUrl=page.url;continue}
        await storeAutoAdapter(env,effectiveRow,page,linkedApi,'verified');
        await env.DB.prepare(`UPDATE distribution_opportunities SET action_url=?,status='ready_to_submit',human_required=0,automation_potential=95,acceptance_probability=70,next_action='Verified no-auth submission API discovered by following a same-host action route automatically.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(page.url,effectiveRow.surface_slug).run();
        await mark(env,{...effectiveRow,action_url:page.url},'ready_to_submit',`verified_linked_auto_adapter:${linkedApi.endpoint}`);
        return 'ready_to_submit';
      }
      const linkedForm=htmlFormAdapter(page.url,page.body);
      if(linkedForm){
        await storeAutoAdapter(env,effectiveRow,page,linkedForm,'verified');
        await env.DB.prepare(`UPDATE distribution_opportunities SET action_url=?,status='ready_to_submit',human_required=0,automation_potential=90,acceptance_probability=65,next_action='Verified no-auth same-host submission form discovered by following a Submit/Add/List route automatically.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(page.url,effectiveRow.surface_slug).run();
        await mark(env,{...effectiveRow,action_url:page.url},'ready_to_submit',`verified_linked_safe_form_adapter:${linkedForm.endpoint}`);
        return 'ready_to_submit';
      }
      if(AUTH_RE.test(page.body)){linkedAuth=true;linkedAuthUrl=page.url;}
    }
  }
  if(linkedHuman){
    const actionUrl=linkedHumanUrl||effectiveRow.action_url;
    const reason='Autonomous route discovery found the exact submission path, but it contains a genuine human-only gate such as CAPTCHA or explicit confirmation.';
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='human_action_required',human_required=1,action_url=?,next_action=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(actionUrl,reason,effectiveRow.surface_slug).run();
    await openDistributionHumanGate(env,{...effectiveRow,action_url:actionUrl},{gateType:'human_confirmation',actionUrl,reason});
    await mark(env,{...effectiveRow,action_url:actionUrl},'human_action_required','linked_submission_route_human_gate');
    return 'human_action_required';
  }
  if(linkedAuth){
    const actionUrl=linkedAuthUrl||effectiveRow.action_url;
    const reason='Autonomous route discovery found the exact submission path, but owner authentication is required before ToolScout can be submitted.';
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='auth_required',human_required=1,action_url=?,next_action=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(actionUrl,reason,effectiveRow.surface_slug).run();
    await openDistributionHumanGate(env,{...effectiveRow,action_url:actionUrl},{gateType:'authentication',actionUrl,reason});
    await mark(env,{...effectiveRow,action_url:actionUrl},'auth_required','linked_submission_route_auth_required');
    return 'auth_required';
  }
  if(linkedPolicy){
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='policy_blocked',human_required=0,next_action='Autonomous same-host route discovery found only submission paths blocked by payment, reciprocal-link requirements or anti-automation policy.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
    await mark(env,effectiveRow,'policy_blocked','linked_submission_route_policy_blocked');
    return 'policy_blocked';
  }
  const pageText=h.body.toLowerCase();
  if(AUTH_RE.test(pageText)){
    const reason='The exact submission route requires owner authentication and no safe machine identity route was found.';
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='auth_required',human_required=1,action_url=?,next_action=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(h.url,reason,effectiveRow.surface_slug).run();
    await openDistributionHumanGate(env,{...effectiveRow,action_url:h.url},{gateType:'authentication',actionUrl:h.url,reason});
    await mark(env,{...effectiveRow,action_url:h.url},'auth_required','authentication_route_without_safe_adapter');
    return 'auth_required';
  }
  await env.DB.prepare(`UPDATE distribution_opportunities SET status='research_required',human_required=0,next_action='No safe automatic submission route found yet. Continue autonomous protocol and action-route research; do not escalate to Chairman.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
  await mark(env,effectiveRow,'research_required',/<form\b/i.test(h.body)?'safe_form_adapter_not_yet_resolved':'no_verified_submission_protocol');
  return 'research_required';
}
async function qualify(env){
  const q=await env.DB.prepare(`SELECT o.surface_slug,o.surface_name,o.action_url,o.distribution_score,o.status,o.last_checked_at
    FROM distribution_opportunities o
    WHERE o.human_required=0 AND o.action_url IS NOT NULL AND o.surface_slug<>'indexnow'
      AND (
        o.status IN ('discovered','candidate')
        OR (o.status='research_required' AND (o.last_checked_at IS NULL OR o.last_checked_at<=datetime('now','-${RESEARCH_COOLDOWN_HOURS} hours')))
        OR (o.status='ready_to_submit' AND NOT EXISTS (
          SELECT 1 FROM distribution_auto_adapters a
          WHERE a.surface_slug=o.surface_slug AND a.policy_state='verified' AND a.confidence>=95
        ))
      )
    ORDER BY CASE WHEN o.status='ready_to_submit' THEN 0 WHEN o.status IN ('discovered','candidate') THEN 1 ELSE 2 END,o.distribution_score DESC,o.last_checked_at ASC
    LIMIT ${QUALIFY_LIMIT}`).all();
  const outcomes=await Promise.all((q.results||[]).map(row=>qualifyOne(env,row)));
  let checked=outcomes.length,ready=0,auth=0,blocked=0,human=0,research=0,skipped=0;
  for(const r of outcomes){
    if(r==='ready_to_submit')ready++;
    else if(r==='auth_required')auth++;
    else if(r==='policy_blocked')blocked++;
    else if(r==='human_action_required')human++;
    else if(r==='skipped')skipped++;
    else research++;
  }
  if(checked>0){
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`qual_${crypto.randomUUID()}`,'autonomous_distribution_qualification','completed','distribution_engine',`Autonomous qualification checked ${checked} due surface(s): ${ready} verified no-auth adapter(s), ${auth} authenticated adapter(s) awaiting one-time credentials, ${blocked} policy blocked, ${human} human-only, ${research} still research-required, ${skipped} technical hosts skipped. Empty no-change cycles are not persisted.`).run();
  }
  return {ok:true,checked,ready,authRequired:auth,blocked,human,research,skipped,cooldown_hours:RESEARCH_COOLDOWN_HOURS,per_cycle_limit:QUALIFY_LIMIT,write_policy:'material_or_due_only'};
}
async function recoverMachineResolvableAuthGates(env){
  await ensureHumanGateSchema(env);
  const q=await env.DB.prepare(`SELECT surface_slug,surface_name,action_url,status,last_checked_at
    FROM distribution_opportunities
    WHERE status='auth_required' AND human_required=1 AND action_url IS NOT NULL
    ORDER BY updated_at ASC
    LIMIT 4`).all();
  let checked=0,recovered=0;
  for(const row of q.results||[]){
    checked++;
    const page=await text(row.action_url,4500);
    if(!page)continue;
    const adapter=await findOpenApi(page.url,page.body);
    if(!adapter||adapter.auth_required)continue;
    await storeAutoAdapter(env,row,page,adapter,'verified');
    await env.DB.prepare(`UPDATE distribution_opportunities
      SET status='ready_to_submit',
          human_required=0,
          automation_potential=95,
          acceptance_probability=70,
          next_action='Previously escalated authentication gate was reclassified as an open machine submission API. Autonomous execution resumed.',
          last_checked_at=datetime('now'),
          updated_at=datetime('now')
      WHERE surface_slug=?`).bind(row.surface_slug).run();
    await resolveHumanGate(env,humanGateKey('distribution','surface',row.surface_slug),{
      detail:`machine_resolvable_auth_gate_recovered:${adapter.endpoint}`
    });
    await mark(env,row,'ready_to_submit',`recovered_open_machine_adapter:${adapter.endpoint}`);
    recovered++;
  }
  return {checked,recovered};
}
async function syncExistingHumanGates(env){
  await ensureHumanGateSchema(env);
  const q=await env.DB.prepare(`SELECT surface_slug,surface_name,status,action_url,next_action,live_url
    FROM distribution_opportunities
    WHERE action_url IS NOT NULL
      AND status IN ('human_action_required','auth_required','approval_required')
    ORDER BY updated_at DESC
    LIMIT 40`).all();
  let synced=0;
  for(const row of q.results||[]){
    const gateType=row.status==='auth_required'?'authentication':(row.status==='approval_required'?'owner_approval':'human_confirmation');
    const reason=row.next_action||(
      gateType==='authentication'
        ?'Owner authentication is required before ToolScout can be submitted.'
        :'A genuine human-only step is required before autonomous execution can continue.'
    );
    await openDistributionHumanGate(env,row,{gateType,actionUrl:row.action_url,reason,verificationUrl:row.live_url||null});
    synced++;
  }
  return synced;
}

function gateEvidence(page,url){
  const body=String(page?.body||'');
  const finalUrl=String(page?.url||url||'');
  const urlEvidence=/toolscout/i.test(finalUrl);
  const bodyEvidence=/trytoolscout\.org|\bToolScout\b/i.test(body);
  return {ok:Boolean(page&&bodyEvidence||page&&urlEvidence),bodyEvidence,urlEvidence,finalUrl};
}

async function verifyHumanGateResolutions(env){
  await ensureHumanGateSchema(env);
  const gates=await dueHumanGateVerifications(env,{engine:'distribution',limit:10});
  let checked=0,resolved=0,deferred=0,reopened=0;
  for(const gate of gates){
    checked++;
    const [opp,adapter,placement]=await Promise.all([
      env.DB.prepare(`SELECT surface_slug,surface_name,status,action_url,live_url,next_action FROM distribution_opportunities WHERE surface_slug=? LIMIT 1`).bind(gate.subject_key).first().catch(()=>null),
      env.DB.prepare(`SELECT verification_endpoint,public_url FROM distribution_auto_adapters WHERE surface_slug=? LIMIT 1`).bind(gate.subject_key).first().catch(()=>null),
      env.DB.prepare(`SELECT public_url FROM distribution_placements WHERE surface_slug=? LIMIT 1`).bind(gate.subject_key).first().catch(()=>null)
    ]);
    const candidates=[gate.result_url,gate.verification_url,opp?.live_url,adapter?.verification_endpoint,adapter?.public_url,placement?.public_url]
      .filter(Boolean)
      .map(String)
      .filter((v,i,a)=>a.indexOf(v)===i)
      .slice(0,5);
    let proof=null;
    for(const candidate of candidates){
      const page=await text(candidate,6000);
      const evidence=gateEvidence(page,candidate);
      if(evidence.ok&&!/under review|pending (?:editorial )?review|awaiting approval/i.test(page?.body||'')){proof={candidate,page,evidence};break}
    }
    if(proof){
      const publicUrl=proof.evidence.finalUrl||proof.candidate;
      const link=backlinkEvidence(proof.page?.body||'');
      await resolveHumanGate(env,gate.gate_key,{resultUrl:publicUrl,detail:`verified_public_evidence:${publicUrl}`});
      await env.DB.prepare(`UPDATE distribution_opportunities
        SET status='verified',human_required=0,live_url=?,next_action='Human gate completed and public ToolScout evidence verified autonomously. Continue attribution and performance measurement.',last_checked_at=datetime('now'),updated_at=datetime('now')
        WHERE surface_slug=?`).bind(publicUrl,gate.subject_key).run().catch(()=>{});
      await env.DB.prepare(`INSERT INTO distribution_placements(surface_slug,public_url,placement_verified,backlink_verified,link_rel,first_verified_at,last_checked_at,created_at,updated_at)
        VALUES(?,?,1,?,?,datetime('now'),datetime('now'),datetime('now'),datetime('now'))
        ON CONFLICT(surface_slug) DO UPDATE SET public_url=excluded.public_url,placement_verified=1,backlink_verified=MAX(distribution_placements.backlink_verified,excluded.backlink_verified),link_rel=COALESCE(excluded.link_rel,distribution_placements.link_rel),first_verified_at=COALESCE(distribution_placements.first_verified_at,datetime('now')),last_checked_at=datetime('now'),updated_at=datetime('now')`)
        .bind(gate.subject_key,publicUrl,link.found?1:0,link.rel).run().catch(()=>{});
      await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at)
        VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
        .bind(`human_gate_${crypto.randomUUID()}`,gate.subject_key,'human_gate_resolved','verified',gate.action_url||null,publicUrl,'Owner completed the human-only step; autonomous verification confirmed public ToolScout evidence and resumed the distribution loop.').run().catch(()=>{});
      resolved++;
      continue;
    }
    const attempts=Number(gate.verification_attempts||0)+1;
    // Pending publication and unavailable verification are engine work, not a new owner task.
    await deferHumanGateVerification(env,gate.gate_key,{detail:candidates.length?'public_evidence_not_yet_confirmed':'engine_must_discover_public_verification_url',hours:attempts>=4?24:attempts===1?2:6});
    deferred++;
  }
  return {ok:true,checked,resolved,deferred,reopened};
}

function externalEvidenceUrl(value,endpoint){
  try{
    const u=new URL(String(value||''),endpoint);
    if(u.protocol!=='https:'||!sameHostFamily(u.href,endpoint))return null;
    return u.href;
  }catch{return null}
}
function findUrlInJson(value,endpoint,depth=0){
  if(depth>4||value==null)return null;
  if(typeof value==='string')return externalEvidenceUrl(value,endpoint);
  if(Array.isArray(value)){for(const v of value){const hit=findUrlInJson(v,endpoint,depth+1);if(hit)return hit}return null}
  if(typeof value!=='object')return null;
  const preferred=['public_url','publicUrl','listing_url','listingUrl','profile_url','profileUrl','status_url','statusUrl','resource_url','resourceUrl','url','href'];
  for(const key of preferred)if(value[key]){const hit=findUrlInJson(value[key],endpoint,depth+1);if(hit)return hit}
  for(const v of Object.values(value)){const hit=findUrlInJson(v,endpoint,depth+1);if(hit)return hit}
  return null;
}
async function responseEvidence(res,endpoint){
  const location=externalEvidenceUrl(res.headers.get('location'),endpoint);
  if(location)return location;
  const finalUrl=externalEvidenceUrl(res.url,endpoint);
  if(finalUrl&&finalUrl!==endpoint)return finalUrl;
  try{
    const raw=await res.text();
    if(!raw)return null;
    const json=JSON.parse(raw);
    return findUrlInJson(json,endpoint);
  }catch{return null}
}
async function packageAndExecute(env){
  const q=await env.DB.prepare(`SELECT a.surface_slug,a.endpoint,a.method,a.content_type,a.payload_template_json,a.verification_endpoint,a.public_url
    FROM distribution_auto_adapters a
    JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug
    LEFT JOIN distribution_economic_learning l ON l.surface_slug=a.surface_slug
    LEFT JOIN distribution_surface_costs c ON c.surface_slug=a.surface_slug
    WHERE a.policy_state='verified' AND a.confidence>=95 AND o.status='ready_to_submit'
      AND COALESCE(c.cost_amount,0)=0
      AND COALESCE(l.operating_decision,'explore') IN ('explore','measure','scale')
    ORDER BY CASE COALESCE(l.operating_decision,'explore') WHEN 'scale' THEN 0 WHEN 'measure' THEN 1 ELSE 2 END,o.distribution_score DESC
    LIMIT ${EXECUTION_LIMIT}`).all();
  const outcomes=await Promise.all((q.results||[]).map(async a=>{
    const prior=await env.DB.prepare(`SELECT submission_id,status FROM distribution_submissions WHERE surface_slug=? AND asset_url='https://trytoolscout.org/' AND submission_type='auto_discovered_json' LIMIT 1`).bind(a.surface_slug).first();
    if(prior&&['submitted','ready'].includes(prior.status))return 'deduped';
    const id=prior?.submission_id||`sub_${crypto.randomUUID()}`;
    if(!prior)await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(id,a.surface_slug,'https://trytoolscout.org/','auto_discovered_json','ready',a.payload_template_json,a.endpoint,0).run();
    try{
      const payload=JSON.parse(a.payload_template_json||'{}');
      const contentType=String(a.content_type||'application/json');
      const body=contentType==='application/x-www-form-urlencoded'?new URLSearchParams(Object.entries(payload).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v??'')])).toString():JSON.stringify(payload);
      const r=await fetch(a.endpoint,{method:String(a.method||'POST').toUpperCase(),headers:{'Content-Type':contentType,'Accept':'application/json,text/html;q=0.9,*/*;q=0.8','User-Agent':'ToolScout Distribution Engine/1.1'},body,redirect:'follow',signal:AbortSignal.timeout(7000)});
      if(r.ok){
        const evidence=await responseEvidence(r,a.endpoint);
        const responseUrl=evidence||a.verification_endpoint||a.public_url||r.url||a.endpoint;
        await env.DB.prepare(`UPDATE distribution_submissions SET status='submitted',attempts=attempts+1,last_attempt_at=datetime('now'),submitted_at=datetime('now'),response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(responseUrl,id).run();
        await env.DB.prepare(`UPDATE distribution_opportunities SET status='submitted',next_action='Automatic submission accepted; verification loop will confirm publication when a public resource becomes available.',updated_at=datetime('now') WHERE surface_slug=?`).bind(a.surface_slug).run();
        return 'sent';
      }
      await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(`HTTP ${r.status}`,id).run();
      return 'failed';
    }catch(e){
      await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(safe(e?.message||e,500),id).run();
      return 'failed';
    }
  }));
  return {sent:outcomes.filter(x=>x==='sent').length,failed:outcomes.filter(x=>x==='failed').length,deduped:outcomes.filter(x=>x==='deduped').length,per_cycle_limit:EXECUTION_LIMIT};
}
async function verifyAutoSubmitted(env){
  const q=await env.DB.prepare(`SELECT ds.submission_id,ds.surface_slug,ds.response_url,ds.action_url,a.verification_endpoint,a.public_url FROM distribution_submissions ds JOIN distribution_auto_adapters a ON a.surface_slug=ds.surface_slug LEFT JOIN distribution_opportunities o ON o.surface_slug=ds.surface_slug WHERE ds.submission_type='auto_discovered_json' AND ds.status='submitted' AND COALESCE(o.status,'') NOT IN ('verified','live') ORDER BY ds.submitted_at DESC LIMIT 6`).all();
  const outcomes=await Promise.all((q.results||[]).map(async row=>{
    const candidates=[row.response_url,row.verification_endpoint,row.public_url]
      .map(v=>externalEvidenceUrl(v,row.action_url||row.verification_endpoint||row.public_url||'https://example.com/'))
      .filter(Boolean);
    const target=candidates.find(v=>v!==row.action_url)||null;
    if(!target)return 'missing';
    try{
      const r=await fetch(target,{method:'GET',headers:{'Accept':'application/json,text/html;q=0.9,*/*;q=0.8','User-Agent':'ToolScout Distribution Verifier/1.0'},redirect:'follow',signal:AbortSignal.timeout(5000)});
      if(r.ok){
        const publicUrl=externalEvidenceUrl(r.url,target)||target;
        await env.DB.prepare(`UPDATE distribution_submissions SET response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(publicUrl,row.submission_id).run();
        await env.DB.prepare(`UPDATE distribution_auto_adapters SET public_url=COALESCE(public_url,?),verification_endpoint=COALESCE(verification_endpoint,?),updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,target,row.surface_slug).run();
        await env.DB.prepare(`UPDATE distribution_opportunities SET status='verified',live_url=COALESCE(live_url,?),last_checked_at=datetime('now'),next_action='Automatic publication verification confirmed. Monitor referral traffic, ranking and downstream monetization.',updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,row.surface_slug).run();
        return 'verified';
      }
      if(r.status===404||r.status===202)return 'pending';
      return 'error';
    }catch{return 'error'}
  }));
  const checked=outcomes.filter(x=>x!=='missing').length,verified=outcomes.filter(x=>x==='verified').length,pending=outcomes.filter(x=>x==='pending').length,missingVerification=outcomes.filter(x=>x==='missing').length,errors=outcomes.filter(x=>x==='error').length;
  if(checked||missingVerification){
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`autoverify_${crypto.randomUUID()}`,'autonomous_submission_verification',errors?'partial':'completed','distribution_engine',`Autonomous verification checked ${checked} submitted surface(s): ${verified} verified, ${pending} still pending, ${missingVerification} still lack a safe verification URL, ${errors} verification error(s).`).run();
  }
  return {checked,verified,pending,missingVerification,errors};
}

let autonomySchemaReady=null;
async function ensureAutonomySchema(env){
  if(autonomySchemaReady)return autonomySchemaReady;
  autonomySchemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS distribution_placements (
      surface_slug TEXT PRIMARY KEY,
      public_url TEXT NOT NULL,
      placement_verified INTEGER NOT NULL DEFAULT 0,
      backlink_verified INTEGER NOT NULL DEFAULT 0,
      link_rel TEXT,
      first_verified_at TEXT,
      last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_distribution_placements_backlink ON distribution_placements(backlink_verified,updated_at DESC)`)
  ]).catch(error=>{autonomySchemaReady=null;throw error});
  return autonomySchemaReady;
}
async function normalizeTechnicalOpportunities(env){
  try{
    const r=await env.DB.prepare(`UPDATE distribution_opportunities
      SET status='skipped',human_required=0,next_action='Technical infrastructure host excluded from distribution discovery.',last_checked_at=datetime('now'),updated_at=datetime('now')
      WHERE status NOT IN ('skipped','policy_blocked','rejected','unavailable_free','verified','live')
        AND surface_slug<>'indexnow'
        AND action_url IS NOT NULL
        AND (
          lower(action_url) LIKE 'https://api.%' OR lower(action_url) LIKE 'https://cdn.%' OR lower(action_url) LIKE 'https://static.%'
          OR lower(action_url) LIKE 'https://assets.%' OR lower(action_url) LIKE 'https://asset.%' OR lower(action_url) LIKE 'https://img.%'
          OR lower(action_url) LIKE 'https://images.%' OR lower(action_url) LIKE 'https://media.%' OR lower(action_url) LIKE 'https://js.%'
          OR lower(action_url) LIKE 'https://css.%' OR lower(action_url) LIKE 'https://fonts.%' OR lower(action_url) LIKE 'https://edge.%'
          OR lower(action_url) LIKE 'https://storage.%' OR lower(action_url) LIKE '%githubassets.com/%' OR lower(action_url) LIKE '%githubusercontent.com/%'
        )`).run();
    return Number(r?.meta?.changes||r?.changes||0);
  }catch{return 0}
}
async function normalizeLegacyHumanEscalations(env){
  let opportunities=0,submissions=0,editorial=0;
  try{
    const a=await env.DB.prepare(`UPDATE distribution_opportunities SET status='research_required',human_required=0,next_action='Autonomous route research resumed. Chairman escalation is reserved for genuine human-only gates.',updated_at=datetime('now') WHERE status='human_action_required' AND next_action LIKE 'Submission route detected but no safely verifiable machine-readable%'`).run();
    opportunities=Number(a?.meta?.changes||a?.changes||0);
  }catch{}
  try{
    const b=await env.DB.prepare(`UPDATE distribution_submissions SET status='research_required',human_required=0,error=NULL,updated_at=datetime('now') WHERE status='human_required' AND submission_type='research_asset'`).run();
    submissions=Number(b?.meta?.changes||b?.changes||0);
  }catch{}
  try{
    const d=await env.DB.prepare(`UPDATE distribution_editorial_queue SET status='retired_no_safe_executor',human_required=0,updated_at=datetime('now') WHERE status IN ('prepared','autonomy_pending') AND channel_type IN ('community','community_stack')`).run();
    editorial=Number(d?.meta?.changes||d?.changes||0);
  }catch{}
  return {opportunities,submissions,editorial};
}
function backlinkEvidence(html){
  for(const m of String(html||'').matchAll(/<a\b([^>]*?)href=["']([^"']*trytoolscout\.org[^"']*)["']([^>]*)>/gi)){
    const attrs=(m[1]||'')+' '+(m[3]||'');
    const rel=String((attrs.match(/\brel=["']([^"']*)["']/i)||[])[1]||'').toLowerCase();
    return {found:true,rel:rel||'follow'};
  }
  return {found:false,rel:null};
}
async function verifyFootprint(env){
  await ensureAutonomySchema(env);
  let rows=[];
  try{
    const q=await env.DB.prepare(`SELECT o.surface_slug,COALESCE(p.public_url,o.live_url,ds.response_url,o.action_url) public_url,p.last_checked_at
      FROM distribution_opportunities o
      LEFT JOIN distribution_submissions ds ON ds.surface_slug=o.surface_slug AND ds.status='submitted'
      LEFT JOIN distribution_placements p ON p.surface_slug=o.surface_slug
      WHERE o.status IN ('verified','live')
        AND o.surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery','indexnow')
        AND COALESCE(p.public_url,o.live_url,ds.response_url,o.action_url) IS NOT NULL
        AND (p.last_checked_at IS NULL OR p.last_checked_at<=datetime('now','-24 hours'))
      GROUP BY o.surface_slug
      ORDER BY COALESCE(p.last_checked_at,'1970-01-01') ASC
      LIMIT 6`).all();
    rows=q.results||[];
  }catch{return {checked:0,placements:0,backlinks:0,errors:1};}
  const outcomes=await Promise.all(rows.map(async row=>{
    try{
      const r=await fetch(row.public_url,{method:'GET',headers:{Accept:'text/html,application/json;q=0.8,*/*;q=0.5','User-Agent':'ToolScout Footprint Verifier/1.0'},redirect:'follow',signal:AbortSignal.timeout(5000)});
      const body=r.ok?(await r.text()).slice(0,500000):'';
      const link=backlinkEvidence(body);
      const publicUrl=r.url||row.public_url;
      await env.DB.prepare(`INSERT INTO distribution_placements(surface_slug,public_url,placement_verified,backlink_verified,link_rel,first_verified_at,last_checked_at,created_at,updated_at)
        VALUES(?,?,?,?,?,CASE WHEN ? THEN datetime('now') ELSE NULL END,datetime('now'),datetime('now'),datetime('now'))
        ON CONFLICT(surface_slug) DO UPDATE SET public_url=excluded.public_url,placement_verified=excluded.placement_verified,backlink_verified=excluded.backlink_verified,link_rel=excluded.link_rel,first_verified_at=COALESCE(distribution_placements.first_verified_at,excluded.first_verified_at),last_checked_at=datetime('now'),updated_at=datetime('now')`)
        .bind(row.surface_slug,publicUrl,r.ok?1:0,link.found?1:0,link.rel,r.ok?1:0).run();
      return {reachable:r.ok?1:0,backlink:link.found?1:0,error:0};
    }catch{return {reachable:0,backlink:0,error:1}}
  }));
  const checked=outcomes.length;
  const placements=outcomes.reduce((n,x)=>n+x.reachable,0);
  const backlinks=outcomes.reduce((n,x)=>n+x.backlink,0);
  const errors=outcomes.reduce((n,x)=>n+x.error,0);
  if(checked)try{
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`)
      .bind(`footprint_${crypto.randomUUID()}`,'distribution_footprint_verification',errors?'partial':'completed','distribution_engine',`Footprint verification checked ${checked} public placement(s): ${placements} reachable, ${backlinks} backlink(s) confirmed, ${errors} error(s).`).run()
  }catch{}
  return {checked,placements,backlinks,errors,recheck_hours:24,write_policy:'due_only'};
}
async function autonomyMetrics(env){
  await ensureAutonomySchema(env);
  const [opp,sub,place,editorial]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status IN ('verified','live') THEN 1 ELSE 0 END) verified,SUM(CASE WHEN human_required=1 AND status='human_action_required' THEN 1 ELSE 0 END) chairman FROM distribution_opportunities`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN human_required=0 AND attempts>0 THEN 1 ELSE 0 END) autonomous_attempted,SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) submitted FROM distribution_submissions WHERE created_at>=datetime('now','-30 days')`).first(),
    env.DB.prepare(`SELECT COUNT(*) placements,SUM(backlink_verified) backlinks FROM distribution_placements WHERE placement_verified=1`).first(),
    env.DB.prepare(`SELECT COUNT(*) chairman_editorial FROM distribution_editorial_queue WHERE human_required=1`).first()
  ]);
  let referralSessions=0;
  try{const metrics=await distributionSurfaceMetrics(env);referralSessions=(metrics||[]).reduce((n,m)=>n+Math.max(0,Number(m?.browser_confirmed_sessions??m?.human_sessions??0)||0),0)}catch{}
  const gates=await humanGateSnapshot(env).catch(()=>({byEngine:{}}));
  const distributionGates=gates?.byEngine?.distribution||{};
  return {discovered:Number(opp?.total||0),autonomousAttempted:Number(sub?.autonomous_attempted||0),submitted:Number(sub?.submitted||0),verifiedPlacements:Number(place?.placements||opp?.verified||0),verifiedBacklinks:Number(place?.backlinks||0),referralSessions,chairmanActions:Number(distributionGates.open||0)+Number(editorial?.chairman_editorial||0),humanGateContract:distributionGates,windowDays:30};
}
export async function runAutonomousDistributionCycle(env){
  await ensureAutonomySchema(env);
  const discovery=await runDiscoveryRefresh(env);
  await env.DB.prepare(`UPDATE distribution_opportunities
    SET status='ready_to_submit',human_required=0,next_action='Automatically submit newly discovered ToolScout URLs to IndexNow and track successful API acknowledgements.',updated_at=datetime('now')
    WHERE surface_slug='indexnow' AND status='skipped' AND next_action='Technical infrastructure host excluded from distribution discovery.'`).run().catch(()=>{});
  await env.DB.prepare(`UPDATE engine_runs
    SET status='failed',completed_at=datetime('now'),detail='superseded_by_healthy_autonomous_cycle',evidence_json='{"reason":"superseded_by_healthy_autonomous_cycle"}',updated_at=datetime('now')
    WHERE engine='distribution' AND mission='autonomous_cycle' AND status='running' AND started_at<datetime('now','-5 minutes')`).run().catch(()=>{});
  await ensureHumanGateSchema(env);
  const technicalSuppressed=await normalizeTechnicalOpportunities(env);
  const normalized=await normalizeLegacyHumanEscalations(env);
  const duplicateGates=await reconcileDuplicateSubmissionGates(env);
  const machineGateRecovery=await recoverMachineResolvableAuthGates(env);
  const humanGateSync=await syncExistingHumanGates(env);
  const humanGateVerification=await verifyHumanGateResolutions(env);
  const routeRefresh=await refreshPersistentActionUrls(env);
  const qualification=await qualify(env);
  const execution=await packageAndExecute(env);
  const verification=await verifyAutoSubmitted(env);
  const footprint=await verifyFootprint(env);
  return {ok:true,discovery,technicalSuppressed,normalized,duplicateGates,machineGateRecovery,humanGateSync,humanGateVerification,routeRefresh,qualification,execution,verification,footprint};
}
function admin(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}
export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/distribution/autonomous/refresh'&&request.method==='POST'){
      if(!admin(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});
      return Response.json(await runWithLedger(env,{engine:'distribution',mission:'autonomous_cycle',triggerName:'manual_api'},()=>runAutonomousDistributionCycle(env)),{headers:H});
    }
    if(u.pathname==='/api/distribution/autonomy/metrics'&&request.method==='GET'){
      if(!admin(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});
      return Response.json(await autonomyMetrics(env),{headers:H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    if(base.scheduled)return base.scheduled(event,env,ctx);
  }
};
