import base from './cloudflare-primary-runtime-worker.js';
import {TOOLSCOUT_CRONS} from './runtime-schedule-contract.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
let schemaReady=null,configCache=null;

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const strip=v=>String(v??'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
function canonicalPath(value){try{const u=new URL(String(value));let p=u.pathname||'/';if(p==='/index.html')p='/';else if(/\.html$/i.test(p))p=p.replace(/\.html$/i,'');return p}catch{return null}}
function htmlResponse(response,html){const h=new Headers(response.headers);h.set('Content-Type','text/html; charset=UTF-8');h.set('Cache-Control','private, no-store, max-age=0');h.delete('Content-Length');h.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers:h})}

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    const row=await env.DB.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='seo_runtime_state'").first();
    if(Number(row?.n||0)!==1)throw new Error('seo_runtime_schema_not_migrated');
    return{ok:true,source:'d1_migrations'};
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
async function assetJson(request,env,path,fallback){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}
}
async function config(request,env){
  if(configCache&&Date.now()-configCache.at<3600000)return configCache.value;
  const [intents,consolidations,adapters,gscTrend]=await Promise.all([
    assetJson(request,env,'/data/intents.json',[]),
    assetJson(request,env,'/data/seo-consolidations.json',{}),
    assetJson(request,env,'/data/distribution-submission-adapters.json',{adapters:[]}),
    assetJson(request,env,'/data/gsc-daily-trend.json',{periodComparison:null})
  ]);
  const value={intents:Array.isArray(intents)?intents:[],consolidations:consolidations||{},adapters:adapters?.adapters||[],gscTrend:gscTrend||{}};
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
async function recoveryTargets(env,limit=8){
  try{
    const rows=(await env.DB.prepare(`SELECT pathname,reason,impressions,position,updated_at
      FROM seo_runtime_state
      WHERE active=1 AND reason LIKE 'execution_contract:%'
      ORDER BY updated_at DESC, impressions DESC
      LIMIT ?`).bind(Math.max(1,Math.min(12,Number(limit)||8))).all()).results||[];
    return rows.filter(x=>String(x?.pathname||'').startsWith('/')&&!String(x.pathname).startsWith('/analytics'));
  }catch{return[]}
}
function weeklyLossTargets(cfg,route,limit=8){
  const losses=cfg?.gscTrend?.periodComparison?.pages?.losses;
  if(!Array.isArray(losses))return[];
  const prefix=route==='/guides'?'/best-':route==='/tools'?'/tools/':null;
  return losses.filter(row=>{
    const pathname=String(row?.page||'');
    if(prefix)return pathname.startsWith(prefix);
    if(route==='/compare')return /-vs-|alternatives/.test(pathname);
    return false;
  }).filter(row=>Number(row?.impressionsDelta||0)<0&&Number(row?.impressions||0)>0)
    .slice(0,Math.max(1,Math.min(12,Number(limit)||8)))
    .map(row=>({pathname:String(row.page),reason:'weekly_search_loss',impressions:Number(row.impressions||0),position:Number(row.position||0),impressionsDelta:Number(row.impressionsDelta||0)}));
}
function recoveryLinksBlock(targets){
  if(!targets.length)return'';
  const links=targets.map(row=>{
    const pathname=String(row.pathname||'/');
    const label=pathname.replace(/^\//,'').replace(/\.html$/i,'').replace(/-/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase());
    return `<a href="${esc(pathname)}" data-toolscout-index-recovery-link="1">${esc(label||'ToolScout guide')}</a>`;
  }).join(' · ');
  return `<!-- toolscout-index-recovery-links:start --><section class="section" data-toolscout-index-recovery-links="1"><h2>Pages strengthened from live search demand</h2><p class="small">ToolScout reinforces useful pages when Search Console shows meaningful demand or a recent visibility loss.</p><p>${links}</p></section><!-- toolscout-index-recovery-links:end -->`;
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
function stripGenericToolDecisionDepth(html,pathname){
  if(!String(pathname||'').startsWith('/tools/'))return String(html||'');
  let out=String(html||'');
  out=out.replace(/<!-- organic-growth:runtime-start --><section\b[^>]*data-og-variant=["']cloudflare-decision-depth-v1["'][^>]*>[\s\S]*?<\/section><!-- organic-growth:runtime-end -->/gi,'');
  out=out.replace(/<section\b[^>]*data-og-variant=["']cloudflare-decision-depth-v1["'][^>]*>[\s\S]*?<\/section>/gi,'');
  return out;
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
function clickCaptureDescription(html,pathname){
  const h1=strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  const paragraphs=[...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(x=>strip(x[1]))
    .filter(x=>x.length>=70&&!/cookie|privacy|copyright/i.test(x));
  let value=paragraphs[0]||(
    h1
      ? `Independent ToolScout analysis of ${h1} with practical fit criteria, tradeoffs, pricing context and alternatives.`
      : 'Independent ToolScout software analysis with practical fit criteria, tradeoffs, pricing context and alternatives.'
  );
  value=value.replace(/\s+/g,' ').trim();
  if(value.length<70&&h1)value=(value+' Compare the shortlist on real workflow fit before choosing.').trim();
  if(value.length>155)value=value.slice(0,152).replace(/\s+\S*$/,'').trim()+'...';
  return value;
}
function improveClickCapture(html,pathname){
  const description=clickCaptureDescription(html,pathname);
  if(!description)return html;
  const tag=`<meta name="description" content="${esc(description)}" data-toolscout-click-capture="1">`;
  const re=/<meta\b[^>]*name=["']description["'][^>]*>/i;
  return re.test(html)?html.replace(re,tag):html.replace(/<\/head>/i,tag+'</head>');
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
  if(/data-toolscout-click-capture="1"/.test(html)){
    const tag=html.match(/<meta\\b[^>]*data-toolscout-click-capture=["']1["'][^>]*>/i)?.[0]||'';
    const description=strip(tag.match(/content=["']([^"']*)["']/i)?.[1]||'');
    if(description.length<70)failures.push('click_capture_description_too_short');
    if(description.length>160)failures.push('click_capture_description_too_long');
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
    html=stripGenericToolDecisionDepth(html,pathname);
    const state=await activeState(env,pathname);
    const taskSpecificClickCapture=state&&String(state.reason||'')==='execution_contract:improve_click_capture';
    if(taskSpecificClickCapture)html=improveClickCapture(html,pathname);
    const bestPageDepth=state&&pathname.startsWith('/best-')&&!cfg.consolidations?.[pathname.slice(1)];
    if(bestPageDepth&&!html.includes('organic-growth:runtime-start')&&!html.includes('organic-growth:start')){
      const depthSlug=pathname.replace(/^\//,'');
      const block=decisionBlock(depthSlug,criteriaFor(cfg,depthSlug));
      const marker='<section class="section"><h2>How ToolScout chooses</h2>';
      html=html.includes(marker)?html.replace(marker,block+marker):html.replace(/<\/body>/i,block+'</body>');
    }
    // Core public hubs already expose contextual, crawlable internal links in their
    // primary UI. Do not append search-demand link farms to the visible page.
    // Search-demand recovery remains an engine concern, not a user-facing block.
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
  const existing=await env.DB.prepare(`SELECT submission_id,created_at,updated_at,last_attempt_at,submitted_at
    FROM distribution_submissions
    WHERE surface_slug='indexnow' AND asset_url=? AND submission_type='http_json'
    LIMIT 1`).bind(assetUrl).first().catch(()=>null);
  const payload={host:'trytoolscout.org',key:String(adapter.key||''),keyLocation:String(adapter.key_location||''),urlList:[assetUrl]};
  const endpoint=adapter.endpoint||'https://api.indexnow.org/indexnow';
  if(existing?.submission_id){
    const recent=await env.DB.prepare(`SELECT 1 ok FROM distribution_submissions
      WHERE submission_id=?
        AND COALESCE(last_attempt_at,submitted_at,updated_at,created_at)>=datetime('now','-7 days')
      LIMIT 1`).bind(existing.submission_id).first().catch(()=>null);
    if(recent?.ok)return false;
    await env.DB.prepare(`UPDATE distribution_submissions
      SET status='ready',payload_json=?,action_url=?,human_required=0,error=NULL,updated_at=datetime('now')
      WHERE submission_id=?`).bind(JSON.stringify(payload),endpoint,existing.submission_id).run();
    return true;
  }
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(`sub_${crypto.randomUUID()}`,'indexnow',assetUrl,'http_json','ready',JSON.stringify(payload),endpoint,0).run();
  return Number(inserted?.meta?.changes||inserted?.changes||0)>0;
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
  const rows=(await env.DB.prepare(`SELECT pathname,reason FROM seo_runtime_state WHERE active=1`).all()).results||[];
  for(const row of rows){
    // Search-demand rows follow the live GSC demand set. Execution-contract rows
    // are durable recovery interventions and must not be erased by a performance
    // refresh merely because the page has no impressions yet.
    if(String(row.reason||'')==='observed_search_demand'&&!seen.has(row.pathname)){
      await env.DB.prepare(`UPDATE seo_runtime_state SET active=0,last_evaluated_at=datetime('now'),updated_at=datetime('now') WHERE pathname=? AND reason='observed_search_demand'`).bind(row.pathname).run();
    }
  }
  return {ok:true,executor:'cloudflare',gscGeneratedAt:generatedAt||data?.generatedAt||null,observedPages:pages.length,active:seen.size,activated,queuedIndexNow:queued};
}
async function health(env){
  await ensureSchema(env);
  const summary=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) active,SUM(CASE WHEN indexnow_queued_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) indexnow_queued_24h,MAX(updated_at) updated_at FROM seo_runtime_state`).first();
  const items=(await env.DB.prepare(`SELECT pathname,reason,impressions,clicks,position,active,source_generated_at,indexnow_queued_at,updated_at FROM seo_runtime_state WHERE active=1 ORDER BY impressions DESC LIMIT 20`).all()).results||[];
  return {status:'active',executor:'cloudflare',qualityGate:'runtime-safe-v1',state:{total:Number(summary?.total||0),active:Number(summary?.active||0),indexNowQueued24h:Number(summary?.indexnow_queued_24h||0),updatedAt:summary?.updated_at||null},items};
}

export {transformPage as transformSeoPublicPage};

export async function handleSeoRuntimeRoute(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/seo/runtime-health'){
    await refreshState(request,env).catch(()=>{});
    return Response.json(await health(env),{headers:H});
  }
  return null;
}

export async function runSeoRuntimeScheduled(event,env,ctx){
  const trigger=event?.cron||'scheduled';
  if(trigger!==TOOLSCOUT_CRONS.hourly&&trigger!==TOOLSCOUT_CRONS.daily)return null;
  const task=refreshState(new Request('https://trytoolscout.org/'),env).catch(()=>{});
  if(ctx?.waitUntil){ctx.waitUntil(task);return {scheduled:true,deferred:true};}
  await task;
  return {scheduled:true,deferred:false};
}

export default{
  async fetch(request,env,ctx){
    const owned=await handleSeoRuntimeRoute(request,env);
    if(owned)return owned;
    const response=await base.fetch(request,env,ctx);
    return transformPage(request,response,env);
  },
  async scheduled(event,env,ctx){
    if(typeof base.scheduled==='function')await base.scheduled(event,env,ctx);
    return runSeoRuntimeScheduled(event,env,ctx);
  }
};
