export {executeCatalogGrowthTask} from './catalog-gap-runtime-worker.js';
import base from './dynamic-worker.js';
import { runWithLedger } from './engine-run-ledger.js';
import { renderRuntimeRanking } from './catalog-runtime-ranking.js';
import {auditCatalogTool,mapLimit} from './catalog-quality-runtime.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const MAX_VERIFY_PER_CYCLE=4;
const MAX_NEWS_SOURCE_CHECKS_PER_CYCLE=4;
const MAX_ADMIT_PER_DAY=3;
const MAX_CANDIDATE_CHECKS_PER_CYCLE=4;
const WARNING_RETRY_HOURS=6;
const MAX_WARNING_RETRIES_PER_CYCLE=2;
const FETCH_TIMEOUT_MS=6000;
let schemaReady=null;
let runtimeCache={at:0,candidates:[],candidateMap:new Map(),stateMap:new Map(),suppressed:new Set()};
const RUNTIME_CACHE_MS=60000;
const RUNTIME_EDGE_CACHE_KEY='https://trytoolscout.org/__cache/catalog-runtime-snapshot-v1';
const RUNTIME_EDGE_CACHE_TTL=604800;

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const safeText=(v,n=4000)=>String(v??'').slice(0,n);
function authorized(request,env){const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN)}
async function assetJson(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}
function publicHttps(value){try{const u=new URL(String(value||''));return u.protocol==='https:'?u:null}catch{return null}}
function stripHtml(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim()}
function meta(html,name){const a=new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,'i'),b=new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,'i');return (String(html).match(a)?.[1]||String(html).match(b)?.[1]||'').trim()}
function releaseLinks(html,base){
  const out=[];try{
    const root=new URL(base),re=/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
    while((m=re.exec(String(html||'')))){
      const label=stripHtml(m[2]).toLowerCase(),href=String(m[1]||'');
      if(!/(changelog|release notes|releases|what.?s new|product updates|updates)/i.test(label+' '+href))continue;
      let u;try{u=new URL(href,root)}catch{continue}
      if(u.protocol!=='https:')continue;
      const rh=root.hostname.replace(/^www\./,''),uh=u.hostname.replace(/^www\./,'');
      if(!(uh===rh||uh.endsWith('.'+rh)))continue;
      out.push(u.toString());
    }
  }catch{}
  return [...new Set(out)].slice(0,4);
}
async function sha(value){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24)}
async function fetchOfficial(url){
  const u=publicHttps(url);if(!u)return{status:'invalid',httpStatus:null,finalUrl:null,fingerprint:null};
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),FETCH_TIMEOUT_MS);
  try{
    const r=await fetch(u.href,{method:'GET',redirect:'follow',headers:{'User-Agent':attempt===1?'ToolScout-Catalog-Autonomy/1.1 (+https://trytoolscout.org/)':'Mozilla/5.0 (compatible; ToolScoutCatalogVerifier/1.1; +https://trytoolscout.org/)','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'},signal:ctl.signal});
    if(r.status===404||r.status===410)return{status:'broken',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:null};
    if(!r.ok)return{status:[403,429].includes(r.status)?'blocked_or_limited':'warning',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:null};
    const type=(r.headers.get('content-type')||'').toLowerCase();if(!type.includes('text/html')&&!type.includes('text/plain'))return{status:'warning',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:null};
    const html=(await r.text()).slice(0,500000),title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s+/g,' ').trim(),description=meta(html,'description')||meta(html,'og:description'),text=stripHtml(html).slice(0,14000);
    return{status:'ok',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:await sha(`${title}\n${description}\n${text}`),title,description,releaseLinks:releaseLinks(html,r.url||u.href)};
  }catch(e){lastError=e?.name==='AbortError'?'timeout':'network_error'}
  finally{clearTimeout(timer)}
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,150));
  }
  return{status:'network_warning',httpStatus:null,finalUrl:u.href,fingerprint:null,error:lastError||'network_error'};
}
async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS catalog_runtime_state(
      tool_slug TEXT PRIMARY KEY,
      source_url TEXT,
      source_status TEXT,
      http_status INTEGER,
      final_url TEXT,
      fingerprint TEXT,
      pending_fingerprint TEXT,
      change_confirmations INTEGER NOT NULL DEFAULT 0,
      content_changed INTEGER NOT NULL DEFAULT 0,
      broken_consecutive INTEGER NOT NULL DEFAULT 0,
      quality_status TEXT NOT NULL DEFAULT 'unverified',
      static_last_verified TEXT,
      last_checked_at TEXT,
      last_change_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_runtime_quality ON catalog_runtime_state(quality_status,last_checked_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS catalog_runtime_candidates(
      tool_slug TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      source_status TEXT,
      verified_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_runtime_candidates_status ON catalog_runtime_candidates(status,updated_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS catalog_quality_audit(
      tool_slug TEXT PRIMARY KEY,
      quality_status TEXT NOT NULL,
      issues_json TEXT NOT NULL DEFAULT '[]',
      warnings_json TEXT NOT NULL DEFAULT '[]',
      source_status TEXT,
      source_url TEXT,
      logo_url TEXT,
      logo_provenance TEXT,
      last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_quality_status ON catalog_quality_audit(quality_status,last_checked_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS catalog_market_gaps(
      tool_slug TEXT PRIMARY KEY,
      signals INTEGER NOT NULL DEFAULT 0,
      sources_json TEXT NOT NULL DEFAULT '[]',
      examples_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'research_required',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS catalog_runtime_events(
      event_id TEXT PRIMARY KEY,
      tool_slug TEXT,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      evidence_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_events_created ON catalog_runtime_events(created_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS software_news_candidates(
      candidate_id TEXT PRIMARY KEY,
      tool_slug TEXT NOT NULL,
      source_url TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'candidate',
      materiality_score REAL NOT NULL DEFAULT 0,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_software_news_status ON software_news_candidates(status,materiality_score DESC,updated_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS software_news_sources(
      source_url TEXT PRIMARY KEY,
      tool_slug TEXT NOT NULL,
      fingerprint TEXT,
      title TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_checked_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_software_news_sources_checked ON software_news_sources(status,last_checked_at)`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
function newsMateriality(result,sourceUrl){
  const text=`${result?.title||''} ${result?.description||''}`.toLowerCase(),path=(()=>{try{return new URL(sourceUrl).pathname.toLowerCase()}catch{return''}})();
  let score=0;
  if(/changelog|release|releases|updates|what.?s-new|product-updates/.test(path))score+=35;
  for(const re of [/\blaunch(?:ed|es)?\b/,/\brelease(?:d|s)?\b/,/\bnew\b/,/\bnow available\b/,/\bgeneral availability\b/,/\bpricing\b/,/\bplan\b/,/\bintegration\b/,/\bsecurity\b/,/\bai\b/,/\bautomation\b/,/\bapi\b/])if(re.test(text))score+=7;
  return Math.max(0,Math.min(100,score));
}
async function rememberReleaseSources(env,slug,links){
  let n=0;for(const url of Array.isArray(links)?links:[]){
    const write=await env.DB.prepare(`INSERT INTO software_news_sources(source_url,tool_slug,status,updated_at) VALUES(?,?,'active',datetime('now'))
      ON CONFLICT(source_url) DO UPDATE SET tool_slug=excluded.tool_slug,status='active',updated_at=datetime('now')
      WHERE software_news_sources.tool_slug IS NOT excluded.tool_slug OR software_news_sources.status IS NOT 'active'`).bind(url,slug).run().catch(()=>null);
    if(Number(write?.meta?.changes||write?.changes||0)>0)n++;
  }return n;
}
export async function verifyNewsSources(env){
  await ensureSchema(env);
  const q=await env.DB.prepare(`SELECT source_url,tool_slug,fingerprint,last_checked_at FROM software_news_sources WHERE status='active' ORDER BY COALESCE(last_checked_at,'1970-01-01') ASC LIMIT ?`).bind(MAX_NEWS_SOURCE_CHECKS_PER_CYCLE).all();
  let checked=0,changed=0,baselined=0,warnings=0;
  for(const row of q.results||[]){
    const result=await fetchOfficial(row.source_url);checked++;
    if(result.status!=='ok'){warnings++;await env.DB.prepare(`UPDATE software_news_sources SET last_checked_at=datetime('now'),updated_at=datetime('now') WHERE source_url=?`).bind(row.source_url).run();continue}
    if(!row.fingerprint){baselined++;await env.DB.prepare(`UPDATE software_news_sources SET fingerprint=?,title=?,summary=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE source_url=?`).bind(result.fingerprint,safeText(result.title,500),safeText(result.description,1800),row.source_url).run();continue}
    if(result.fingerprint!==row.fingerprint){
      const candidate=await upsertNewsCandidate(env,row.tool_slug,row.source_url,result);changed++;
      await logEvent(env,row.tool_slug,'software_news_change_detected','completed','Official release/update source changed and created a bounded What\'s New candidate for the shared growth brain.',{source_url:row.source_url,candidate_id:candidate?.candidate_id||null,materiality_score:candidate?.materiality_score??null});
    }
    await env.DB.prepare(`UPDATE software_news_sources SET fingerprint=?,title=?,summary=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE source_url=?`).bind(result.fingerprint,safeText(result.title,500),safeText(result.description,1800),row.source_url).run();
  }
  return{ok:true,checked,changed,baselined,warnings,limit:MAX_NEWS_SOURCE_CHECKS_PER_CYCLE};
}
async function upsertNewsCandidate(env,slug,sourceUrl,result){
  const score=newsMateriality(result,sourceUrl),id=`runtime-${slug}-${result?.fingerprint||Date.now()}`;
  await env.DB.prepare(`INSERT INTO software_news_candidates(candidate_id,tool_slug,source_url,title,summary,status,materiality_score,detected_at,updated_at)
    VALUES(?,?,?,?,?,'candidate',?,datetime('now'),datetime('now'))
    ON CONFLICT(candidate_id) DO UPDATE SET title=excluded.title,summary=excluded.summary,materiality_score=excluded.materiality_score,updated_at=datetime('now')`)
    .bind(id,slug,sourceUrl,safeText(result?.title,500)||null,safeText(result?.description,1800)||null,score).run();
  return {candidate_id:id,materiality_score:score};
}
async function logEvent(env,slug,type,status,detail,evidence=null){
  await env.DB.prepare(`INSERT INTO catalog_runtime_events(event_id,tool_slug,event_type,status,detail,evidence_json,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind(`cat_${crypto.randomUUID()}`,slug||null,type,status,safeText(detail,2000),JSON.stringify(evidence||null).slice(0,8000)).run().catch(()=>{});
}
function compileRuntimeSnapshot(stateRows=[],candidateRows=[],meta={}){
  const stateMap=new Map((stateRows||[]).map(row=>[String(row.tool_slug),row])),parsed=[];
  for(const row of candidateRows||[]){try{const p=JSON.parse(row.profile_json);if(p)parsed.push(p)}catch{}}
  return{at:Date.now(),candidates:parsed,candidateMap:new Map(parsed.map(x=>[String(x.slug||'').toLowerCase(),x])),stateMap,suppressed:new Set([...stateMap.entries()].filter(([,v])=>v.quality_status==='confirmed_broken').map(([k])=>k)),degraded:Boolean(meta.degraded),lastError:meta.lastError||null,source:meta.source||'d1'};
}
async function writeRuntimeEdgeSnapshot(stateRows,candidateRows){
  try{
    if(typeof caches==='undefined'||!caches.default)return;
    const body=JSON.stringify({version:1,storedAt:new Date().toISOString(),states:stateRows||[],candidates:candidateRows||[]});
    await caches.default.put(new Request(RUNTIME_EDGE_CACHE_KEY),new Response(body,{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':`public, max-age=${RUNTIME_EDGE_CACHE_TTL}`}}));
  }catch{}
}
async function readRuntimeEdgeSnapshot(){
  try{
    if(typeof caches==='undefined'||!caches.default)return null;
    const r=await caches.default.match(new Request(RUNTIME_EDGE_CACHE_KEY));if(!r)return null;
    const body=await r.json();if(!body||body.version!==1)return null;
    return compileRuntimeSnapshot(body.states||[],body.candidates||[],{degraded:true,source:'edge_cache'});
  }catch{return null}
}
async function runtimeSnapshot(env,{force=false}={}){
  if(!force&&Date.now()-runtimeCache.at<RUNTIME_CACHE_MS)return runtimeCache;
  try{
    const [states,candidates]=await Promise.all([
      env.DB.prepare(`SELECT * FROM catalog_runtime_state`).all(),
      env.DB.prepare(`SELECT tool_slug,profile_json,status,source_status,verified_at FROM catalog_runtime_candidates WHERE status IN ('published','admitted_coverage','quality_hold') ORDER BY verified_at DESC`).all()
    ]);
    const stateRows=states.results||[],candidateRows=candidates.results||[];
    runtimeCache=compileRuntimeSnapshot(stateRows,candidateRows,{source:'d1'});
    await writeRuntimeEdgeSnapshot(stateRows,candidateRows);
  }catch(error){
    const cached=await readRuntimeEdgeSnapshot();
    runtimeCache=cached?{...cached,lastError:safeText(error?.message||error,500)}:{...runtimeCache,at:Date.now(),degraded:true,lastError:safeText(error?.message||error,500),source:runtimeCache.candidates.length?'memory_cache':'static_only'};
  }
  return runtimeCache;
}
async function runtimeCandidates(env){return (await runtimeSnapshot(env)).candidates}
async function suppressedSlugs(env){return (await runtimeSnapshot(env)).suppressed}
async function mergedTools(env){
  const [staticTools,candidates,suppressed]=await Promise.all([assetJson(env,'/data/tools.json',[]),runtimeCandidates(env),suppressedSlugs(env)]);
  const out=[],seen=new Set();
  for(const tool of [...(Array.isArray(staticTools)?staticTools:[]),...candidates]){
    const slug=String(tool?.slug||'').toLowerCase();if(!slug||seen.has(slug)||suppressed.has(slug))continue;
    seen.add(slug);out.push(tool);
  }
  return out;
}
async function affiliateStateMap(env){
  const map=new Map();
  try{
    const rows=await env.DB.prepare(`SELECT tool_slug,status FROM affiliate_workflow`).all();
    for(const row of rows.results||[])map.set(String(row.tool_slug||'').toLowerCase(),String(row.status||'research_required'));
  }catch{}
  const registry=await assetJson(env,'/data/affiliate.json',{});
  for(const [slug,entry] of Object.entries(registry||{}))if(entry?.enabled&&entry?.url){
    const key=String(slug||'').toLowerCase();
    if(!['verified','earning'].includes(map.get(key)))map.set(key,'active');
  }
  return map;
}
const AFFILIATE_MONETIZED_STATES=new Set(['active','verified','earning']);
export async function publicCatalogInventory(env){
  const [staticTools,tools,affiliateStates]=await Promise.all([
    assetJson(env,'/data/tools.json',[]),
    mergedTools(env),
    affiliateStateMap(env)
  ]);
  const staticSet=new Set((Array.isArray(staticTools)?staticTools:[]).map(x=>String(x?.slug||'').toLowerCase()).filter(Boolean));
  const rows=tools.map(tool=>{
    const slug=String(tool?.slug||'').toLowerCase(),status=affiliateStates.get(slug)||'research_required';
    return {slug,name:tool?.name||slug,category:tool?.category||null,origin:staticSet.has(slug)?'static':'runtime',affiliate_status:status,affiliate_active:AFFILIATE_MONETIZED_STATES.has(status)};
  });
  const active=rows.filter(x=>x.affiliate_active).length;
  return {
    ok:true,
    version:'canonical-catalog-v1',
    total:rows.length,
    static_unique:rows.filter(x=>x.origin==='static').length,
    runtime_unique:rows.filter(x=>x.origin==='runtime').length,
    affiliate:{active_tools:active,uncovered_tools:Math.max(0,rows.length-active),catalog_coverage_pct:rows.length?Number((active/rows.length*100).toFixed(1)):0},
    tools:rows,
    generated_at:new Date().toISOString()
  };
}
export async function verifyBatch(env){
  await ensureSchema(env);
  const staticTools=await assetJson(env,'/data/tools.json',[]);
  const candidates=await runtimeCandidates(env);
  const all=[...(Array.isArray(staticTools)?staticTools:[]),...candidates];
  const states=await env.DB.prepare(`SELECT tool_slug,source_url,source_status,fingerprint,pending_fingerprint,change_confirmations,content_changed,broken_consecutive,quality_status,static_last_verified,last_checked_at,last_change_at FROM catalog_runtime_state`).all();
  const smap=new Map((states.results||[]).map(x=>[x.tool_slug,x]));
  const toolsWithSources=all.filter(x=>x?.slug&&x?.sourceUrl);
  const isWarningState=s=>s?.quality_status==='source_warning'||s?.source_status==='network_warning'||s?.source_status==='warning'||s?.source_status==='blocked_or_limited';
  const verificationUrl=tool=>String(tool?.verificationUrl||tool?.sourceUrl||'');
  const retryCutoff=Date.now()-WARNING_RETRY_HOURS*3600000;
  const changedWarning=[],retryWarning=[],regular=[];
  for(const tool of toolsWithSources){
    const prior=smap.get(tool.slug)||{},verifyUrl=verificationUrl(tool);
    const last=Date.parse(String(prior.last_checked_at||'1970-01-01').replace(' ','T')+'Z')||0;
    const sourceChanged=Boolean(prior.source_url&&verifyUrl&&prior.source_url!==verifyUrl);
    if(isWarningState(prior)){
      if(sourceChanged)changedWarning.push({tool,last});
      else if(!last||last<=retryCutoff)retryWarning.push({tool,last});
    }else regular.push({tool,last});
  }
  const oldest=(a,b)=>a.last-b.last;
  changedWarning.sort(oldest);retryWarning.sort(oldest);regular.sort(oldest);
  const chosen=[
    ...changedWarning.map(x=>x.tool),
    ...retryWarning.slice(0,MAX_WARNING_RETRIES_PER_CYCLE).map(x=>x.tool),
    ...regular.map(x=>x.tool)
  ].slice(0,MAX_VERIFY_PER_CYCLE);
  let checked=0,healthy=0,changed=0,suppressed=0,warnings=0;
  await mapLimit(chosen,2,async tool=>{
    const slug=String(tool.slug).toLowerCase(),prior=smap.get(slug)||{},verifyUrl=verificationUrl(tool),verificationSourceChanged=Boolean(prior.source_url&&prior.source_url!==verifyUrl),result=await fetchOfficial(verifyUrl),staticVerified=String(tool.lastVerified||tool.sourceCheckedOn||'');
    const staticVerifiedMs=staticVerified?Date.parse(/T/.test(staticVerified)?staticVerified:`${staticVerified}T00:00:00Z`):NaN;
    const staticVerificationFresh=Number.isFinite(staticVerifiedMs)&&Date.now()-staticVerifiedMs<=45*86400000;
    checked++;
    if(result.status==='ok'&&Array.isArray(result.releaseLinks)&&result.releaseLinks.length)await rememberReleaseSources(env,slug,result.releaseLinks);
    const reviewedSinceChange=Boolean(prior.last_change_at&&prior.static_last_verified&&staticVerified&&staticVerified!==prior.static_last_verified);
    const fingerprintChanged=result.status==='ok'&&prior.fingerprint&&result.fingerprint&&result.fingerprint!==prior.fingerprint;
    const broken=result.status==='broken'?Number(prior.broken_consecutive||0)+1:0;
    let quality=String(prior.quality_status||'unverified'),contentChanged=Number(prior.content_changed||0),lastChange=prior.last_change_at||null;
    let canonicalFingerprint=prior.fingerprint||result.fingerprint||null,pendingFingerprint=prior.pending_fingerprint||null,confirmations=Number(prior.change_confirmations||0);
    if(reviewedSinceChange){quality='healthy';contentChanged=0;lastChange=null;canonicalFingerprint=result.fingerprint||canonicalFingerprint;pendingFingerprint=null;confirmations=0}
    if(verificationSourceChanged&&result.status==='ok'){canonicalFingerprint=result.fingerprint;pendingFingerprint=null;confirmations=0;quality='healthy';contentChanged=0;lastChange=null;healthy++}
    else if(result.status==='ok'&&!prior.fingerprint){canonicalFingerprint=result.fingerprint;pendingFingerprint=null;confirmations=0;quality='healthy';contentChanged=0;healthy++}
    else if(fingerprintChanged&&!reviewedSinceChange){
      if(pendingFingerprint&&pendingFingerprint===result.fingerprint)confirmations+=1;else{pendingFingerprint=result.fingerprint;confirmations=1}
      if(confirmations>=2){
        canonicalFingerprint=result.fingerprint;pendingFingerprint=null;confirmations=0;quality='change_detected';contentChanged=1;lastChange=new Date().toISOString().replace('T',' ').slice(0,19);changed++;
        const newsCandidate=await upsertNewsCandidate(env,slug,result.finalUrl||verifyUrl,result).catch(()=>null);
        await logEvent(env,slug,'catalog_source_change_detected','completed','A new official-source fingerprint was reproduced on two consecutive checks. Volatile facts remain flagged until the static editorial record is re-verified.',{source_url:verifyUrl,http_status:result.httpStatus,news_candidate_id:newsCandidate?.candidate_id||null,news_materiality_score:newsCandidate?.materiality_score??null});
      }
    }else if(result.status==='ok'&&result.fingerprint===prior.fingerprint){
      pendingFingerprint=null;confirmations=0;if(!prior.last_change_at){quality='healthy';contentChanged=0;healthy++}
    }
    if(broken>=2){quality='confirmed_broken';contentChanged=0;pendingFingerprint=null;confirmations=0;suppressed++;await logEvent(env,slug,'catalog_tool_suppressed','completed','Official source returned a confirmed 404/410 on two consecutive runtime checks.',{source_url:verifyUrl,http_status:result.httpStatus})}
    else if(result.status!=='ok'&&result.status!=='broken'){
      warnings++;
      if(staticVerificationFresh&&!prior.last_change_at)quality='healthy';
      else if(quality==='unverified')quality='source_warning';
    }
    await env.DB.prepare(`INSERT INTO catalog_runtime_state(tool_slug,source_url,source_status,http_status,final_url,fingerprint,pending_fingerprint,change_confirmations,content_changed,broken_consecutive,quality_status,static_last_verified,last_checked_at,last_change_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET source_url=excluded.source_url,source_status=excluded.source_status,http_status=excluded.http_status,final_url=excluded.final_url,fingerprint=COALESCE(excluded.fingerprint,catalog_runtime_state.fingerprint),pending_fingerprint=excluded.pending_fingerprint,change_confirmations=excluded.change_confirmations,content_changed=excluded.content_changed,broken_consecutive=excluded.broken_consecutive,quality_status=excluded.quality_status,static_last_verified=excluded.static_last_verified,last_checked_at=datetime('now'),last_change_at=excluded.last_change_at,updated_at=datetime('now')`)
      .bind(slug,verifyUrl,result.status,result.httpStatus,result.finalUrl,canonicalFingerprint,pendingFingerprint,confirmations,contentChanged,broken,quality,staticVerified,lastChange).run();
  });
  runtimeCache.at=0;
  return{ok:true,checked,healthy,changed,suppressed,warnings,batch_limit:MAX_VERIFY_PER_CYCLE,warning_retry_hours:WARNING_RETRY_HOURS,max_warning_retries_per_cycle:MAX_WARNING_RETRIES_PER_CYCLE,evidence:'official_source_runtime',write_policy:'due_check_only'};
}
function validCandidate(candidate,config){
  const allowed=new Set(config?.admission?.allowedCatalogCategories||[]);
  const required=config?.admission?.requiredFields||['slug','name','category','description','pricing','freePlan','features','bestFor','sourceUrl','scores'];
  const errors=[];
  for(const key of required)if(candidate?.[key]===undefined||candidate?.[key]===null||candidate?.[key]==='')errors.push('missing:'+key);
  if(allowed.size&&!allowed.has(candidate?.category))errors.push('unknown_category');
  if(!Array.isArray(candidate?.features)||candidate.features.length<Number(config?.admission?.minimumFeatures||3))errors.push('features_too_thin');
  if(!Array.isArray(candidate?.bestFor)||candidate.bestFor.length<Number(config?.admission?.minimumBestFor||2))errors.push('best_for_too_thin');
  if(String(candidate?.description||'').length<Number(config?.admission?.minimumDescriptionLength||60))errors.push('description_too_short');
  if(!publicHttps(candidate?.sourceUrl))errors.push('invalid_official_source');
  return errors;
}
async function syncMarketGaps(env){
  const report=await assetJson(env,'/reports/competitive-gap-signals.json',{gaps:[]});
  let synced=0;
  for(const gap of Array.isArray(report?.gaps)?report.gaps:[]){
    const slug=String(gap?.slug||'').toLowerCase().replace(/[^a-z0-9-]/g,'');if(!slug)continue;
    await env.DB.prepare(`INSERT INTO catalog_market_gaps(tool_slug,signals,sources_json,examples_json,status,updated_at) VALUES(?,?,?,?,'research_required',datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET signals=excluded.signals,sources_json=excluded.sources_json,examples_json=excluded.examples_json,status=CASE WHEN catalog_market_gaps.status IN ('published','admitted_coverage','covered','covered_existing') THEN catalog_market_gaps.status ELSE 'research_required' END,updated_at=datetime('now')`)
      .bind(slug,Number(gap?.mentions||gap?.sources?.length||0),JSON.stringify(gap?.sources||[]),JSON.stringify(gap?.exampleUrls||[])).run();
    synced++;
  }
  return synced;
}
export async function admitTrustedCandidates(env){
  await ensureSchema(env);
  const config=await assetJson(env,'/data/catalog-engine.json',{});
  const staticTools=await assetJson(env,'/data/tools.json',[]);
  const existing=new Set((Array.isArray(staticTools)?staticTools:[]).map(x=>String(x?.slug||'').toLowerCase()));
  for(const x of await runtimeCandidates(env))existing.add(String(x?.slug||'').toLowerCase());
  let admitted=0,held=0,considered=0;
  for(const file of config?.trustedCandidateFiles||[]){
    const candidates=await assetJson(env,'/'+String(file).replace(/^\//,''),[]);
    for(const raw of Array.isArray(candidates)?candidates:[]){
      if(admitted>=MAX_ADMIT_PER_DAY||considered>=MAX_CANDIDATE_CHECKS_PER_CYCLE)break;
      const slug=String(raw?.slug||'').toLowerCase();if(!slug||existing.has(slug))continue;
      considered++;
      const errors=validCandidate(raw,config);if(errors.length){held++;continue}
      const source=await fetchOfficial(raw.sourceUrl);if(config?.admission?.requireReachableOfficialSource!==false&&source.status!=='ok'){held++;continue}
      let profile={...raw,sourceUrl:source.finalUrl||raw.sourceUrl,lastVerified:new Date().toISOString().slice(0,10),rankingEligible:true,comparisonEligible:true,provenance:{...(raw.provenance||{}),mode:'runtime_trusted_catalog',admittedAt:new Date().toISOString(),affiliateNeutral:true,reviewMethod:'first_party_verified_structured_profile_v2'}};
      profile.editorialReview=profile.editorialReview||runtimeEditorialView(profile);
      const quality=await auditCatalogTool(env,profile);
      if(!quality.publishable){held++;await logEvent(env,slug,'catalog_candidate_quality_hold','completed','Trusted candidate failed full catalog quality gate before publication.',{issues:quality.issues,warnings:quality.warnings});continue}
      profile=quality.repairedTool;
      await env.DB.prepare(`INSERT INTO catalog_runtime_candidates(tool_slug,profile_json,status,source_status,verified_at,updated_at) VALUES(?,?,'published','ok',datetime('now'),datetime('now'))
        ON CONFLICT(tool_slug) DO UPDATE SET profile_json=excluded.profile_json,status='published',source_status='ok',verified_at=datetime('now'),updated_at=datetime('now')`)
        .bind(slug,JSON.stringify(profile)).run();
      await logEvent(env,slug,'catalog_candidate_admitted','completed','Trusted candidate admitted as a full ToolScout catalog peer after official-source and deterministic quality gates.',{source_url:profile.sourceUrl,category:profile.category});
      existing.add(slug);admitted++;
    }
    if(admitted>=MAX_ADMIT_PER_DAY||considered>=MAX_CANDIDATE_CHECKS_PER_CYCLE)break;
  }
  const market_gaps=await syncMarketGaps(env);
  runtimeCache.at=0;
  if(admitted>0)await runtimeSnapshot(env,{force:true}).catch(()=>null);
  return{ok:true,considered,admitted,held,market_gaps_synced:market_gaps,max_admissions:MAX_ADMIT_PER_DAY,candidate_check_limit:MAX_CANDIDATE_CHECKS_PER_CYCLE,rule:'Affiliate economics cannot increase catalog admission or ranking eligibility.'};
}
export async function auditCatalogQualityBatch(env,{limit=12}={}){
  await ensureSchema(env);
  const [staticTools,runtimeRows,suppressed]=await Promise.all([
    assetJson(env,'/data/tools.json',[]),
    env.DB.prepare(`SELECT tool_slug,profile_json,status FROM catalog_runtime_candidates WHERE status IN ('published','admitted_coverage','quality_hold') ORDER BY updated_at DESC`).all(),
    suppressedSlugs(env)
  ]);
  const tools=[],seen=new Set();
  for(const tool of Array.isArray(staticTools)?staticTools:[]){
    const slug=String(tool?.slug||'').toLowerCase();if(!slug||seen.has(slug)||suppressed.has(slug))continue;
    seen.add(slug);tools.push(tool);
  }
  for(const row of runtimeRows.results||[]){
    let tool=null;try{tool=JSON.parse(row.profile_json||'{}')}catch{}
    const slug=String(tool?.slug||row.tool_slug||'').toLowerCase();if(!slug||seen.has(slug)||suppressed.has(slug)||!tool)continue;
    seen.add(slug);tools.push(tool);
  }
  const prior=await env.DB.prepare(`SELECT tool_slug,quality_status,last_checked_at FROM catalog_quality_audit`).all();
  const auditState=new Map((prior.results||[]).map(x=>[String(x.tool_slug),{status:String(x.quality_status||''),checkedAt:Date.parse(String(x.last_checked_at||'1970-01-01').replace(' ','T')+'Z')||0}]));
  const priority=slug=>{const s=auditState.get(slug);if(!s)return 0;if(s.status==='hold')return 1;if(s.status==='warning')return 2;return 3};
  const selected=[...tools].sort((a,b)=>priority(a.slug)-priority(b.slug)||(auditState.get(a.slug)?.checkedAt||0)-(auditState.get(b.slug)?.checkedAt||0)||String(a.slug).localeCompare(String(b.slug))).slice(0,Math.max(1,Math.min(25,Number(limit)||12)));
  const results=await mapLimit(selected,4,tool=>auditCatalogTool(env,tool));
  let passed=0,warnings=0,held=0,repaired=0;
  for(const result of results){
    if(!result)continue;
    if(result.status==='pass')passed++;else if(result.status==='warning')warnings++;else held++;
    await env.DB.prepare(`INSERT INTO catalog_quality_audit(tool_slug,quality_status,issues_json,warnings_json,source_status,source_url,logo_url,logo_provenance,last_checked_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET quality_status=excluded.quality_status,issues_json=excluded.issues_json,warnings_json=excluded.warnings_json,source_status=excluded.source_status,source_url=excluded.source_url,logo_url=excluded.logo_url,logo_provenance=excluded.logo_provenance,last_checked_at=datetime('now'),updated_at=datetime('now')`)
      .bind(result.slug,result.status,JSON.stringify(result.issues||[]),JSON.stringify(result.warnings||[]),result.source?.status||null,result.source?.url||null,result.logo?.url||null,result.logo?.provenance||null).run();
    const row=await env.DB.prepare(`SELECT profile_json,status FROM catalog_runtime_candidates WHERE tool_slug=? LIMIT 1`).bind(result.slug).first();
    if(row){
      let profile=null;try{profile=JSON.parse(row.profile_json||'{}')}catch{}
      if(result.publishable&&profile&&result.logo?.url&&(profile.logoUrl!==result.logo.url||!profile.logoVerifiedAt)){
        const next={...profile,logoUrl:result.logo.url,logoProvenance:result.logo.provenance,logoVerifiedAt:new Date().toISOString()};
        await env.DB.prepare(`UPDATE catalog_runtime_candidates SET profile_json=?,status='published',updated_at=datetime('now') WHERE tool_slug=?`).bind(JSON.stringify(next),result.slug).run();
        repaired++;
      }else if(!result.publishable&&row.status==='published'){
        await env.DB.prepare(`UPDATE catalog_runtime_candidates SET status='quality_hold',updated_at=datetime('now') WHERE tool_slug=?`).bind(result.slug).run();
        await logEvent(env,result.slug,'catalog_quality_hold','completed','Runtime catalog profile moved to quality hold after catalog QC failed.',{issues:result.issues,warnings:result.warnings});
      }
    }
  }
  runtimeCache.at=0;
  const summary=await env.DB.prepare(`SELECT quality_status,COUNT(*) n FROM catalog_quality_audit GROUP BY quality_status ORDER BY quality_status`).all();
  return{ok:true,checked:results.length,passed,warnings,held,repaired,total_catalog:tools.length,summary:summary.results||[],remaining_unchecked:Math.max(0,tools.length-new Set([...(prior.results||[]).map(x=>String(x.tool_slug)),...results.map(x=>String(x?.slug||''))]).size)};
}
export async function catalogQualitySnapshot(env){
  await ensureSchema(env);
  const [counts,issues]=await Promise.all([
    env.DB.prepare(`SELECT quality_status,COUNT(*) n FROM catalog_quality_audit GROUP BY quality_status ORDER BY quality_status`).all(),
    env.DB.prepare(`SELECT tool_slug,quality_status,issues_json,warnings_json,source_status,source_url,logo_url,logo_provenance,last_checked_at FROM catalog_quality_audit WHERE quality_status!='pass' ORDER BY CASE quality_status WHEN 'hold' THEN 0 ELSE 1 END,last_checked_at DESC LIMIT 100`).all()
  ]);
  return{counts:counts.results||[],items:(issues.results||[]).map(x=>({...x,issues:(()=>{try{return JSON.parse(x.issues_json||'[]')}catch{return[]}})(),warnings:(()=>{try{return JSON.parse(x.warnings_json||'[]')}catch{return[]}})()}))};
}

const RUNTIME_SCORE_LABELS={price:'value for money',ease:'ease of use',automation:'automation',integrations:'integrations',sales:'sales capability',ai:'AI capability',marketing:'marketing capability',seo:'SEO capability',research:'research capability',content:'content capability',agency:'agency fit'};
function runtimeListPhrase(items){
  const xs=(items||[]).filter(Boolean);
  if(xs.length<=1)return xs[0]||'your priorities';
  if(xs.length===2)return xs[0]+' and '+xs[1];
  return xs.slice(0,-1).join(', ')+', and '+xs[xs.length-1];
}
function runtimeEditorialView(tool){
  if(tool?.editorialReview)return safeText(tool.editorialReview,1800);
  const entries=Object.entries(tool?.scores||{}).filter(([,v])=>Number.isFinite(Number(v))).sort((a,b)=>Number(b[1])-Number(a[1]));
  const strongest=entries.slice(0,2).map(([k])=>RUNTIME_SCORE_LABELS[k]||k),weak=entries.at(-1),aud=(tool?.bestFor||[]).slice(0,3),caps=(tool?.features||[]).slice(0,3);
  const fit=tool.name+' is a practical fit for '+runtimeListPhrase(aud.length?aud:['buyers whose workflow matches its core capabilities'])+', especially when '+runtimeListPhrase(caps.length?caps:['its core workflow'])+' matter most.';
  const strengths=strongest.length?' In ToolScout scoring, '+runtimeListPhrase(strongest)+' are its strongest recorded dimensions.':'';
  const trade=weak&&Number(entries[0]?.[1]||0)-Number(weak[1])>=3?' '+(RUNTIME_SCORE_LABELS[weak[0]]||weak[0])+' is the clearest recorded trade-off, so compare alternatives if that requirement is central.':'';
  const commercial=tool?.freePlanKnown===false?' The current free-plan position is not verified.':tool?.freePlan?' A recorded free plan makes it easier to test before committing.':' Validate the use case and current pricing before committing.';
  return safeText((fit+strengths+trade+commercial+' Check current vendor limits, integrations and pricing before purchase.').replace(/[\u2013\u2014]/g,'-'),1800);
}
function runtimeLogo(tool){
  if(tool?.logoUrl)return tool.logoUrl;
  try{return 'https://www.google.com/s2/favicons?domain='+encodeURIComponent(new URL(tool.sourceUrl).hostname)+'&sz=128'}catch{return''}
}
function runtimeInitials(name){return String(name||'T').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function candidatePage(tool){
  const url=`https://trytoolscout.org/tools/${encodeURIComponent(tool.slug)}`;
  const logo=runtimeLogo(tool),initials=runtimeInitials(tool.name);
  const features=(tool.features||[]).map(x=>`<span style="font-size:12px;background:#f2f4f7;border-radius:999px;padding:7px 9px">${esc(x)}</span>`).join('');
  const best=(tool.bestFor||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  const free=tool.freePlanKnown===false?'Unknown':tool.freePlan?'Yes':'No';
  const review=runtimeEditorialView(tool);
  const faqBest=(tool.bestFor||[]).join(', ')||'the use cases shown on this page';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><link rel="canonical" href="${url}"><title>${esc(tool.name)} Tool Profile: Features, Pricing and Best For | ToolScout</title><meta name="description" content="${esc(tool.description)}">${logo?`<meta property="og:image" content="${esc(logo)}">`:''}<style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#101828}.wrap{max-width:940px;margin:auto;padding:24px 22px 80px}a{color:#344054}.brand{font-size:22px;font-weight:850;text-decoration:none;color:#101828}.crumbs{margin-top:30px;font-size:13px;color:#667085}.hero{padding:46px 0 26px}.heroHead{display:grid;grid-template-columns:92px 1fr;gap:22px;align-items:center}.toolLogo,.logoFallback{width:88px;height:88px;border-radius:20px;background:#fff;border:1px solid #e4e7ec;box-shadow:0 8px 24px rgba(16,24,40,.08);box-sizing:border-box}.toolLogo{object-fit:contain;padding:14px}.logoFallback{display:grid;place-items:center;font-size:26px;font-weight:850}.logoFallback[hidden]{display:none!important}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:800;color:#667085}h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:12px 0 18px}.lead{font-size:19px;line-height:1.65;color:#667085}.editorial{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px;margin-bottom:14px}.editorial p,.panel p,.panel li,details p{color:#667085;line-height:1.65}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel,details{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px}.chips{display:flex;flex-wrap:wrap;gap:7px}.cta{display:inline-block;background:#101828;color:#fff;padding:12px 17px;border-radius:11px;text-decoration:none;font-weight:750;margin-top:18px}.secondary{background:#eef2f6;color:#101828;margin-left:8px}.section{margin-top:42px;padding-top:28px;border-top:1px solid #e4e7ec}.small{font-size:12px;color:#667085;line-height:1.55}summary{font-weight:750;cursor:pointer}@media(max-width:700px){.grid{grid-template-columns:1fr}.heroHead{grid-template-columns:72px 1fr;gap:16px}.toolLogo,.logoFallback{width:68px;height:68px}.secondary{margin-left:0}}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><nav class="crumbs"><a href="/">Home</a> / <a href="/tools">Tools</a> / ${esc(tool.name)}</nav><main class="hero"><div class="heroHead">${logo?`<img class="toolLogo" src="${esc(logo)}" alt="${esc(tool.name)} logo" width="88" height="88" loading="eager" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="logoFallback" hidden aria-hidden="true">${esc(initials)}</span>`:`<span class="logoFallback" aria-hidden="true">${esc(initials)}</span>`}<div><div class="eyebrow">Independent ${esc(tool.category)} software profile</div><h1>${esc(tool.name)} profile</h1></div></div><p class="lead">${esc(tool.description)}</p></main><section class="editorial"><div class="eyebrow">ToolScout view</div><p>${esc(review)}</p></section><section class="grid"><div class="panel"><h2>Best for</h2><ul>${best}</ul><h2>Key capabilities</h2><div class="chips">${features}</div></div><div class="panel"><h2>Pricing at a glance</h2><p>${esc(tool.pricing||'See vendor for current pricing.')}</p><p><strong>Free plan recorded:</strong> ${free}</p><p><strong>Category:</strong> ${esc(tool.category)}</p><a class="cta" href="/go/${encodeURIComponent(tool.slug)}" rel="nofollow sponsored">Explore ${esc(tool.name)}</a><a class="cta secondary" href="/compare.html?a=${encodeURIComponent(tool.slug)}&source=tool-profile">Add to comparator</a></div></section><section class="section"><h2>Frequently asked questions</h2><details><summary>What is ${esc(tool.name)} best for?</summary><p>${esc(tool.name)} is recorded in the ToolScout catalog for ${esc(faqBest)}.</p></details><details><summary>Does ${esc(tool.name)} have a free plan?</summary><p>${tool.freePlanKnown===false?'ToolScout has not yet verified the current free-plan position.':tool.freePlan?'The current ToolScout catalog records a free plan. Check the vendor for current limits and eligibility.':'The current ToolScout catalog does not record a free plan. Check the vendor for current offers.'}</p></details><details><summary>How current is this ${esc(tool.name)} profile?</summary><p>Source data last checked ${esc(tool.lastVerified||'recently')}. Vendor pricing and capabilities can change.</p></details></section><p class="small">Source data last checked ${esc(tool.lastVerified||'recently')}. Vendor pricing and capabilities can change. ToolScout may earn affiliate compensation, but affiliate relationships do not influence ranking or fit.</p></div></body></html>`;
}
function injectPendingReview(html,state){
  if(!state||state.quality_status!=='change_detected'||String(html).includes('data-catalog-runtime-warning'))return html;
  const warning=`<div data-catalog-runtime-warning="1" style="background:#fff4e5;border-bottom:1px solid #fdb022;color:#7a2e0e;padding:10px 18px;font:600 13px/1.45 Inter,system-ui,sans-serif;text-align:center">ToolScout detected a change on this vendor's official source after the last factual review. Pricing, free-plan details or capabilities shown below may be pending re-verification.</div>`;
  return html.includes('<body')?html.replace(/(<body[^>]*>)/i,'$1'+warning):warning+html;
}
async function toolState(env,slug){return (await runtimeSnapshot(env)).stateMap.get(slug)||null}
async function runtimeCandidate(env,slug){return (await runtimeSnapshot(env)).candidateMap.get(slug)||null}
function toolSlug(path){const m=String(path).match(/^\/tools\/([a-z0-9][a-z0-9-]*)(?:\.html)?\/?$/i);return m?m[1].toLowerCase():null}
async function mergedSitemap(response,env){
  if(!response.ok)return response;let xml=await response.text();
  for(const tool of await runtimeCandidates(env)){const loc=`https://trytoolscout.org/tools/${tool.slug}`;if(!xml.includes(`<loc>${loc}</loc>`))xml=xml.replace('</urlset>',`  <url><loc>${loc}</loc></url>\n</urlset>`)}
  const h=new Headers(response.headers);h.delete('Content-Length');h.set('Content-Type','application/xml; charset=UTF-8');return new Response(xml,{status:response.status,headers:h});
}
export async function publicMergedTools(env){return mergedTools(env)}
export async function publicQualityEnhancedToolResponse(response,env,slug){
  if(!response?.ok||!(response.headers.get('Content-Type')||'').includes('text/html'))return response;
  await ensureSchema(env);
  const row=await env.DB.prepare(`SELECT logo_url FROM catalog_quality_audit WHERE tool_slug=? AND logo_url IS NOT NULL LIMIT 1`).bind(String(slug||'').toLowerCase()).first().catch(()=>null);
  if(!row?.logo_url)return response;
  let html=await response.text();
  const logo=esc(row.logo_url);
  html=html.replace(/(<img class="toolLogo" src=")[^"]*(")/i,`$1${logo}$2`);
  if(/<meta property="og:image"/i.test(html))html=html.replace(/(<meta property="og:image" content=")[^"]*(")/i,`$1${logo}$2`);
  else html=html.replace('</head>',`<meta property="og:image" content="${logo}"></head>`);
  const h=new Headers(response.headers);h.delete('Content-Length');h.set('Cache-Control','public, max-age=60');
  return new Response(html,{status:response.status,headers:h});
}
export async function publicRuntimeToolResponse(env,slug){
  const key=String(slug||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!key)return null;
  const [state,candidate]=await Promise.all([toolState(env,key),runtimeCandidate(env,key)]);
  if(state?.quality_status==='confirmed_broken')return new Response('Tool profile temporarily unavailable while the official source is re-verified.',{status:404,headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
  if(!candidate)return null;
  return new Response(candidatePage(candidate),{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=60'}});
}
export async function publicMergedSitemap(response,env){return mergedSitemap(response,env)}
export async function publicRuntimeRankingResponse(env,path){return renderRuntimeRanking(env,path,await mergedTools(env))}

async function status(env){
  await ensureSchema(env);
  const [states,candidates,gaps,events,newsSources,newsCandidates]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN quality_status='healthy' THEN 1 ELSE 0 END) healthy,SUM(CASE WHEN quality_status='change_detected' THEN 1 ELSE 0 END) changed,SUM(CASE WHEN quality_status='confirmed_broken' THEN 1 ELSE 0 END) suppressed,SUM(CASE WHEN source_status NOT IN ('ok','broken') THEN 1 ELSE 0 END) warnings,MAX(last_checked_at) last_checked_at FROM catalog_runtime_state`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(verified_at) last_admitted_at FROM catalog_runtime_candidates WHERE status IN ('published','admitted_coverage','quality_hold')`).first(),
    env.DB.prepare(`SELECT COUNT(*) total FROM catalog_market_gaps WHERE status='research_required'`).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM catalog_runtime_events WHERE created_at>=datetime('now','-7 days')`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(last_checked_at) last_checked_at FROM software_news_sources WHERE status='active'`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(updated_at) last_candidate_at FROM software_news_candidates WHERE status IN ('candidate','verified','published')`).first()
  ]);
  return{ok:true,version:'1.1',state:{total:Number(states?.total||0),healthy:Number(states?.healthy||0),changed:Number(states?.changed||0),suppressed:Number(states?.suppressed||0),warnings:Number(states?.warnings||0),last_checked_at:states?.last_checked_at||null},runtime_candidates:Number(candidates?.total||0),last_admitted_at:candidates?.last_admitted_at||null,market_gaps:Number(gaps?.total||0),events_7d:Number(events?.n||0),whats_new:{official_sources:Number(newsSources?.total||0),last_source_check:newsSources?.last_checked_at||null,candidates:Number(newsCandidates?.total||0),last_candidate_at:newsCandidates?.last_candidate_at||null},rule:'Once admitted, runtime tools remain full catalog peers during recoverable quality holds, matching static-tool behavior. Only confirmed broken sources are suppressed. Official-source verification is required, and affiliate economics never affect catalog admission or ranking.'};
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/catalog-autonomy/status'){if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});return Response.json(await status(env),{headers:JSON_H})}
    if(request.method==='POST'&&u.pathname==='/api/catalog-autonomy/run'){if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});const verify=await runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:'manual_api'},()=>verifyBatch(env));const admit=await runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:'manual_api'},()=>admitTrustedCandidates(env));return Response.json({ok:true,verify,admit},{headers:JSON_H})}
    if(request.method==='GET'&&u.pathname==='/data/tools.json'){
      const tools=await mergedTools(env).catch(()=>assetJson(env,'/data/tools.json',[]));
      return Response.json(Array.isArray(tools)?tools:[],{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=60','X-ToolScout-Catalog':'canonical-merged'}});
    }
    if(request.method==='GET'&&(u.pathname==='/data/catalog-inventory.json'||u.pathname==='/api/catalog-inventory')){
      const inventory=await publicCatalogInventory(env).catch(async()=>{const tools=await assetJson(env,'/data/tools.json',[]);return{ok:false,version:'canonical-catalog-v1',degraded:true,total:Array.isArray(tools)?tools.length:0,static_unique:Array.isArray(tools)?tools.length:0,runtime_unique:0,affiliate:{active_tools:0,uncovered_tools:Array.isArray(tools)?tools.length:0,catalog_coverage_pct:0},tools:(Array.isArray(tools)?tools:[]).map(x=>({slug:x.slug,name:x.name,category:x.category||null,origin:'static',affiliate_status:'unknown',affiliate_active:false})),generated_at:new Date().toISOString()}}); 
      return Response.json(inventory,{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=60','X-ToolScout-Catalog':'canonical-inventory'}});
    }
    const slug=toolSlug(u.pathname);
    if(request.method==='GET'&&slug){
      const [state,candidate]=await Promise.all([toolState(env,slug),runtimeCandidate(env,slug)]);
      if(state?.quality_status==='confirmed_broken')return new Response('Tool profile temporarily unavailable while the official source is re-verified.',{status:404,headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
      if(candidate)return new Response(candidatePage(candidate),{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=300'}});
      const response=await base.fetch(request,env,ctx);
      if(response.ok&&state?.quality_status==='change_detected'&&(response.headers.get('Content-Type')||'').includes('text/html')){
        const html=injectPendingReview(await response.text(),state),h=new Headers(response.headers);h.delete('Content-Length');h.set('Cache-Control','public, max-age=60');return new Response(html,{status:response.status,headers:h});
      }
      return response;
    }
    if(request.method==='GET'&&u.pathname==='/sitemap.xml')return mergedSitemap(await base.fetch(request,env,ctx),env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};
