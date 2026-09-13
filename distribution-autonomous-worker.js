import base from './distribution-submission-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const SAFE_FIELDS=new Set(['name','title','url','website','website_url','description','tagline','category','categories','slug','domain','homepage','product_url','tool_url']);
const BLOCK_RE=/(captcha|reciprocal|backlink|badge|payment|paid|credit card|terms acceptance|accept terms|automated submissions? (?:are )?(?:not allowed|prohibited|forbidden)|bots? (?:are )?(?:not allowed|prohibited|forbidden))/i;
const AUTH_RE=/(account required|sign in|login required|api key|bearer token|oauth)/i;
const ROUTE_RE=/(submit|submission|listing|listings|tool|tools|startup|startups|directory|register|add)/i;
const DOC_RE=/(openapi|swagger|api-docs|api\/docs|developer|for-llms|agent|mcp|registry|submit)/i;
const QUALIFY_LIMIT=12;
const EXECUTION_LIMIT=4;
const RESEARCH_COOLDOWN_HOURS=12;
function safe(v,n=4000){return String(v??'').slice(0,n)}
function host(v){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function sameHostFamily(a,b){const x=host(a),y=host(b);return x===y||x.endsWith('.'+y)||y.endsWith('.'+x)}
async function text(url,timeout=8000){try{const r=await fetch(url,{headers:{'User-Agent':'ToolScout-Distribution-Qualifier/1.0','Accept':'text/html,application/json;q=0.9,*/*;q=0.8'},redirect:'follow',signal:AbortSignal.timeout(timeout)});if(!r.ok)return null;return {url:r.url,contentType:r.headers.get('content-type')||'',body:(await r.text()).slice(0,800000)}}catch{return null}}
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
    const home=await text(current.origin+'/',6000);
    if(home){
      for(const u of links(home.body,home.url))if(sameHostFamily(u,home.url)&&ACTION_ROUTE_RE.test(u))candidates.push(u);
    }
  }catch{}
  for(const candidate of [...new Set(candidates)].filter(u=>u&&u!==row.action_url).slice(0,16)){
    const probe=await text(candidate,6000);
    if(!probe)continue;
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
    const q=await env.DB.prepare(`SELECT surface_slug,action_url,status,last_checked_at FROM distribution_opportunities WHERE action_url IS NOT NULL AND status IN ('human_action_required','auth_required','research_required') AND (last_checked_at IS NULL OR last_checked_at<=datetime('now','-6 hours')) ORDER BY last_checked_at ASC LIMIT 8`).all();
    for(const row of q.results||[]){
      checked++;
      const probe=await text(row.action_url,5000);
      if(probe){
        await env.DB.prepare(`UPDATE distribution_opportunities SET last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run();
        continue;
      }
      externalFailures++;
      await recordExternalRouteFailure(env,row,'action_url_verification_failed');
      const found=await rediscoverActionUrl(env,row);
      if(found)recovered++;
    }
  }catch{}
  return {checked,recovered,externalFailures};
}
function schemaObject(spec,op){const rb=op?.requestBody?.content?.['application/json']?.schema;if(!rb)return null;if(rb.$ref){const path=rb.$ref.replace(/^#\//,'').split('/');let cur=spec;for(const p of path)cur=cur?.[p];return cur||null}return rb}
function payloadFromSchema(schema){if(!schema||schema.type!=='object')return null;const props=schema.properties||{},required=schema.required||[];for(const key of required){if(!SAFE_FIELDS.has(key)||/(terms|agree|consent|captcha|password|token|key)/i.test(key))return null}const payload={};for(const key of Object.keys(props)){if(!SAFE_FIELDS.has(key))continue;if(key==='name'||key==='title')payload[key]='ToolScout';else if(['url','website','website_url','homepage','product_url','tool_url'].includes(key))payload[key]='https://trytoolscout.org/';else if(key==='description')payload[key]='ToolScout is an independent software discovery and recommendation platform.';else if(key==='tagline')payload[key]='Find the right software for the job without the noise.';else if(key==='category')payload[key]='Software';else if(key==='categories')payload[key]=['Software'];else if(key==='slug')payload[key]='toolscout';else if(key==='domain')payload[key]='trytoolscout.org'}for(const key of required)if(payload[key]===undefined)return null;return payload}
function serverBase(spec,source){try{const s=spec?.servers?.[0]?.url;if(s)return new URL(s,source).toString()}catch{}return new URL(source).origin+'/'}
function operationSecurity(spec,op){return op?.security!==undefined?op.security:(Array.isArray(spec?.security)?spec.security:null)}
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
    if(Array.isArray(sec)&&sec.length>0)continue;
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
    const schema=schemaObject(spec,op),payload=payloadFromSchema(schema);
    if(!payload)continue;
    const endpoint=new URL(path,serverBase(spec,source)).toString();
    if(!sameHostFamily(endpoint,homepage))continue;
    const blob=JSON.stringify({summary:op.summary,description:op.description,schema}).slice(0,12000);
    if(BLOCK_RE.test(blob))continue;
    const security=operationSecurity(spec,op),authRequired=Array.isArray(security)&&security.length>0;
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
  const guesses=[...links(html,homepage).filter(u=>DOC_RE.test(u)).slice(0,10),new URL('/openapi.json',homepage).toString(),new URL('/api/openapi.json',homepage).toString(),new URL('/swagger.json',homepage).toString(),new URL('/.well-known/openapi.json',homepage).toString()];
  const seen=new Set();
  for(const u of guesses){
    if(seen.has(u)||!sameHostFamily(u,homepage))continue;
    seen.add(u);
    const r=await text(u);
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
async function policyBlocked(homepage,html){if(BLOCK_RE.test(html))return true;const terms=links(html,homepage).find(u=>/(terms|terms-of-service|tos|acceptable-use)/i.test(u));if(!terms)return false;const r=await text(terms,6000);return Boolean(r&&BLOCK_RE.test(r.body))}
async function mark(env,row,result,detail){try{await env.DB.prepare(`INSERT INTO distribution_qualification_events(qualification_id,surface_slug,source_url,result,detail,created_at) VALUES(?,?,?,?,?,datetime('now'))`).bind(`qual_${crypto.randomUUID()}`,row.surface_slug,row.action_url,result,safe(detail,1200)).run();await env.DB.prepare(`UPDATE distribution_opportunities SET status=CASE WHEN status IN ('discovered','candidate') THEN 'research_required' ELSE status END,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(row.surface_slug).run()}catch{}}
async function storeAutoAdapter(env,row,h,adapter,policyState){
  await env.DB.prepare(`INSERT INTO distribution_auto_adapters(surface_slug,source_url,endpoint,method,content_type,payload_template_json,confidence,policy_state,verification_source,verification_endpoint,public_url,verification_method,auth_type,auth_detail,last_checked_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET source_url=excluded.source_url,endpoint=excluded.endpoint,method=excluded.method,content_type=excluded.content_type,payload_template_json=excluded.payload_template_json,confidence=excluded.confidence,policy_state=excluded.policy_state,verification_source=excluded.verification_source,verification_endpoint=excluded.verification_endpoint,public_url=excluded.public_url,verification_method=excluded.verification_method,auth_type=excluded.auth_type,auth_detail=excluded.auth_detail,last_checked_at=datetime('now'),updated_at=datetime('now')`)
    .bind(row.surface_slug,h.url,adapter.endpoint,'POST','application/json',JSON.stringify(adapter.payload),adapter.confidence,policyState,adapter.verification_source,adapter.verification_endpoint||null,adapter.public_url||null,adapter.verification_method||'GET',adapter.auth_required?'openapi_security':null,adapter.auth_detail?JSON.stringify(adapter.auth_detail):null).run();
}
async function qualifyOne(env,row){
  let effectiveRow=row;
  let h=await text(row.action_url);
  if(!h){
    await recordExternalRouteFailure(env,row,'homepage_unreachable');
    const recovered=await rediscoverActionUrl(env,row);
    if(recovered){effectiveRow={...row,action_url:recovered.url};h=recovered.page}
  }
  if(!h){await mark(env,effectiveRow,'research_required','homepage_unreachable');return 'research_required'}
  if(await policyBlocked(h.url,h.body)){
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='policy_blocked',next_action='Autonomous policy scan found a blocker requiring non-automatic handling.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
    await mark(env,effectiveRow,'policy_blocked','policy_or_terms_blocker');
    return 'policy_blocked';
  }
  const adapter=await findOpenApi(h.url,h.body);
  if(adapter){
    if(adapter.auth_required){
      await storeAutoAdapter(env,effectiveRow,h,adapter,'auth_required');
      await env.DB.prepare(`UPDATE distribution_opportunities SET status='auth_required',human_required=0,automation_potential=85,acceptance_probability=70,next_action='Verified JSON submission API discovered automatically, but it requires one-time authentication. Configure an authorized credential before execution.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
      await mark(env,effectiveRow,'auth_required',`verified_authenticated_adapter:${adapter.endpoint}`);
      return 'auth_required';
    }
    await storeAutoAdapter(env,effectiveRow,h,adapter,'verified');
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='ready_to_submit',human_required=0,automation_potential=95,acceptance_probability=70,next_action='Verified no-auth JSON submission adapter discovered automatically.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
    await mark(env,effectiveRow,'ready_to_submit',`verified_auto_adapter:${adapter.endpoint}`);
    return 'ready_to_submit';
  }
  const pageText=h.body.toLowerCase();
  if(/<form\b/i.test(h.body)||/(submit your|add your|list your|submit tool|submit startup)/i.test(pageText)||AUTH_RE.test(pageText)){
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='human_action_required',human_required=1,next_action='Submission route detected but no safely verifiable machine-readable no-auth JSON protocol was found.',last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(effectiveRow.surface_slug).run();
    await mark(env,effectiveRow,'human_action_required','form_auth_or_manual_route_only');
    return 'human_action_required';
  }
  await mark(env,effectiveRow,'research_required','no_verified_submission_protocol');
  return 'research_required';
}
async function qualify(env){
  const q=await env.DB.prepare(`SELECT surface_slug,action_url,distribution_score,status,last_checked_at FROM distribution_opportunities WHERE human_required=0 AND action_url IS NOT NULL AND (status IN ('discovered','candidate') OR (status='research_required' AND (last_checked_at IS NULL OR last_checked_at<=datetime('now','-${RESEARCH_COOLDOWN_HOURS} hours')))) ORDER BY CASE WHEN status IN ('discovered','candidate') THEN 0 ELSE 1 END,distribution_score DESC,last_checked_at ASC LIMIT ${QUALIFY_LIMIT}`).all();
  let checked=0,ready=0,auth=0,blocked=0,human=0,research=0;
  for(const row of q.results||[]){
    checked++;
    const r=await qualifyOne(env,row);
    if(r==='ready_to_submit')ready++;
    else if(r==='auth_required')auth++;
    else if(r==='policy_blocked')blocked++;
    else if(r==='human_action_required')human++;
    else research++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`qual_${crypto.randomUUID()}`,'autonomous_distribution_qualification','completed','distribution_engine',`Autonomous qualification checked ${checked} surface(s): ${ready} verified no-auth adapter(s), ${auth} authenticated adapter(s) awaiting one-time credentials, ${blocked} policy blocked, ${human} human-only, ${research} still research-required. Research cooldown ${RESEARCH_COOLDOWN_HOURS}h; per-cycle limit ${QUALIFY_LIMIT}.`).run();
  return {ok:true,checked,ready,authRequired:auth,blocked,human,research,cooldown_hours:RESEARCH_COOLDOWN_HOURS,per_cycle_limit:QUALIFY_LIMIT};
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
  const q=await env.DB.prepare(`SELECT a.surface_slug,a.endpoint,a.payload_template_json,a.verification_endpoint,a.public_url FROM distribution_auto_adapters a JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug WHERE a.policy_state='verified' AND a.confidence>=95 AND o.status='ready_to_submit' ORDER BY o.distribution_score DESC LIMIT ${EXECUTION_LIMIT}`).all();
  let sent=0,failed=0,deduped=0;
  for(const a of q.results||[]){
    const prior=await env.DB.prepare(`SELECT submission_id,status FROM distribution_submissions WHERE surface_slug=? AND asset_url='https://trytoolscout.org/' AND submission_type='auto_discovered_json' LIMIT 1`).bind(a.surface_slug).first();
    if(prior&&['submitted','ready'].includes(prior.status)){deduped++;continue}
    const id=prior?.submission_id||`sub_${crypto.randomUUID()}`;
    if(!prior)await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(id,a.surface_slug,'https://trytoolscout.org/','auto_discovered_json','ready',a.payload_template_json,a.endpoint,0).run();
    try{
      const r=await fetch(a.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'ToolScout Distribution Engine/1.0'},body:a.payload_template_json,redirect:'follow',signal:AbortSignal.timeout(15000)});
      if(r.ok){
        const evidence=await responseEvidence(r,a.endpoint);
        const responseUrl=evidence||a.verification_endpoint||a.public_url||r.url||a.endpoint;
        await env.DB.prepare(`UPDATE distribution_submissions SET status='submitted',attempts=attempts+1,last_attempt_at=datetime('now'),submitted_at=datetime('now'),response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(responseUrl,id).run();
        await env.DB.prepare(`UPDATE distribution_opportunities SET status='submitted',next_action='Automatic submission accepted; verification loop will confirm publication when a public resource becomes available.',updated_at=datetime('now') WHERE surface_slug=?`).bind(a.surface_slug).run();
        sent++;
      }else{
        await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(`HTTP ${r.status}`,id).run();
        failed++;
      }
    }catch(e){
      await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(safe(e?.message||e,500),id).run();
      failed++;
    }
  }
  return {sent,failed,deduped,per_cycle_limit:EXECUTION_LIMIT};
}
async function verifyAutoSubmitted(env){
  const q=await env.DB.prepare(`SELECT ds.submission_id,ds.surface_slug,ds.response_url,ds.action_url,a.verification_endpoint,a.public_url FROM distribution_submissions ds JOIN distribution_auto_adapters a ON a.surface_slug=ds.surface_slug LEFT JOIN distribution_opportunities o ON o.surface_slug=ds.surface_slug WHERE ds.submission_type='auto_discovered_json' AND ds.status='submitted' AND COALESCE(o.status,'') NOT IN ('verified','live') ORDER BY ds.submitted_at DESC LIMIT 30`).all();
  let checked=0,verified=0,pending=0,missingVerification=0,errors=0;
  for(const row of q.results||[]){
    const candidates=[row.response_url,row.verification_endpoint,row.public_url]
      .map(v=>externalEvidenceUrl(v,row.action_url||row.verification_endpoint||row.public_url||'https://example.com/'))
      .filter(Boolean);
    const target=candidates.find(v=>v!==row.action_url)||null;
    if(!target){missingVerification++;continue}
    checked++;
    try{
      const r=await fetch(target,{method:'GET',headers:{'Accept':'application/json,text/html;q=0.9,*/*;q=0.8','User-Agent':'ToolScout Distribution Verifier/1.0'},redirect:'follow',signal:AbortSignal.timeout(12000)});
      if(r.ok){
        const publicUrl=externalEvidenceUrl(r.url,target)||target;
        await env.DB.prepare(`UPDATE distribution_submissions SET response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(publicUrl,row.submission_id).run();
        await env.DB.prepare(`UPDATE distribution_auto_adapters SET public_url=COALESCE(public_url,?),verification_endpoint=COALESCE(verification_endpoint,?),updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,target,row.surface_slug).run();
        await env.DB.prepare(`UPDATE distribution_opportunities SET status='verified',live_url=COALESCE(live_url,?),last_checked_at=datetime('now'),next_action='Automatic publication verification confirmed. Monitor referral traffic, ranking and downstream monetization.',updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,row.surface_slug).run();
        verified++;
      }else if(r.status===404||r.status===202){
        pending++;
      }else{
        errors++;
      }
    }catch{errors++}
  }
  if(checked||missingVerification){
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`autoverify_${crypto.randomUUID()}`,'autonomous_submission_verification',errors?'partial':'completed','distribution_engine',`Autonomous verification checked ${checked} submitted surface(s): ${verified} verified, ${pending} still pending, ${missingVerification} still lack a safe verification URL, ${errors} verification error(s).`).run();
  }
  return {checked,verified,pending,missingVerification,errors};
}
async function cycle(env){
  const routeRefresh=await refreshPersistentActionUrls(env);
  const qualification=await qualify(env);
  const execution=await packageAndExecute(env);
  const verification=await verifyAutoSubmitted(env);
  return {ok:true,routeRefresh,qualification,execution,verification};
}
function admin(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}
export default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/api/distribution/autonomous/refresh'&&request.method==='POST'){if(!admin(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await cycle(env),{headers:H})}return base.fetch(request,env,ctx)},async scheduled(event,env,ctx){if(base.scheduled)await base.scheduled(event,env,ctx);ctx.waitUntil(cycle(env).catch(()=>{}))}};
