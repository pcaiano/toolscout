import base from './distribution-discovery-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const INDEXNOW_BATCH_LIMIT=1000;
const ASSET_SCAN_LIMIT=500;
const ACTIVE_SUBMISSION_STATUSES=['ready','submitted','human_required','adapter_missing','auth_required','setup_required','policy_blocked','research_required','failed'];
const safe=(v,n=2000)=>String(v??'').slice(0,n);

async function cfg(request,env){
  try{
    const r=await env.ASSETS.fetch(new Request(new URL('/data/distribution-submission-adapters.json',request.url)));
    return r.ok?await r.json():{adapters:[],policy:{}};
  }catch{return {adapters:[],policy:{}}}
}

async function publishingProfile(request,env){
  try{
    const r=await env.ASSETS.fetch(new Request(new URL('/data/distribution-publishing-profile.json',request.url)));
    if(r.ok)return await r.json();
  }catch{}
  return {product:{name:'ToolScout',slug:'toolscout',website:'https://trytoolscout.org/',tagline:'Find the right software for the job, without the noise.',description:'ToolScout is an independent software discovery and recommendation platform.',category:'Software',feed_json:'https://trytoolscout.org/api/distribution/feed.json'},founder:{name:'Pedro Caiano'}};
}

async function assets(request,env){
  try{
    const r=await env.DB.prepare(`SELECT asset_url url,asset_type title FROM distribution_asset_state WHERE asset_url IS NOT NULL ORDER BY last_seen_at DESC LIMIT ${ASSET_SCAN_LIMIT}`).all();
    const items=(r.results||[]).filter(x=>/^https:\/\/trytoolscout\.org\//.test(String(x.url||'')));
    if(items.length)return items;
  }catch{}
  try{
    const r=await env.ASSETS.fetch(new Request(new URL('/api/distribution/feed.json',request.url)));
    if(!r.ok)return[];
    const d=await r.json();
    return (d.items||[]).slice(0,50);
  }catch{return[]}
}

function hash(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function chooseAsset(surface,items){if(!items.length)return null;const idx=hash(`${surface.surface_slug}:${surface.surface_type||''}`)%items.length;return items[idx];}

function payloadFor(adapter,chosen,profile={}){
  const product=profile.product||{};
  const founder=profile.founder||{};
  if(adapter?.payload_kind==='indexnow')return {host:'trytoolscout.org',key:String(adapter.key||''),keyLocation:String(adapter.key_location||''),urlList:[chosen.url]};
  if(adapter?.payload_kind==='agenttool_tool')return {url:String(product.website||'https://trytoolscout.org/'),name:String(product.name||'ToolScout'),description:String(product.description||'Independent software discovery and recommendations.')};
  if(adapter?.payload_kind==='ora_scan')return {url:new URL(String(product.website||'https://trytoolscout.org/')).hostname};
  if(adapter?.payload_kind==='listed_startups_listing')return {name:String(product.name||'ToolScout'),slug:String(product.slug||'toolscout'),tagline:String(product.tagline||'Find the right software for the job, without the noise.'),description:String(product.description||'ToolScout is an independent software discovery and recommendation platform.'),url:String(product.website||'https://trytoolscout.org/'),categories:[String(adapter.validated_category||product.category||'Software')]};
  if(adapter?.payload_kind==='indietool_app')return {appName:String(product.name||'ToolScout'),appUrl:String(product.website||'https://trytoolscout.org/'),landingPageHeading:String(product.tagline||'Find the right software for the job, without the noise.'),landingPageSubHeading:String(product.description||'Independent software discovery and recommendations.'),category:String((product.indietool_category_preference||[])[0]||'Productivity'),creatorName:String(founder.name||'Pedro Caiano'),creatorSocialMediaLink:String(founder.x_brand||'https://x.com/trytoolscout')};
  return {name:String(product.name||'ToolScout'),url:chosen.url,title:chosen.title,feed:String(product.feed_json||'https://trytoolscout.org/api/distribution/feed.json')};
}

function timeoutFor(adapter){return Math.max(5000,Math.min(60000,Number(adapter?.timeout_ms)||10000));}
function headersFor(adapter,env){const h={'Content-Type':'application/json','User-Agent':'ToolScout Distribution Engine/1.0'};if(adapter?.auth_type==='bearer'&&adapter?.auth_env&&env[adapter.auth_env])h.Authorization=`Bearer ${env[adapter.auth_env]}`;return h;}
function retryableHttp(status){return status===408||status===425||status===429||status===500||status===502||status===503||status===504||status===520||status===521||status===522||status===523||status===524;}
function authMissing(adapter,env){return Boolean(adapter?.setup_state==='auth_required'&&((adapter.auth_env&&!env[adapter.auth_env])||adapter.auth_type==='agent_identity'));}
function policyBlocked(adapter,policy){return Boolean(adapter?.setup_state==='policy_blocked'||(policy?.zero_cost_only&&adapter?.requires_payment));}

function submissionKey(surfaceSlug,assetUrl,submissionType=''){return `${surfaceSlug}\n${assetUrl}\n${submissionType||''}`;}

async function loadExistingSubmissionState(env){
  try{
    const placeholders=ACTIVE_SUBMISSION_STATUSES.map(()=>'?').join(',');
    const r=await env.DB.prepare(`SELECT submission_id,surface_slug,asset_url,status,submission_type,created_at FROM distribution_submissions WHERE status IN (${placeholders}) ORDER BY created_at DESC`).bind(...ACTIVE_SUBMISSION_STATUSES).all();
    const exact=new Map(),anyType=new Map();
    for(const row of r.results||[]){
      const surface=String(row.surface_slug||''),asset=String(row.asset_url||''),type=String(row.submission_type||'');
      if(!surface||!asset)continue;
      const exactKey=submissionKey(surface,asset,type),anyKey=submissionKey(surface,asset,'');
      if(!exact.has(exactKey))exact.set(exactKey,row);
      if(!anyType.has(anyKey))anyType.set(anyKey,row);
    }
    return {exact,anyType,rows:(r.results||[]).length};
  }catch{return {exact:new Map(),anyType:new Map(),rows:0}}
}

function existingSubmissionFromState(state,surfaceSlug,assetUrl,submissionType=null){
  if(submissionType)return state.exact.get(submissionKey(surfaceSlug,assetUrl,submissionType))||null;
  return state.anyType.get(submissionKey(surfaceSlug,assetUrl,''))||null;
}

async function reclassify(env,prior,status,submissionType,actionUrl,payload,humanRequired){
  await env.DB.prepare(`UPDATE distribution_submissions SET submission_type=?,status=?,payload_json=?,action_url=?,human_required=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(submissionType,status,JSON.stringify(payload),actionUrl,humanRequired,prior.submission_id).run();
}

async function indexNowCoolingDown(env){
  try{return Boolean(await env.DB.prepare(`SELECT 1 ok FROM distribution_delivery_state WHERE surface_slug='indexnow' AND retry_after_at>datetime('now') LIMIT 1`).first());}
  catch{return false}
}

async function packageAutomaticProtocols(env,adapters,items,profile,existingState,limit=INDEXNOW_BATCH_LIMIT){
  let prepared=0,deduped=0,reclassified=0,cooldownSurfaces=0;
  const eligible=(adapters||[]).filter(x=>x.enabled&&x.allow_automatic&&x.method==='POST'&&x.content_type==='application/json'&&x.payload_kind==='indexnow');
  for(const adapter of eligible){
    if(adapter.surface_slug==='indexnow'&&await indexNowCoolingDown(env)){cooldownSurfaces++;continue;}
    for(const chosen of items){
      if(prepared>=limit)break;
      const payload=payloadFor(adapter,chosen,profile);
      const prior=existingSubmissionFromState(existingState,adapter.surface_slug,chosen.url,'http_json');
      if(prior){
        const stale=['human_required','adapter_missing','auth_required','setup_required','policy_blocked','research_required'].includes(prior.status);
        if(stale){await reclassify(env,prior,'ready','http_json',adapter.endpoint,payload,0);reclassified++;prepared++;}
        else deduped++;
        continue;
      }
      await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`sub_${crypto.randomUUID()}`,adapter.surface_slug,chosen.url,'http_json','ready',JSON.stringify(payload),adapter.endpoint,0).run();
      prepared++;
    }
    if(prepared>=limit)break;
  }
  return {prepared,deduped,reclassified,cooldownSurfaces};
}

async function packageQueue(request,env){
  const [a,p,profile,existingState]=await Promise.all([assets(request,env),cfg(request,env),publishingProfile(request,env),loadExistingSubmissionState(env)]);
  const protocol=await packageAutomaticProtocols(env,p.adapters,a,profile,existingState,INDEXNOW_BATCH_LIMIT);
  const r=await env.DB.prepare(`SELECT surface_slug,surface_name,surface_type,status,action_url,human_required FROM distribution_opportunities WHERE status='ready_to_submit' ORDER BY distribution_score DESC LIMIT 30`).all();
  let prepared=protocol.prepared,human=0,adapterMissing=0,authRequired=0,policyBlockedCount=0,deduped=protocol.deduped,reclassified=protocol.reclassified||0;
  for(const s of r.results||[]){
    const adapter=(p.adapters||[]).find(x=>x.surface_slug===s.surface_slug);
    const automatic=Boolean(adapter&&adapter.enabled&&adapter.allow_automatic);
    if(automatic&&adapter?.payload_kind==='indexnow')continue;
    const chosen=adapter?.asset_scope==='product'?{url:String(profile.product?.website||'https://trytoolscout.org/'),title:String(profile.product?.name||'ToolScout')}:chooseAsset(s,a);
    if(!chosen)continue;
    const trulyHuman=Boolean(Number(s.human_required)||false);
    let submissionType='prepared',status='adapter_missing',humanRequired=0,actionUrl=s.action_url||null;
    if(adapter&&policyBlocked(adapter,p.policy)){status='policy_blocked';actionUrl=adapter.endpoint||actionUrl;}
    else if(adapter&&authMissing(adapter,env)){status='auth_required';actionUrl=adapter.endpoint||actionUrl;}
    else if(automatic){submissionType='http_json';status='ready';actionUrl=adapter.endpoint||actionUrl;}
    else if(trulyHuman){status='human_required';humanRequired=1;}
    const payload=payloadFor(adapter,chosen,profile);
    const prior=existingSubmissionFromState(existingState,s.surface_slug,chosen.url,automatic?'http_json':null);
    if(prior){
      const stale=['human_required','adapter_missing','auth_required','setup_required','policy_blocked','research_required'].includes(prior.status);
      if(stale&&prior.status!==status){await reclassify(env,prior,status,submissionType,actionUrl,payload,humanRequired);reclassified++;}
      else deduped++;
      continue;
    }
    const id=`sub_${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(id,s.surface_slug,chosen.url,submissionType,status,JSON.stringify(payload),actionUrl,humanRequired).run();
    prepared++;
    if(status==='human_required')human++;
    if(status==='adapter_missing')adapterMissing++;
    if(status==='auth_required')authRequired++;
    if(status==='policy_blocked')policyBlockedCount++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`pack_${crypto.randomUUID()}`,'submission_packaging_refresh','completed','distribution_engine',`Submission Engine prepared ${prepared} item(s), including ${protocol.prepared} IndexNow candidate URL(s) from ${a.length} known asset(s); existing submission state was loaded once (${existingState.rows} active rows) instead of queried once per asset; ${protocol.cooldownSurfaces} automatic protocol surface(s) deferred by rate-limit cooldown; reclassified ${reclassified} stale item(s); ${adapterMissing} await verified adapters; ${authRequired} await authentication; ${policyBlockedCount} blocked by policy; ${human} truly require human action; ${deduped} duplicate(s) skipped.`).run();
  return {ok:true,assets:a.length,prepared,directProtocol:protocol.prepared,protocolCooldown:protocol.cooldownSurfaces,reclassified,adapterMissing,authRequired,policyBlocked:policyBlockedCount,humanRequired:human,deduped,existingStateRows:existingState.rows,d1Mode:'bulk_existing_submission_state'};
}

async function execute(request,env){
  const p=await cfg(request,env),max=Math.max(1,Math.min(3,Number(p.policy?.max_automatic_per_run)||3)),maxAttempts=Math.max(1,Math.min(5,Number(p.policy?.max_attempts)||3));
  const r=await env.DB.prepare(`SELECT * FROM distribution_submissions WHERE human_required=0 AND surface_slug<>'indexnow' AND ((status='ready') OR (status='failed' AND error LIKE 'retryable:%' AND attempts<? AND last_attempt_at<=datetime('now','-1 hour'))) ORDER BY CASE status WHEN 'ready' THEN 0 ELSE 1 END,created_at LIMIT ?`).bind(maxAttempts,Math.max(max,100)).all();
  let sent=0,failed=0,blocked=0,retried=0,terminal=0,batched=0,cooldown=0;
  const rows=r.results||[],otherRows=rows.slice(0,max);
  for(const row of otherRows){
    if(row.status==='failed')retried++;
    const adapter=(p.adapters||[]).find(x=>x.surface_slug===row.surface_slug);
    if(!adapter||!adapter.enabled||!adapter.allow_automatic||adapter.method!=='POST'||adapter.content_type!=='application/json'||adapter.endpoint!==row.action_url){await env.DB.prepare(`UPDATE distribution_submissions SET status='adapter_missing',human_required=0,error='adapter_not_verified',updated_at=datetime('now') WHERE submission_id=?`).bind(row.submission_id).run();blocked++;continue;}
    if(policyBlocked(adapter,p.policy)){await env.DB.prepare(`UPDATE distribution_submissions SET status='policy_blocked',human_required=0,error='zero_cost_policy',updated_at=datetime('now') WHERE submission_id=?`).bind(row.submission_id).run();blocked++;continue;}
    if(authMissing(adapter,env)){await env.DB.prepare(`UPDATE distribution_submissions SET status='auth_required',human_required=0,error='adapter_auth_missing',updated_at=datetime('now') WHERE submission_id=?`).bind(row.submission_id).run();blocked++;continue;}
    try{
      const res=await fetch(adapter.endpoint,{method:'POST',headers:headersFor(adapter,env),body:row.payload_json,signal:AbortSignal.timeout(timeoutFor(adapter))});
      if(res.ok){await env.DB.prepare(`UPDATE distribution_submissions SET status='submitted',attempts=attempts+1,last_attempt_at=datetime('now'),submitted_at=datetime('now'),response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(res.url||adapter.endpoint,row.submission_id).run();sent++;}
      else{const isRetryable=retryableHttp(res.status);const err=`${isRetryable?'retryable':'terminal'}:HTTP ${res.status}`;await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(err,row.submission_id).run();failed++;if(!isRetryable)terminal++;}
    }catch(e){const msg=safe(e?.message||e,900);await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(`retryable:${msg}`,row.submission_id).run();failed++;}
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`submit_${crypto.randomUUID()}`,'submission_execution_refresh',failed?'partial':'completed','distribution_engine',`Submission Engine executed ${sent} verified automatic submission(s); IndexNow delivery is owned by the adaptive throughput worker; retried ${retried}; ${blocked} blocked or awaiting setup; ${failed} failed (${terminal} terminal).`).run();
  return {ok:true,sent,batched,cooldown,retried,blocked,failed,terminal,indexNowOwner:'adaptive_throughput'};
}

async function verifySubmitted(request,env){
  const p=await cfg(request,env);
  const r=await env.DB.prepare(`SELECT ds.submission_id,ds.surface_slug,ds.asset_url,ds.submitted_at FROM distribution_submissions ds LEFT JOIN distribution_opportunities o ON o.surface_slug=ds.surface_slug WHERE ds.status='submitted' AND COALESCE(o.status,'') NOT IN ('verified','live') ORDER BY ds.submitted_at DESC LIMIT 20`).all();
  let checked=0,verified=0,pending=0,errors=0;
  for(const row of r.results||[]){
    const adapter=(p.adapters||[]).find(x=>x.surface_slug===row.surface_slug);
    if(!adapter?.verification_endpoint||String(adapter.verification_method||'GET').toUpperCase()!=='GET')continue;
    checked++;
    try{
      const res=await fetch(adapter.verification_endpoint,{method:'GET',headers:{'Accept':'application/json','User-Agent':'ToolScout Distribution Engine/1.0'},signal:AbortSignal.timeout(timeoutFor(adapter))});
      if(res.ok){const publicUrl=String(adapter.public_url||res.url||adapter.verification_endpoint);await env.DB.prepare(`UPDATE distribution_submissions SET response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(publicUrl,row.submission_id).run();await env.DB.prepare(`UPDATE distribution_opportunities SET status='verified',last_checked_at=datetime('now'),next_action=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(`Public verification confirmed at ${publicUrl}. Monitor referral traffic and downstream monetization.`,row.surface_slug).run();verified++;}
      else if(res.status===404)pending++;
      else errors++;
    }catch{errors++;}
  }
  if(checked)await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`verify_${crypto.randomUUID()}`,'submission_verification_refresh',errors?'partial':'completed','distribution_engine',`Submission verification checked ${checked} surface(s); ${verified} newly public/verified; ${pending} still pending; ${errors} verification error(s).`).run();
  return {ok:true,checked,verified,pending,errors};
}

async function auth(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/distribution/submissions/package'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await packageQueue(request,env),{headers:H});}
    if(u.pathname==='/api/distribution/submissions/execute'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await execute(request,env),{headers:H});}
    if(u.pathname==='/api/distribution/submissions/verify'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await verifySubmitted(request,env),{headers:H});}
    if(u.pathname==='/api/distribution/submissions'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});const r=await env.DB.prepare(`SELECT submission_id,surface_slug,asset_url,submission_type,status,action_url,attempts,submitted_at,response_url,error,human_required,updated_at FROM distribution_submissions ORDER BY created_at DESC LIMIT 100`).all();return Response.json({status:'connected',items:r.results||[]},{headers:H});}
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const hourly=event?.cron==='15 * * * *';
    const daily=event?.cron==='15 3 * * *';
    if(daily&&base.scheduled)await base.scheduled(event,env,ctx);
    if(hourly||daily){
      await packageQueue(new Request('https://trytoolscout.org/'),env);
      await execute(new Request('https://trytoolscout.org/'),env);
      await verifySubmitted(new Request('https://trytoolscout.org/'),env);
    }
  }
};