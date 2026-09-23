import base from './cloudflare-primary-runtime-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
let schemaReady=null,configCache=null;

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const strip=v=>String(v??'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
function canonicalPath(value){try{const u=new URL(String(value));let p=u.pathname||'/';if(p==='/index.html')p='/';else if(/\.html$/i.test(p))p=p.replace(/\.html$/i,'');return p}catch{return null}}
function htmlResponse(response,html){const h=new Headers(response.headers);h.set('Content-Type','text/html; charset=UTF-8');h.set('Cache-Control','private, no-store, max-age=0');h.delete('Content-Length');h.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
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
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
async function assetJson(request,env,path,fallback){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}
}
async function config(request,env){
  if(configCache&&Date.now()-configCache.at<3600000)return configCache.value;
  const [intents,consolidations,adapters]=await Promise.all([
    assetJson(request,env,'/data/intents.json',[]),
    assetJson(request,env,'/data/seo-consolidations.json',{}),
    assetJson(request,env,'/data/distribution-submission-adapters.json',{adapters:[]})
  ]);
  const value={intents:Array.isArray(intents)?intents:[],consolidations:consolidations||{},adapters:adapters?.adapters||[]};
  configCache={at:Date.now(),value};return value;
}
async function gscSignals(env){
  try{
    const row=await env.DB.prepare(`SELECT payload_json,source_generated_at FROM growth_asset_cache WHERE path='/reports/gsc-signals.json' LIMIT 1`).first();
    if(row?.payload_json)return {data:JSON.parse(row.payload_json),generatedAt:row.source_generated_at||null};
  }catch{}
  return {data:null,generatedAt:null};
}
async function activeState(env,pathname){
  try{return await env.DB.prepare(`SELECT pathname,reason,impressions,clicks,position,active,source_generated_at,first_activated_at,last_evaluated_at,indexnow_queued_at,updated_at FROM seo_runtime_state WHERE pathname=? AND active=1 LIMIT 1`).bind(pathname).first()}catch{return null}
}
function criteriaFor(cfg,slug){
  const intent=cfg.intents.find(x=>x?.slug===slug);
  const keys=Object.keys(intent?.weights||{}).filter(x=>x!=='category').slice(0,5);
  return keys.length?keys:['workflow fit','integrations','ease of use','price'];
}
function decisionBlock(slug,criteria){
  const subject=String(slug||'').replace(/^best-/,'').replace(/-/g,' ');
  const items=criteria.map(x=>`<li>${esc(String(x).replace(/([a-z])([A-Z])/g,'$1 $2'))}</li>`).join('');
  return `<!-- organic-growth:runtime-start --><section class="section organic-growth-context" data-og-variant="cloudflare-decision-depth-v1"><h2>How to choose ${esc(subject)}</h2><p>Start with the job you need the software to do, then compare the shortlist on workflow fit, integrations, usability and current cost. Remove any option that misses a must-have requirement before comparing secondary features.</p><h3>Decision checklist</h3><ul>${items}</ul><p>ToolScout updates this guide from observed search demand and current catalog evidence. Rankings remain based on fit, not affiliate payout.</p></section><!-- organic-growth:runtime-end -->`;
}
function ensureFavicon(html){return /<link\b[^>]*rel=["'][^"']*icon/i.test(html)?html:html.replace(/<head>/i,'<head><link rel="icon" href="/favicon.svg" type="image/svg+xml">')}
function shortenTitle(html,pathname){
  const m=html.match(/<title>([\s\S]*?)<\/title>/i);if(!m)return html;
  const current=strip(m[1]);if(current.length<=65)return html;
  const h1=strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');if(!h1)return html;
  let next='';
  if(pathname.startsWith('/tools/'))next=`${h1}: Features & Pricing | ToolScout`;
  else if(pathname.includes('-vs-'))next=`${h1} Comparison | ToolScout`;
  else if(pathname.startsWith('/best-'))next=`${h1} | ToolScout`;
  if(!next||next.length>65)return html;
  return html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${esc(next)}</title>`);
}
function ensureCanonical(html,pathname,cfg){
  const slug=pathname.replace(/^\//,'');
  if(cfg.consolidations?.[slug])return html;
  if(!pathname.startsWith('/best-'))return html;
  const expected=`https://trytoolscout.org${pathname}`;
  const re=/<link[^>]+rel=["']canonical["'][^>]*>/i;
  const alt=/<link[^>]+href=["'][^"']+["'][^>]+rel=["']canonical["'][^>]*>/i;
  if(re.test(html))return html.replace(re,`<link rel="canonical" href="${expected}">`);
  if(alt.test(html))return html.replace(alt,`<link rel="canonical" href="${expected}">`);
  return html.replace(/<\/head>/i,`<link rel="canonical" href="${expected}"></head>`);
}
function validate(html,pathname,cfg){
  const failures=[];
  const title=strip(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'');
  if(!title)failures.push('missing_title');
  if(title.length>65)failures.push('title_too_long');
  if(pathname.startsWith('/best-')&&!cfg.consolidations?.[pathname.slice(1)]){
    if(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html))failures.push('unexpected_noindex');
    const c=html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]||html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]||'';
    if(c!==`https://trytoolscout.org${pathname}`)failures.push('canonical_mismatch');
  }
  if(/organic-growth:runtime-start/.test(html)&&/[—–]/.test(html.match(/<!-- organic-growth:runtime-start -->[\s\S]*?<!-- organic-growth:runtime-end -->/)?.[0]||''))failures.push('runtime_block_long_dash');
  return {ok:failures.length===0,failures};
}
async function transformPage(request,response,env){
  if(request.method!=='GET'||!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))return response;
  const pathname=canonicalPath(request.url);if(!pathname||pathname.startsWith('/analytics')||pathname.startsWith('/admin'))return response;
  try{
    const clone=response.clone();
    let html=await clone.text(),original=html;
    const cfg=await config(request,env);
    html=ensureFavicon(html);
    html=shortenTitle(html,pathname);
    html=ensureCanonical(html,pathname,cfg);
    const state=await activeState(env,pathname);
    if(state&&pathname.startsWith('/best-')&&!cfg.consolidations?.[pathname.slice(1)]&&!html.includes('organic-growth:runtime-start')&&!html.includes('organic-growth:start')){
      const block=decisionBlock(pathname.slice(1),criteriaFor(cfg,pathname.slice(1)));
      const marker='<section class="section"><h2>How ToolScout chooses</h2>';
      html=html.includes(marker)?html.replace(marker,block+marker):html.replace(/<\/body>/i,block+'</body>');
    }
    if(html===original)return response;
    const gate=validate(html,pathname,cfg);
    if(!gate.ok)return response;
    return htmlResponse(response,html);
  }catch{
    return response;
  }
}
async function queueIndexNow(request,env,pathname,cfg){
  const adapter=cfg.adapters.find(x=>x?.surface_slug==='indexnow'&&x?.enabled&&x?.allow_automatic);
  if(!adapter)return false;
  const assetUrl=`https://trytoolscout.org${pathname}`;
  const recent=await env.DB.prepare(`SELECT 1 ok FROM distribution_submissions WHERE surface_slug='indexnow' AND asset_url=? AND created_at>=datetime('now','-7 days') LIMIT 1`).bind(assetUrl).first().catch(()=>null);
  if(recent?.ok)return false;
  const payload={host:'trytoolscout.org',key:String(adapter.key||''),keyLocation:String(adapter.key_location||''),urlList:[assetUrl]};
  await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(`sub_${crypto.randomUUID()}`,'indexnow',assetUrl,'http_json','ready',JSON.stringify(payload),adapter.endpoint||'https://api.indexnow.org/indexnow',0).run();
  return true;
}
async function refreshState(request,env){
  await ensureSchema(env);
  const {data,generatedAt}=await gscSignals(env),cfg=await config(request,env);
  const pages=Array.isArray(data?.pages)?data.pages:[],seen=new Set(),activated=[],queued=[];
  for(const page of pages){
    const pathname=canonicalPath(page.page);if(!pathname||!pathname.startsWith('/best-'))continue;
    const slug=pathname.slice(1);if(cfg.consolidations?.[slug])continue;
    const impressions=Number(page.impressions||0),position=Number(page.position||0),clicks=Number(page.clicks||0);
    if(impressions<20||position<=10)continue;
    seen.add(pathname);
    const prior=await env.DB.prepare(`SELECT active,indexnow_queued_at FROM seo_runtime_state WHERE pathname=? LIMIT 1`).bind(pathname).first().catch(()=>null);
    await env.DB.prepare(`INSERT INTO seo_runtime_state(pathname,reason,impressions,clicks,position,active,source_generated_at,first_activated_at,last_evaluated_at,updated_at)
      VALUES(?,'observed_search_demand',?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(pathname) DO UPDATE SET reason='observed_search_demand',impressions=excluded.impressions,clicks=excluded.clicks,position=excluded.position,active=1,source_generated_at=excluded.source_generated_at,last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(pathname,impressions,clicks,position,1,generatedAt||data?.generatedAt||null).run();
    if(!prior?.active)activated.push(pathname);
    if(!prior?.indexnow_queued_at&&await queueIndexNow(request,env,pathname,cfg)){
      await env.DB.prepare(`UPDATE seo_runtime_state SET indexnow_queued_at=datetime('now'),updated_at=datetime('now') WHERE pathname=?`).bind(pathname).run();queued.push(pathname);
    }
  }
  const rows=(await env.DB.prepare(`SELECT pathname FROM seo_runtime_state WHERE active=1`).all()).results||[];
  for(const row of rows)if(!seen.has(row.pathname))await env.DB.prepare(`UPDATE seo_runtime_state SET active=0,last_evaluated_at=datetime('now'),updated_at=datetime('now') WHERE pathname=?`).bind(row.pathname).run();
  return {ok:true,executor:'cloudflare',gscGeneratedAt:generatedAt||data?.generatedAt||null,observedPages:pages.length,active:seen.size,activated,queuedIndexNow:queued};
}
async function health(env){
  await ensureSchema(env);
  const summary=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) active,SUM(CASE WHEN indexnow_queued_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) indexnow_queued_24h,MAX(updated_at) updated_at FROM seo_runtime_state`).first();
  const items=(await env.DB.prepare(`SELECT pathname,reason,impressions,clicks,position,active,source_generated_at,indexnow_queued_at,updated_at FROM seo_runtime_state WHERE active=1 ORDER BY impressions DESC LIMIT 20`).all()).results||[];
  return {status:'active',executor:'cloudflare',qualityGate:'runtime-safe-v1',state:{total:Number(summary?.total||0),active:Number(summary?.active||0),indexNowQueued24h:Number(summary?.indexnow_queued_24h||0),updatedAt:summary?.updated_at||null},items};
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/seo/runtime-health'){
      await refreshState(request,env).catch(()=>{});
      return Response.json(await health(env),{headers:H});
    }
    const response=await base.fetch(request,env,ctx);
    return transformPage(request,response,env);
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    if(typeof base.scheduled==='function')await base.scheduled(event,env,ctx);
    if(trigger==='15 * * * *'||trigger==='35 3 * * *'){
      const task=refreshState(new Request('https://trytoolscout.org/'),env).catch(()=>{});
      if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
    }
  }
};
