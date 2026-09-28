const SEO_ACTIONS=new Set([
  'deepen_existing_search_asset',
  'improve_click_capture',
  'protect_current_ranking',
  'strengthen_internal_links',
  'observe_low_sample_ranking',
  'repair_indexing',
  'repair_canonical_alignment',
  'search_measurement'
]);

async function ensureSeoSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS seo_runtime_state(
      pathname TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      source_generated_at TEXT,
      first_activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      indexnow_queued_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_seo_runtime_active ON seo_runtime_state(active,updated_at DESC)`)
  ]);
}
function pathOf(task){
  const value=String(task?.subject_key||'').trim();
  if(value.startsWith('/'))return value.replace(/\.html$/i,'');
  return null;
}
async function opportunityEvidence(env,task){
  try{
    const row=await env.DB.prepare(`SELECT signal_json,last_evaluated_at FROM growth_opportunity_state WHERE opportunity_key=? LIMIT 1`).bind(String(task?.opportunity_key||'')).first();
    let signal={};try{signal=JSON.parse(row?.signal_json||'{}')}catch{}
    return {
      impressions:Number(signal?.impressions||0),
      clicks:Number(signal?.clicks||0),
      position:Number(signal?.position||0),
      generatedAt:signal?.generatedAt||signal?.source_generated_at||row?.last_evaluated_at||null
    };
  }catch{return {impressions:0,clicks:0,position:0,generatedAt:null}}
}
async function adapter(env){
  try{
    const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org/data/distribution-submission-adapters.json'));
    if(!r.ok)return null;
    const d=await r.json();
    return (d.adapters||[]).find(x=>x?.surface_slug==='indexnow'&&x?.enabled&&x?.allow_automatic)||null;
  }catch{return null}
}
async function canonicalState(env,pathname){
  const expected='https://trytoolscout.org'+pathname;
  try{
    let response=null,proofSource='public_runtime';
    try{
      response=await fetch(expected,{headers:{'Cache-Control':'no-cache','User-Agent':'ToolScout-SEO-Canonical-Probe/1.0'},signal:AbortSignal.timeout(8000)});
    }catch{}
    if(!response||!response.ok){
      proofSource='static_asset_fallback';
      response=await env.ASSETS.fetch(new Request(expected,{headers:{'Cache-Control':'no-cache'}}));
    }
    if(!response.ok)return {verified:false,httpStatus:response.status,expected,proofSource,reason:'public_asset_not_200'};
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html'))return {verified:false,httpStatus:response.status,expected,proofSource,reason:'public_asset_not_html'};
    const html=await response.text();
    const canonical=(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)||[])[1]||null;
    const normalize=value=>{try{const u=new URL(value,expected);let p=u.pathname||'/';if(p==='/index.html')p='/';else if(/\.html$/i.test(p))p=p.replace(/\.html$/i,'');if(p.length>1)p=p.replace(/\/$/,'');return u.origin+p}catch{return null}};
    const verified=normalize(canonical)===normalize(expected);
    return {verified,httpStatus:response.status,expected,canonical,proofSource,reason:verified?'self_canonical_verified':'canonical_not_self'};
  }catch(error){return {verified:false,expected,reason:'canonical_probe_failed',error:String(error?.message||error).slice(0,300)}}
}
async function publicHtml(pathname){
  const probeUrl=new URL('https://trytoolscout.org'+pathname);
  probeUrl.searchParams.set('__ts_seo_probe',String(Date.now()));
  try{
    const r=await fetch(probeUrl.toString(),{headers:{'Cache-Control':'no-cache, no-store','Pragma':'no-cache','User-Agent':'ToolScout-SEO-Execution-Probe/1.0'},signal:AbortSignal.timeout(8000)});
    if(!r.ok)return {ok:false,status:r.status,html:''};
    const type=String(r.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html'))return {ok:false,status:r.status,html:''};
    return {ok:true,status:r.status,html:await r.text()};
  }catch(error){return {ok:false,status:0,html:'',error:String(error?.message||error).slice(0,300)}}
}
function hrefPresent(html,pathname){
  const body=String(html||'');
  const path=String(pathname||'');
  return body.includes('href="'+path+'"')||body.includes("href='"+path+"'");
}
async function verifyInternalLinkIntervention(pathname){
  const hubs=['/guides','/tools','/compare'];
  const pages=await Promise.all(hubs.map(hub=>publicHtml(hub)));
  const evidence=pages.map((page,index)=>({
    hub:hubs[index],
    ok:page.ok,
    linked:page.ok&&page.html.includes('data-toolscout-index-recovery-links="1"')&&hrefPresent(page.html,pathname),
    status:page.status
  }));
  const linked=evidence.filter(x=>x.linked).length;
  return {verified:linked>=2,linkedHubs:linked,hubs:evidence};
}
async function verifyDepthIntervention(pathname){
  const page=await publicHtml(pathname);
  const marker=page.ok&&(page.html.includes('organic-growth:runtime-start')||page.html.includes('organic-growth:start'));
  return {verified:Boolean(marker),status:page.status,marker:Boolean(marker)};
}

async function queueIndexNow(env,pathname){
  const a=await adapter(env);if(!a)return {queued:false,reason:'indexnow_adapter_unavailable'};
  const assetUrl='https://trytoolscout.org'+pathname;
  const existing=await env.DB.prepare(`SELECT submission_id,status,created_at,updated_at,last_attempt_at,submitted_at
    FROM distribution_submissions
    WHERE surface_slug='indexnow' AND asset_url=? AND submission_type='http_json'
    LIMIT 1`).bind(assetUrl).first().catch(()=>null);
  const payload={host:'trytoolscout.org',key:String(a.key||''),keyLocation:String(a.key_location||''),urlList:[assetUrl]};
  const endpoint=a.endpoint||'https://api.indexnow.org/indexnow';
  if(existing?.submission_id){
    const recent=await env.DB.prepare(`SELECT 1 ok FROM distribution_submissions
      WHERE submission_id=?
        AND COALESCE(last_attempt_at,submitted_at,updated_at,created_at)>=datetime('now','-7 days')
      LIMIT 1`).bind(existing.submission_id).first().catch(()=>null);
    if(recent?.ok)return {queued:false,reason:'recent_indexnow_exists',submissionId:existing.submission_id};
    await env.DB.prepare(`UPDATE distribution_submissions
      SET status='ready',payload_json=?,action_url=?,human_required=0,error=NULL,updated_at=datetime('now')
      WHERE submission_id=?`).bind(JSON.stringify(payload),endpoint,existing.submission_id).run();
    return {queued:true,reused:true,submissionId:existing.submission_id};
  }
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind('sub_'+crypto.randomUUID(),'indexnow',assetUrl,'http_json','ready',JSON.stringify(payload),endpoint,0).run();
  const changes=Number(inserted?.meta?.changes||inserted?.changes||0);
  return changes>0?{queued:true}:{queued:false,reason:'indexnow_already_exists'};
}
export async function executeCloudflareSeoTask(env,task){
  if(!task||!SEO_ACTIONS.has(String(task.action||'')))return {verified:false,reason:'unsupported_seo_action'};
  const pathname=pathOf(task);
  if(!pathname)return {verified:false,reason:'seo_path_required'};
  await ensureSeoSchema(env);
  const evidence=await opportunityEvidence(env,task);
  const action=String(task.action);
  let canonicalProof=null;
  if(action==='repair_canonical_alignment'){
    canonicalProof=await canonicalState(env,pathname);
    if(!canonicalProof.verified)return {verified:false,reason:canonicalProof.reason||'canonical_state_not_verified',executor:'seo_cloudflare',pathname,action,canonicalProof,evidence};
  }
  const mutationActions=new Set(['deepen_existing_search_asset','improve_click_capture','strengthen_internal_links','repair_indexing','repair_canonical_alignment']);
  if(mutationActions.has(action)){
    await env.DB.prepare(`INSERT INTO seo_runtime_state(pathname,reason,impressions,clicks,position,active,source_generated_at,first_activated_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,1,?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(pathname) DO UPDATE SET reason=excluded.reason,impressions=MAX(seo_runtime_state.impressions,excluded.impressions),
        clicks=MAX(seo_runtime_state.clicks,excluded.clicks),position=CASE WHEN excluded.position>0 THEN excluded.position ELSE seo_runtime_state.position END,
        active=1,source_generated_at=COALESCE(excluded.source_generated_at,seo_runtime_state.source_generated_at),
        last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(pathname,'execution_contract:'+action,evidence.impressions,evidence.clicks,evidence.position,evidence.generatedAt).run();
  }
  let indexNow={queued:false,reason:'not_required'};
  if(action==='repair_indexing'||action==='repair_canonical_alignment'||action==='deepen_existing_search_asset'||action==='improve_click_capture'||action==='strengthen_internal_links'){
    indexNow=await queueIndexNow(env,pathname);
    if(indexNow.queued)await env.DB.prepare(`UPDATE seo_runtime_state SET indexnow_queued_at=datetime('now'),updated_at=datetime('now') WHERE pathname=?`).bind(pathname).run().catch(()=>{});
  }
  let mutationProof=null;
  if(action==='strengthen_internal_links'){
    mutationProof=await verifyInternalLinkIntervention(pathname);
    if(!mutationProof.verified)return {verified:false,reason:'internal_links_not_yet_public',executor:'seo_cloudflare',pathname,action,evidence,indexNow,mutationProof};
  }
  if(action==='deepen_existing_search_asset'){
    mutationProof=await verifyDepthIntervention(pathname);
    if(!mutationProof.verified)return {verified:false,reason:'search_asset_depth_not_yet_public',executor:'seo_cloudflare',pathname,action,evidence,indexNow,mutationProof};
  }
  return {
    verified:true,
    executor:'seo_cloudflare',
    pathname,
    action,
    proof_kind:action==='repair_canonical_alignment'?'canonical_current_state_verified':action==='strengthen_internal_links'?'public_internal_links_verified':action==='deepen_existing_search_asset'?'public_search_asset_depth_verified':(mutationActions.has(action)?'cloudflare_runtime_state':'cloudflare_search_measurement'),
    evidence,
    canonicalProof,
    indexNow,
    mutationProof
  };
}
