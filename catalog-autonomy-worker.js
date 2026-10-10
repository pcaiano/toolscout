export {executeCatalogGrowthTask} from './catalog-gap-runtime-worker.js';
import base from './dynamic-worker.js';
import { runWithLedger } from './engine-run-ledger.js';
import { renderRuntimeRanking } from './catalog-runtime-ranking.js';
import {auditCatalogTool,mapLimit,hasManufacturerDecisionClaim} from './catalog-quality-runtime.js';
import {hydrateLegacyCatalogProfile} from './catalog-profile-hydration.js';
import {verifyManufacturerDocuments,monitoredManufacturerDocuments} from './catalog-manufacturer-document-watch.js';
import {manufacturerFactProposals,reconcileManufacturerFacts} from './catalog-manufacturer-fact-reconcile.js';
import {cleanPublicCatalogProfileCopy} from './catalog-public-fact-copy.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const MAX_VERIFY_PER_CYCLE=6; // hourly: up to 144 tools/day, bounded official document verification
const MAX_VERIFY_CYCLE_WALL_MS=180000; // keep discovery writes from extending official quality mission indefinitely
const QUALITY_NETWORK_SETTLE_MS=8000; // reserve time for already-started per-tool D1 writes and ledger finalisation
const MAX_NEWS_SOURCE_CHECKS_PER_CYCLE=4;
const MAX_ADMIT_PER_DAY=24; // actually per-cycle cap: enable documented cohorts to publish within one hourly run
const MAX_BASELINE_SEED_PER_CYCLE=40; // bounded migration inside the existing catalog autonomy engine
const MAX_CANDIDATE_CHECKS_PER_CYCLE=32; // bounded source fetches, preserve first-party and quality gates
const MAX_ADMISSION_WALL_MS=90000; // time-bound hourly supplier without reducing the 24-tool admission cap
const OFFICIAL_SOURCE_HOLD_COOLDOWN_HOURS=3; // avoid re-fetching verified vendor failures every hourly admission run
const MAX_RESEARCH_SEEDS_PER_CYCLE=80; // hourly discovery intake; never bypasses manufacturer/editorial admission
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
// Strictly separate marketing-page discovery from documented editorial admission.
export function trustedManufacturerEvidence(tool,{decisionGrade=false}={}) {
  const review=tool?.editorialReview;
  const url=review?.sourceUrl;
  const evidence=Array.isArray(tool?.evidence)?tool.evidence:[];
  if(!review||typeof review!=='object'||typeof review.summary!=='string'||review.summary.trim().length<100||
     review.verificationStatus==='catalog_only'||review.handsOnTested===true)return false;
  const primary=publicHttps(tool?.sourceUrl),document=publicHttps(url);
  if(!primary||!document||document.pathname==='/'||!document.pathname)return false;
  const home=primary.hostname.toLowerCase().replace(/^www[.]/,'');
  const doc=document.hostname.toLowerCase().replace(/^www[.]/,'');
  const extra=tool?.slug==='trello'&&(doc==='atlassian.com'||doc.endsWith('.atlassian.com'));
  if(!(doc===home||doc.endsWith('.'+home)||extra))return false;
  const primaryDated=evidence.some(x=>x?.claimScope==='toolscout_editorial_review'&&x?.sourceUrl===url&&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x?.verifiedAt||'')&&!Number.isNaN(Date.parse(x.verifiedAt)));
  if(!primaryDated)return false;
  if(!decisionGrade)return true; // legacy product evidence remains valid without rewriting historical records
  const docs=[...new Set(Array.isArray(review.sourceUrls)?review.sourceUrls:[])].filter(value=>{
    const u=publicHttps(value);if(!u||u.pathname==='/'||!u.pathname)return false;
    const d=u.hostname.toLowerCase().replace(/^www[.]/,'');
    return d===home||d.endsWith('.'+home)||extra;
  });
  const datedDocs=docs.filter(value=>evidence.some(x=>x?.claimScope==='toolscout_editorial_review'&&x?.sourceUrl===value&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x?.verifiedAt||'')));
  return review.summary.trim().length>=260&&String(review.angle||'').trim().length>=20&&String(review.buyerCheck||'').trim().length>=60&&
    docs.length>=2&&datedDocs.length>=2&&(tool.strengths||[]).length>=2&&(tool.limitations||[]).length>=2&&
    (tool.tradeoffs||[]).length>=1&&Boolean(tool.pricingDetails?.freePlanStatus)&&hasManufacturerDecisionClaim(tool);
}


function sameManufacturerHost(url,home){
  try{
    const link=new URL(String(url||'')),manufacturer=new URL(String(home||''));
    if(link.protocol!=='https:'||manufacturer.protocol!=='https:')return false;
    const a=link.hostname.toLowerCase().replace(/^www[.]/,'');
    const b=manufacturer.hostname.toLowerCase().replace(/^www[.]/,'');
    return a===b||a.endsWith('.'+b);
  }catch{return false}
}
// Fallbacks must be dated internal first-party manufacturer evidence and
// must not include an arbitrary promotional homepage or outside review site.
export function trustedCandidateOfficialFallbackUrls(candidate){
  if(!trustedManufacturerEvidence(candidate,{decisionGrade:true}))return [];
  const home=candidate.sourceUrl,review=candidate.editorialReview||{};
  const evidence=Array.isArray(candidate.evidence)?candidate.evidence:[];
  const docs=Array.isArray(review.sourceUrls)?review.sourceUrls:[];
  const result=[];
  for(const url of docs){
    let u;
    try{u=new URL(url)}catch{continue}
    if(u.pathname==='/'||!sameManufacturerHost(url,home))continue;
    if(!evidence.some(row=>row?.claimScope==='toolscout_editorial_review'&&
      row?.sourceUrl===url&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(row.verifiedAt||''))))continue;
    if(!result.includes(url))result.push(url);
    if(result.length>=2)break;
  }
  return result;
}
export async function fetchTrustedCandidateOfficialSource(candidate){
  const home=candidate?.sourceUrl;
  const original=await fetchOfficial(home);
  if(original.status==='ok'&&sameManufacturerHost(original.finalUrl,home))
    return {...original,selectedSource:'manufacturer_home'};
  const docs=trustedCandidateOfficialFallbackUrls(candidate);
  for(const url of docs){
    const proof=await fetchOfficial(url);
    if(proof.status==='ok'&&sameManufacturerHost(proof.finalUrl,home)){
      try{
        if(new URL(proof.finalUrl).pathname!=='/')
          return {...proof,selectedSource:'manufacturer_document'};
      }catch{}
    }
  }
  return {...original,status:original.status==='ok'?'untrusted_redirect':original.status,
    selectedSource:'none',fallbackDocumentsAttempted:docs.length};
}
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
export async function fetchOfficial(url,{deadlineAt=Infinity}={}){
  const u=publicHttps(url);if(!u)return{status:'invalid',httpStatus:null,finalUrl:null,fingerprint:null};
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++){
  const available=deadlineAt-Date.now()-QUALITY_NETWORK_SETTLE_MS;
  if(available<=0)return{status:'network_warning',httpStatus:null,finalUrl:u.href,fingerprint:null,error:'quality_cycle_budget_deferred'};
  const timeoutMs=Math.min(FETCH_TIMEOUT_MS,available),deadlineLimited=timeoutMs<FETCH_TIMEOUT_MS;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{
    const r=await fetch(u.href,{method:'GET',redirect:'follow',headers:{'User-Agent':attempt===1?'ToolScout-Catalog-Autonomy/1.1 (+https://trytoolscout.org/)':'Mozilla/5.0 (compatible; ToolScoutCatalogVerifier/1.1; +https://trytoolscout.org/)','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'},signal:ctl.signal});
    if(r.status===404||r.status===410)return{status:'broken',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:null};
    if(!r.ok)return{status:[403,429].includes(r.status)?'blocked_or_limited':'warning',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:null};
    const type=(r.headers.get('content-type')||'').toLowerCase();if(!type.includes('text/html')&&!type.includes('text/plain'))return{status:'warning',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:null};
    const html=(await r.text()).slice(0,500000),title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s+/g,' ').trim(),description=meta(html,'description')||meta(html,'og:description'),text=stripHtml(html).slice(0,14000);
    return{status:'ok',httpStatus:r.status,finalUrl:r.url||u.href,fingerprint:await sha(`${title}\n${description}\n${text}`),title,description,documentText:html
      .replace(/<script[\s\S]*?<\/script>/gi,' ')
      .replace(/<style[\s\S]*?<\/style>/gi,' ')
      .replace(/<\/(?:p|li|tr|td|th|h[1-6]|section|div)>/gi,'\n')
      .replace(/<[^>]+>/g,' ')
      .replace(/&(?:nbsp|amp|quot|#39);/gi,' ')
      .replace(/[^\S\n]+/g,' ')
      .split('\n').map(x=>x.trim()).filter(Boolean).join('\n').slice(0,16000),releaseLinks:releaseLinks(html,r.url||u.href)};
  }catch(e){
    // A deadline-shortened retry is unfinished work, not evidence that the
    // manufacturer's source is unreachable or a product fact has changed.
    if(e?.name==='AbortError'&&deadlineLimited)
      return{status:'network_warning',httpStatus:null,finalUrl:u.href,fingerprint:null,error:'quality_cycle_budget_deferred'};
    lastError=e?.name==='AbortError'?'timeout':'network_error';
  }
  finally{clearTimeout(timer)}
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,150));
  }
  return{status:'network_warning',httpStatus:null,finalUrl:u.href,fingerprint:null,error:lastError||'network_error'};
}
async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    const required=[
      'catalog_runtime_state',
      'catalog_runtime_candidates',
      'catalog_quality_audit',
      'catalog_market_gaps',
      'catalog_runtime_events',
      'software_news_candidates',
      'software_news_sources'
    ];
    const placeholders=required.map(()=>'?').join(',');
    const row=await env.DB.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`).bind(...required).first();
    if(Number(row?.n||0)!==required.length)throw new Error(`catalog_runtime_schema_not_migrated:${Number(row?.n||0)}/${required.length}`);
    return{ok:true,source:'d1_migrations',tables:Number(row?.n||0)};
  })().catch(error=>{schemaReady=null;throw error});
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
// Unlike best-effort lifecycle logs, the documentation-watch baseline is
// durable evidence. Never report it as saved if the database write fails.
async function persistManufacturerWatchEvent(env,slug,eventType,status,detail,evidence){
  const result=await env.DB.prepare(`INSERT INTO catalog_runtime_events(event_id,tool_slug,event_type,status,detail,evidence_json,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind('cat_'+crypto.randomUUID(),slug,eventType,status,safeText(detail,2000),JSON.stringify(evidence||null).slice(0,8000)).run();
  if(result?.success===false)throw new Error('manufacturer_documentation_event_not_persisted');
}


async function correctManufacturerCatalogFacts(env,tool,observations){
  const proposed=manufacturerFactProposals(tool,observations);
  if(!proposed.length)return{status:'no_machine_verifiable_fact_change'};
  const slug=String(tool.slug||'').toLowerCase();
  const prior=await env.DB.prepare("SELECT event_type,evidence_json FROM catalog_runtime_events WHERE tool_slug=? AND event_type IN ('catalog_fact_proposal','catalog_fact_corrected') ORDER BY created_at DESC,event_id DESC LIMIT 1")
    .bind(slug).first();
  let previous=null;
  if(prior?.event_type==='catalog_fact_proposal')try{previous=JSON.parse(prior.evidence_json||'{}')}catch{}
  const verdict=reconcileManufacturerFacts(tool,proposed,previous);
  if(verdict.status==='needs_second_observation'){
    await persistManufacturerWatchEvent(env,slug,'catalog_fact_proposal','deferred','Manufacturer-stated plan fact differs from canonical catalog. Awaiting a second independent observation.',verdict.proposal);
    return{status:verdict.status};
  }
  if(verdict.status!=='corrected')return{status:verdict.status};
  // Only replace the exact unchanged row that was evaluated; never clobber a
  // concurrently reviewed profile, quality hold, logo or affiliate status.
  const row=await env.DB.prepare('SELECT profile_json FROM catalog_runtime_candidates WHERE tool_slug=? LIMIT 1').bind(slug).first();
  if(!row||row.profile_json!==JSON.stringify(tool))return{status:'concurrent_revision_or_missing'};
  const updated=verdict.updatedTool;
  const result=await env.DB.prepare("UPDATE catalog_runtime_candidates SET profile_json=?,source_status='ok',updated_at=datetime('now') WHERE tool_slug=? AND profile_json=?")
    .bind(JSON.stringify(updated),slug,row.profile_json).run();
  if(Number(result?.meta?.changes||result?.changes||0)!==1)return{status:'concurrent_revision_or_missing'};
  await persistManufacturerWatchEvent(env,slug,'catalog_fact_corrected','completed','Specific vendor-stated plan, price or retired capability corrected after two identical documentary observations.',
    {corrected_count:verdict.count,claims:proposed.map(x=>({type:x.type,claimKey:x.claimKey,oldValue:x.oldValue,newValue:x.newValue,sourceUrl:x.sourceUrl}))});
  runtimeCache.at=0;
  return{status:'corrected',count:verdict.count};
}

function compileRuntimeSnapshot(stateRows=[],candidateRows=[],meta={}){
  const stateMap=new Map((stateRows||[]).map(row=>[String(row.tool_slug),row])),parsed=[];
  const baselineMirrors=new Set((candidateRows||[]).filter(row=>row.source_status==='baseline_snapshot').map(row=>String(row.tool_slug||'').toLowerCase()));
  const verifiedRevisions=new Set((candidateRows||[]).filter(row=>row.source_status==='ok').map(row=>String(row.tool_slug||'').toLowerCase()));
  for(const row of candidateRows||[]){
    // A quality hold is a research record, never a published product. This
    // snapshot powers the public directory, Finder, MCP and individual routes.
    if(!['published','admitted_coverage'].includes(String(row.status||'')))continue;
    try{const p=JSON.parse(row.profile_json);if(p)parsed.push(p)}catch{}
  }
  return{at:Date.now(),candidates:parsed,candidateMap:new Map(parsed.map(x=>[String(x.slug||'').toLowerCase(),x])),stateMap,suppressed:new Set([...stateMap.entries()].filter(([,v])=>v.quality_status==='confirmed_broken').map(([k])=>k)),degraded:Boolean(meta.degraded),lastError:meta.lastError||null,source:meta.source||'d1',baselineMirrors,verifiedRevisions};
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
  if(!force&&!runtimeCache.degraded&&Date.now()-runtimeCache.at<RUNTIME_CACHE_MS)return runtimeCache;
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
  // D1 is the primary product-data store once a legacy slug has been seeded.
  // Keep the existing static index order and an intact read-only fallback for
  // partial migration, D1 outages, and recovery. No duplicate public products.
  const [staticTools,snapshot]=await Promise.all([assetJson(env,'/data/tools.json',[]),runtimeSnapshot(env)]);
  const stored=snapshot.candidateMap||new Map(),suppressed=snapshot.suppressed||new Set();
  const out=[],seen=new Set();
  for(const fileTool of Array.isArray(staticTools)?staticTools:[]){
    const slug=String(fileTool?.slug||'').toLowerCase();if(!slug||seen.has(slug)||suppressed.has(slug))continue;
    const canonical=stored.get(slug);
    out.push(canonical&&canonical.slug===slug?canonical:fileTool);seen.add(slug);
  }
  for(const candidate of snapshot.candidates||[]){
    const slug=String(candidate?.slug||'').toLowerCase();
    if(!slug||seen.has(slug)||suppressed.has(slug))continue;
    out.push(candidate);seen.add(slug);
  }
  return out;
}

export async function seedBaselineCatalog(env,{limit=MAX_BASELINE_SEED_PER_CYCLE}={}){
  await ensureSchema(env);
  const original=await assetJson(env,'/data/tools.json',null);
  if(!Array.isArray(original)||!original.length)throw new Error('baseline_catalog_asset_unavailable');
  const unique=new Map();
  for(const tool of original){
    const slug=String(tool?.slug||'').toLowerCase();
    if(!/^[a-z0-9][a-z0-9-]*$/.test(slug)||unique.has(slug))throw new Error('baseline_catalog_invalid_or_duplicate:'+slug);
    unique.set(slug,tool);
  }
  const rows=await env.DB.prepare('SELECT tool_slug FROM catalog_runtime_candidates').all();
  const existing=new Set((rows.results||[]).map(x=>String(x.tool_slug||'').toLowerCase()));
  const pending=[...unique].filter(([slug])=>!existing.has(slug));
  const selected=pending.slice(0,Math.max(1,Math.min(MAX_BASELINE_SEED_PER_CYCLE,Number(limit)||MAX_BASELINE_SEED_PER_CYCLE)));
  let copied=0;
  for(const [slug,tool] of selected){
    // INSERT OR IGNORE never replaces a revised D1 profile or a product admitted
    // by Catalog Autonomy. Retain every original claim and manufacturer proof.
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO catalog_runtime_candidates(tool_slug,profile_json,status,source_status,verified_at,updated_at)
      VALUES(?,?,'published','baseline_snapshot',?,datetime('now'))`)
      .bind(slug,JSON.stringify(tool),tool.lastVerified||tool.sourceCheckedOn||null).run();
    copied+=Number(result?.meta?.changes||result?.changes||0);
  }
  if(copied)runtimeCache.at=0;
  const remaining=await env.DB.prepare(`SELECT COUNT(*) n FROM catalog_runtime_candidates WHERE tool_slug IN (${[...unique].map(()=>'?').join(',')})`).bind(...unique.keys()).first();
  const present=Math.min(unique.size,Number(remaining?.n||0));
  return {ok:true,phase:present===unique.size?'seeded_pending_surface_promotion':'seeding',
    source:'existing_127_tool_static_snapshot',total:unique.size,copied,seeded:present,remaining:Math.max(0,unique.size-present),
    per_cycle_limit:MAX_BASELINE_SEED_PER_CYCLE,non_destructive:true,legacy_static_html_preserved:true,
    rule:'D1 copies retain exact original manufacturer evidence; published legacy HTML remains unchanged until a separately verified dynamic renderer promotion.'};
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
  const snapshot=await runtimeSnapshot(env);
  const mirrored=[...staticSet].filter(slug=>snapshot.baselineMirrors?.has(slug)).length;
  const present=[...staticSet].filter(slug=>snapshot.candidateMap?.has(slug)).length;
  const revised=Math.max(0,present-mirrored);
  return {
    ok:true,
    version:'canonical-catalog-v1',
    storage:{primary:'cloudflare_d1',fallback:'read_only_static_snapshot',
      seeded_baseline:mirrored,baseline_present:present,baseline_revised:revised,baseline_total:staticSet.size,
      baseline_remaining:Math.max(0,staticSet.size-present),
      migration_phase:snapshot.degraded?'runtime_degraded':present===staticSet.size&&staticSet.size?'all_baseline_records_in_d1':'seeding',
      degraded:Boolean(snapshot.degraded),source:snapshot.source||'d1',legacy_html_preserved:true},
    total:rows.length,
    static_unique:rows.filter(x=>x.origin==='static').length,
    runtime_unique:rows.filter(x=>x.origin==='runtime').length,
    affiliate:{active_tools:active,uncovered_tools:Math.max(0,rows.length-active),catalog_coverage_pct:rows.length?Number((active/rows.length*100).toFixed(1)):0},
    tools:rows,
    generated_at:new Date().toISOString()
  };
}
export async function verifyBatch(env){
  const startedAt=Date.now(),deadlineAt=startedAt+MAX_VERIFY_CYCLE_WALL_MS;
  await ensureSchema(env);
  const all=await mergedTools(env);
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
  let checked=0,healthy=0,changed=0,suppressed=0,warnings=0,documentationChecked=0,documentationChanged=0,documentationWarnings=0,documentationBaselined=0,factsCorrected=0,factsProposed=0,cycleBudgetExhausted=false;
  await mapLimit(chosen,2,async tool=>{
    if(Date.now()>=deadlineAt){cycleBudgetExhausted=true;return;} // do not start another vendor after budget
    const slug=String(tool.slug).toLowerCase(),prior=smap.get(slug)||{},verifyUrl=verificationUrl(tool),verificationSourceChanged=Boolean(prior.source_url&&prior.source_url!==verifyUrl),result=await fetchOfficial(verifyUrl,{deadlineAt}),staticVerified=String(tool.lastVerified||tool.sourceCheckedOn||'');
    if(result.error==='quality_cycle_budget_deferred'){cycleBudgetExhausted=true;return;}
    const staticVerifiedMs=staticVerified?Date.parse(/T/.test(staticVerified)?staticVerified:`${staticVerified}T00:00:00Z`):NaN;
    const staticVerificationFresh=Number.isFinite(staticVerifiedMs)&&Date.now()-staticVerifiedMs<=45*86400000;
    checked++;
    if(result.status==='ok'&&Array.isArray(result.releaseLinks)&&result.releaseLinks.length)await rememberReleaseSources(env,slug,result.releaseLinks);
    const reviewedSinceChange=Boolean(prior.last_change_at&&prior.static_last_verified&&staticVerified&&staticVerified!==prior.static_last_verified);
    const fingerprintChanged=result.status==='ok'&&prior.fingerprint&&result.fingerprint&&result.fingerprint!==prior.fingerprint;
    const broken=result.status==='broken'?Number(prior.broken_consecutive||0)+1:0;
    let documentBudgetDeferred=false;
    const documentation=await verifyManufacturerDocuments(env,tool,{
      fetchDocument:async url=>{
        const response=await fetchOfficial(url,{deadlineAt});
        if(response.error==='quality_cycle_budget_deferred')documentBudgetDeferred=true;
        return response;
      },hash:sha,writeEvent:persistManufacturerWatchEvent
    }).catch(error=>({status:'documentation_warning',checked:0,changed:false,error:safeText(error?.message||error,250)}));
    // A time-limited fetch is not evidence that a vendor removed a feature.
    // Keep the prior D1 tool state intact and retry this product next cycle.
    if(documentBudgetDeferred||Date.now()>=deadlineAt){cycleBudgetExhausted=true;return;}
    documentationChecked+=Number(documentation.checked||0);
    if(documentation.status==='baselined')documentationBaselined++;
    if(documentation.status==='documentation_warning')documentationWarnings++;
    if(documentation.changed)documentationChanged++;
    if(Array.isArray(documentation.observations)&&documentation.observations.length){
      const correction=await correctManufacturerCatalogFacts(env,tool,documentation.observations).catch(error=>({status:'correction_error',error:safeText(error?.message||error,160)}));
      if(correction.status==='corrected')factsCorrected+=Number(correction.count||0);
      else if(correction.status==='needs_second_observation')factsProposed++;
      else if(correction.status==='correction_error')await logEvent(env,slug,'catalog_fact_reconciliation_failed','failed','Manufacturer fact reconciliation error, original catalog facts left unchanged.',{error:correction.error});
    }
    let quality=String(prior.quality_status||'unverified'),contentChanged=Number(prior.content_changed||0),lastChange=prior.last_change_at||null;
    let canonicalFingerprint=prior.fingerprint||result.fingerprint||null,pendingFingerprint=prior.pending_fingerprint||null,confirmations=Number(prior.change_confirmations||0);
    if(reviewedSinceChange){quality='healthy';contentChanged=0;lastChange=null;canonicalFingerprint=result.fingerprint||canonicalFingerprint;pendingFingerprint=null;confirmations=0}
    if(verificationSourceChanged&&result.status==='ok'){canonicalFingerprint=result.fingerprint;pendingFingerprint=null;confirmations=0;quality='healthy';contentChanged=0;lastChange=null;}
    else if(result.status==='ok'&&!prior.fingerprint){canonicalFingerprint=result.fingerprint;pendingFingerprint=null;confirmations=0;quality='healthy';contentChanged=0;}
    else if(fingerprintChanged&&!reviewedSinceChange){
      if(pendingFingerprint&&pendingFingerprint===result.fingerprint)confirmations+=1;else{pendingFingerprint=result.fingerprint;confirmations=1}
      if(confirmations>=2){
        canonicalFingerprint=result.fingerprint;pendingFingerprint=null;confirmations=0;quality='change_detected';contentChanged=1;lastChange=new Date().toISOString().replace('T',' ').slice(0,19);changed++;
        const newsCandidate=await upsertNewsCandidate(env,slug,result.finalUrl||verifyUrl,result).catch(()=>null);
        await logEvent(env,slug,'catalog_source_change_detected','completed','A new official-source fingerprint was reproduced on two consecutive checks. Volatile facts remain flagged until the static editorial record is re-verified.',{source_url:verifyUrl,http_status:result.httpStatus,news_candidate_id:newsCandidate?.candidate_id||null,news_materiality_score:newsCandidate?.materiality_score??null});
      }
    }else if(result.status==='ok'&&result.fingerprint===prior.fingerprint){
      pendingFingerprint=null;confirmations=0;if(!prior.last_change_at){quality='healthy';contentChanged=0;}
    }
    if(documentation.changed&&!reviewedSinceChange&&quality!=='confirmed_broken'){
      if(quality!=='change_detected')changed++;
      quality='change_detected';contentChanged=1;lastChange=new Date().toISOString().replace('T',' ').slice(0,19);
    }else if(documentation.status==='documentation_warning'&&quality==='healthy'&&!lastChange){
      // Document access failure is not proof that a product feature disappeared.
      quality='source_warning';
    }
    if(broken>=2){quality='confirmed_broken';contentChanged=0;pendingFingerprint=null;confirmations=0;suppressed++;await logEvent(env,slug,'catalog_tool_suppressed','completed','Official source returned a confirmed 404/410 on two consecutive runtime checks.',{source_url:verifyUrl,http_status:result.httpStatus})}
    else if(result.status!=='ok'&&result.status!=='broken'){
      warnings++;
      if(staticVerificationFresh&&!lastChange&&documentation.status!=='documentation_warning')quality='healthy';
      else if(quality==='unverified')quality='source_warning';
    }
    if(quality==='healthy')healthy++;
    await env.DB.prepare(`INSERT INTO catalog_runtime_state(tool_slug,source_url,source_status,http_status,final_url,fingerprint,pending_fingerprint,change_confirmations,content_changed,broken_consecutive,quality_status,static_last_verified,last_checked_at,last_change_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET source_url=excluded.source_url,source_status=excluded.source_status,http_status=excluded.http_status,final_url=excluded.final_url,fingerprint=COALESCE(excluded.fingerprint,catalog_runtime_state.fingerprint),pending_fingerprint=excluded.pending_fingerprint,change_confirmations=excluded.change_confirmations,content_changed=excluded.content_changed,broken_consecutive=excluded.broken_consecutive,quality_status=excluded.quality_status,static_last_verified=excluded.static_last_verified,last_checked_at=datetime('now'),last_change_at=excluded.last_change_at,updated_at=datetime('now')`)
      .bind(slug,verifyUrl,result.status,result.httpStatus,result.finalUrl,canonicalFingerprint,pendingFingerprint,confirmations,contentChanged,broken,quality,staticVerified,lastChange).run();
  });
  runtimeCache.at=0;
  const researchSupply=Date.now()>=deadlineAt
    ?{ok:true,staged:0,deferred:true,reason:'catalog_quality_cycle_budget_exhausted'}
    :await syncCatalogResearchSupply(env,{knownTools:all,deadlineAt}).catch(async error=>{
    const reason=safeText(error?.message||error,250);
    await logEvent(env,null,'catalog_research_supply_failed','failed','Bounded discovery intake failed without blocking ongoing official document verification.',{error:reason});
    return{ok:false,reason,staged:0};
  });
  if(Date.now()>=deadlineAt)cycleBudgetExhausted=true;
  return{ok:true,checked,healthy,changed,suppressed,warnings,documentation_checked:documentationChecked,documentation_baselined:documentationBaselined,documentation_changed:documentationChanged,documentation_warnings:documentationWarnings,verified_facts_corrected:factsCorrected,verified_fact_proposals:factsProposed,batch_limit:MAX_VERIFY_PER_CYCLE,warning_retry_hours:WARNING_RETRY_HOURS,max_warning_retries_per_cycle:MAX_WARNING_RETRIES_PER_CYCLE,evidence:'official_homepage_and_first_party_documentation',write_policy:'due_check_only',research_supply:researchSupply,cycle_budget_exhausted:cycleBudgetExhausted,cycle_wall_budget_ms:MAX_VERIFY_CYCLE_WALL_MS,cycle_elapsed_ms:Date.now()-startedAt};
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

const AFFILIATE_RESEARCH_STATUS_WEIGHT=Object.freeze({
  active:70,approved:70,
  program_exists:45,submitted:45,needs_info:45,under_review:45,review:45,application_ready:45,
  rejected:0,no_program_found:0,unavailable:0
});
function normalizedAffiliateStatus(value){return String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
async function affiliateResearchRegistry(env){
  const registry=new Map(),rank=status=>Number(AFFILIATE_RESEARCH_STATUS_WEIGHT[normalizedAffiliateStatus(status)]||0);
  const put=(slug,status)=>{
    const key=String(slug||'').toLowerCase().trim();if(!key)return;
    const normalized=normalizedAffiliateStatus(status),prior=registry.get(key);
    if(!prior||rank(normalized)>rank(prior))registry.set(key,normalized);
  };
  const asset=await assetJson(env,'/data/affiliate-pipeline.json',{verified_programs:[]});
  for(const row of Array.isArray(asset?.verified_programs)?asset.verified_programs:[])put(row?.slug,row?.status);
  const queries=[
    `SELECT tool_slug,status FROM affiliate_program_discovery`,
    `SELECT tool_slug,status FROM affiliate_workflow`,
    `SELECT tool_slug,programme_status status FROM affiliate_network_program_evidence`
  ];
  for(const sql of queries){
    const rows=await env.DB.prepare(sql).all().catch(()=>({results:[]}));
    for(const row of rows.results||[])put(row?.tool_slug,row?.status);
  }
  return registry;
}
export function catalogCandidateResearchPriority(candidate,affiliateStatus=null,config={}){
  const weights=config?.discovery?.researchPriority||{};
  const activeAffiliate=Number(weights.activeAffiliateProgram??70);
  const knownAffiliate=Number(weights.knownAffiliateProgram??45);
  const verifiedMcp=Number(weights.verifiedMcp??60);
  const verifiedAi=Number(weights.verifiedAiInteroperability??40);
  const aiHintWeight=Number(weights.aiOrAgentResearchHint??20);
  const combo=Number(weights.combinedAiAndAffiliateBonus??35);
  const p=candidate?.aiIntegration&&typeof candidate.aiIntegration==='object'?candidate.aiIntegration:null;
  const mcp=String(p?.mcp||'').toLowerCase();
  let ai=0,aiSignal='none';
  if(mcp==='official'||mcp==='community'){ai=verifiedMcp;aiSignal='mcp'}
  else if(String(p?.status||'').toLowerCase()==='verified'){ai=verifiedAi;aiSignal='verified_ai_interoperability'}
  else{
    const text=[candidate?.name,candidate?.slug,candidate?.description,...(candidate?.features||[]),...(candidate?.bestFor||[])].filter(Boolean).join(' ').toLowerCase();
    if(/\bmcp\b|model context protocol|chatgpt|claude|gemini|copilot|ai agent|agentic|agent connectivity|ai integration|development agents/.test(text)){ai=aiHintWeight;aiSignal='ai_agent_research_hint'}
  }
  const status=normalizedAffiliateStatus(affiliateStatus);
  let affiliate=Number(AFFILIATE_RESEARCH_STATUS_WEIGHT[status]||0),affiliateSignal=status||'none';
  if(status==='active'||status==='approved')affiliate=Math.max(affiliate,activeAffiliate);
  else if(affiliate>0)affiliate=Math.max(affiliate,knownAffiliate);
  if(!affiliate){
    const raw=String(candidate?.affiliateProgram||'').toLowerCase();
    if(raw&&!/pending|unknown|none|not available|no program/.test(raw)){affiliate=knownAffiliate;affiliateSignal='candidate_program_evidence'}
  }
  return{score:ai+affiliate+(ai>0&&affiliate>0?combo:0),ai,affiliate,aiSignal,affiliateSignal};
}
// Directory discovery is a supply signal, not proof of manufacturer features,
// commercial terms, two independent demand signals or decision-grade editorial.
// Stage leads in the existing D1 market-gap queue without publishing any tool.
export function selectCatalogResearchLeads(leads,existingGapSlugs=[],knownToolSlugs=[],limit=MAX_RESEARCH_SEEDS_PER_CYCLE){
  const excluded=new Set([...existingGapSlugs,...knownToolSlugs].map(x=>String(x||'').toLowerCase()));
  const seen=new Set(),selected=[];
  for(const lead of Array.isArray(leads)?leads:[]){
    const slug=String(lead?.slug||'').toLowerCase(),candidateUrl=String(lead?.candidateUrl||'');
    if(!/^[a-z0-9][a-z0-9-]*$/.test(slug)||seen.has(slug)||excluded.has(slug))continue;
    const u=publicHttps(candidateUrl);
    if(!u||!u.hostname||/\s/.test(candidateUrl))continue;
    seen.add(slug);
    selected.push({slug,candidateUrl:u.href});
    if(selected.length>=Math.max(1,Math.min(200,Number(limit)||MAX_RESEARCH_SEEDS_PER_CYCLE)))break;
  }
  return selected;
}
export async function syncCatalogResearchSupply(env,{knownTools=null,limit=MAX_RESEARCH_SEEDS_PER_CYCLE,deadlineAt=Infinity}={}){
  await ensureSchema(env);
  const directory=await assetJson(env,'/data/catalog-research-seeds-scale.json',null);
  if(directory?.schemaVersion!==1||directory?.status!=='research_only_not_catalog'||!Array.isArray(directory.candidates))
    return{ok:false,reason:'research_supply_asset_unavailable_or_invalid',staged:0};
  // An early rollout may have staged directory-only rows as executable gaps.
  // Repair only that identifiable cohort before the planner can retry it.
  const recovered=await env.DB.prepare(`UPDATE catalog_market_gaps
    SET status='discovery_only',updated_at=datetime('now')
    WHERE status='research_required' AND signals<2
      AND sources_json LIKE '%awesome-selfhosted-directory%'`).run();
  const gaps=await env.DB.prepare('SELECT tool_slug FROM catalog_market_gaps').all();
  const known=Array.isArray(knownTools)?knownTools:await mergedTools(env);
  const existing=(gaps.results||[]).map(x=>x.tool_slug);
  const selected=selectCatalogResearchLeads(directory.candidates,existing,known.map(x=>x.slug),limit);
  let staged=0,deferred=false;
  for(const lead of selected){
    if(Date.now()>=deadlineAt){deferred=true;break;}
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO catalog_market_gaps
      (tool_slug,signals,sources_json,examples_json,status,updated_at)
      VALUES(?,1,?,?,'discovery_only',datetime('now'))`)
      .bind(lead.slug,JSON.stringify(['awesome-selfhosted-directory']),JSON.stringify([lead.candidateUrl])).run();
    staged+=Number(result?.meta?.changes||result?.changes||0);
  }
  if(staged>0)await logEvent(env,null,'catalog_research_supply_staged','completed',
    'Research-only directory leads were queued without manufacturer proof, editorial admission, public profiles or monetized links.',
    {staged,source:'awesome-selfhosted-directory',directory_leads:directory.candidates.length,
      existing_before:existing.length,max_per_cycle:MAX_RESEARCH_SEEDS_PER_CYCLE});
  return{ok:true,staged,deferred,converted_from_executable:Number(recovered?.meta?.changes||recovered?.changes||0),
    source:'awesome-selfhosted-directory',directory_leads:directory.candidates.length,queued_before:existing.length,
    admission:'discovery_only_until_independent_signal_and_decision_grade_first_party_evidence',max_per_cycle:MAX_RESEARCH_SEEDS_PER_CYCLE};
}
// Independent directory mentions are only *product* market demand when the
// source URLs identify this specific product. Taxonomy, search and FAQ pages
// cannot turn a generic workflow label into a software profile.
export function classifyMarketGapEvidence(gap){
  const slug=String(gap?.slug||'').toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]*$/.test(slug))
    return{status:'discovery_only',reason:'invalid_product_identity',independent_product_hosts:0};
  const productHosts=new Map(),taxonomyHosts=new Set();
  const publisherNames=(Array.isArray(gap?.sources)?gap.sources:[])
    .map(v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')).filter(x=>x.length>=4);
  for(const raw of Array.isArray(gap?.exampleUrls)?gap.exampleUrls:[]){
    try{
      const u=new URL(String(raw));
      if(u.protocol!=='https:'||u.username||u.password)continue;
      const parts=decodeURIComponent(u.pathname).toLowerCase().split('/').filter(Boolean);
      const terminal=parts.at(-1)||'';
      const host=u.hostname.toLowerCase().replace(/^www\./,'');
      const taxonomy=parts.some(part=>['category','categories','feature','features','faq','tag','tags','topics','search','browse','filter','pricing'].includes(part))
        ||/(?:-software|-tools)$/.test(terminal)&&terminal!==slug;
      if(taxonomy){taxonomyHosts.add(host);continue;}
      if(!parts.length||terminal!==slug)continue;
      // Correlate each cited publisher to its own site, not two unrelated
      // source labels with two mirrored subdomains of the same publisher.
      const labels=host.split('.');
      const suffix=labels.slice(-2).join('.');
      const multiSuffix=['co.uk','org.uk','com.au','co.jp','co.in','com.br','com.mx','com.tr','co.nz'].includes(suffix);
      const publisherRoot=labels.slice(multiSuffix?-3:-2).join('.');
      const flat=publisherRoot.replace(/[^a-z0-9]/g,'');
      const matchedPublisher=publisherNames.find(label=>flat.includes(label));
      if(matchedPublisher)productHosts.set(publisherRoot,matchedPublisher);
    }catch{}
  }
  const independent=Math.min(productHosts.size,new Set(productHosts.values()).size);
  return independent>=2
    ?{status:'research_required',reason:'independent_product_page_signals',independent_product_hosts:independent,taxonomy_hosts:taxonomyHosts.size}
    :{status:'discovery_only',reason:'insufficient_product_identity_signals',independent_product_hosts:independent,taxonomy_hosts:taxonomyHosts.size};
}

async function syncMarketGaps(env,{deadlineAt=Infinity}={}){
  const report=await assetJson(env,'/reports/competitive-gap-signals.json',{gaps:[]});
  let synced=0,deferred=false,productReady=0,discoveryOnly=0;
  const gaps=Array.isArray(report?.gaps)?report.gaps:[];
  for(const gap of gaps){
    if(Date.now()>deadlineAt){deferred=true;break;}
    const slug=String(gap?.slug||'').toLowerCase().replace(/[^a-z0-9-]/g,'');if(!slug)continue;
    const signal=classifyMarketGapEvidence(gap);
    await env.DB.prepare(`INSERT INTO catalog_market_gaps(tool_slug,signals,sources_json,examples_json,status,updated_at) VALUES(?,?,?,?,?,datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET signals=excluded.signals,sources_json=excluded.sources_json,examples_json=excluded.examples_json,status=CASE WHEN catalog_market_gaps.status IN ('published','admitted_coverage','covered','covered_existing') THEN catalog_market_gaps.status ELSE excluded.status END,updated_at=datetime('now')`)
      .bind(slug,Number(gap?.mentions||gap?.sources?.length||0),JSON.stringify(gap?.sources||[]),JSON.stringify(gap?.exampleUrls||[]),signal.status).run();
    if(signal.status==='research_required')productReady++;else discoveryOnly++;
    synced++;
  }
  return {synced,deferred,product_identity_qualified:productReady,discovery_only:discoveryOnly};
}
// Signal existing Growth Brain scheduler when a reviewed cohort becomes
// admission-ready. This is discovery only; the existing documented-source,
// image, D1 and publication gates remain exclusively in admitTrustedCandidates.
export function unpublishedReadyCatalogSlugs(candidateLists,existingSlugs){
  const existing=new Set([...existingSlugs].map(v=>String(v||'').toLowerCase()));
  const ready=[];
  for(const candidates of candidateLists||[]){
    for(const tool of Array.isArray(candidates)?candidates:[]){
      const slug=String(tool?.slug||'').toLowerCase();
      if(!slug||existing.has(slug)||!trustedManufacturerEvidence(tool,{decisionGrade:true}))continue;
      ready.push(slug);
      existing.add(slug);
    }
  }
  return ready;
}
export async function hasNewDecisionGradeCatalogSupply(env){
  await ensureSchema(env);
  const config=await assetJson(env,'/data/catalog-engine.json',{});
  const [staticTools,runtimeTools,candidates]=await Promise.all([
    assetJson(env,'/data/tools.json',[]),
    runtimeCandidates(env),
    Promise.all((config.trustedCandidateFiles||[]).map(file=>
      assetJson(env,'/'+String(file).replace(new RegExp('^/'),''),[])))
  ]);
  const known=[...(Array.isArray(staticTools)?staticTools:[]),...runtimeTools].map(t=>t?.slug);
  if(unpublishedReadyCatalogSlugs(candidates,known).length>0)return true;
  // A newly staged D1 candidate is already preflighted for manufacturer
  // evidence, and should wake existing incident-recovery ownership.
  const staged=await env.DB.prepare("SELECT tool_slug FROM catalog_runtime_candidates WHERE status='research_ready' LIMIT 1").first();
  return Boolean(staged?.tool_slug);
}
export async function admitTrustedCandidates(env){
  // The bounded supplier must include D1/schema, registry, seed and candidate-file
  // preparation, not just per-tool fetch/quality verification.
  const startedAt=Date.now();
  const setupDeadline=phase=>Date.now()-startedAt>MAX_ADMISSION_WALL_MS?{
    ok:false,reason:'catalog_admission_setup_budget_exhausted',phase,
    considered:0,admitted:0,held:0,missing_manufacturer_evidence:0,
    cycle_budget_exhausted:true,cycle_wall_budget_ms:MAX_ADMISSION_WALL_MS,
    cycle_elapsed_ms:Date.now()-startedAt,preparation_deferred:true,
    max_admissions:MAX_ADMIT_PER_DAY,candidate_check_limit:MAX_CANDIDATE_CHECKS_PER_CYCLE
  }:null;
  // Returning ok:false leaves a recoverable failed mission in the existing
  // ledger, so the next hourly scheduler can retry without publishing guesses.
  await ensureSchema(env);
  if(setupDeadline('schema'))return setupDeadline('schema');
  const config=await assetJson(env,'/data/catalog-engine.json',{});
  if(setupDeadline('config'))return setupDeadline('config');
  const staticTools=await assetJson(env,'/data/tools.json',[]);
  if(setupDeadline('baseline'))return setupDeadline('baseline');
  const existing=new Set((Array.isArray(staticTools)?staticTools:[]).map(x=>String(x?.slug||'').toLowerCase()));
  const runtime=await runtimeCandidates(env);
  if(setupDeadline('runtime_candidates'))return setupDeadline('runtime_candidates');
  for(const x of runtime)existing.add(String(x?.slug||'').toLowerCase());
  const affiliateRegistry=await affiliateResearchRegistry(env);
  if(setupDeadline('affiliate_registry'))return setupDeadline('affiliate_registry');
  const seeds=await assetJson(env,'/data/catalog-research-seeds.json',{candidates:[]});
  if(setupDeadline('research_seeds'))return setupDeadline('research_seeds');
  // Reviewed candidates enter the same admission contract directly from
  // canonical D1. No code deployment or parallel catalog is required per cohort.
  // Staged records are never part of runtimeCandidates() or public surfaces.
  const staged=(await env.DB.prepare(`SELECT tool_slug,profile_json FROM catalog_runtime_candidates
    WHERE status='research_ready' ORDER BY updated_at ASC LIMIT 128`).all()).results||[];
  if(setupDeadline('d1_research_ready'))return setupDeadline('d1_research_ready');
  // Recent source failures remain unpublished. Defer repeated retries, never
  // convert a blocked vendor into evidence or spend this cycle's network budget
  // on the same failed manufacturer every hour.
  const recentSourceHolds=await env.DB.prepare(`SELECT DISTINCT tool_slug FROM catalog_runtime_events
    WHERE event_type='catalog_candidate_official_source_hold' AND created_at>=datetime('now', ?)`)
    .bind(`-${OFFICIAL_SOURCE_HOLD_COOLDOWN_HOURS} hours`).all();
  if(setupDeadline('source_hold_cooldown'))return setupDeadline('source_hold_cooldown');
  const sourceHoldCooldown=new Set((recentSourceHolds.results||[]).map(row=>String(row.tool_slug||'').toLowerCase()));
  const researchSeeds=(Array.isArray(seeds?.candidates)?seeds.candidates:[]).filter(x=>x?.slug&&!existing.has(String(x.slug).toLowerCase()));
  const pool=[],seen=new Set();let sequence=0;
  for(const file of config?.trustedCandidateFiles||[]){
    if(setupDeadline('before_candidate_file'))return setupDeadline('before_candidate_file');
    const candidates=await assetJson(env,'/'+String(file).replace(/^\//,''),[]);
    if(setupDeadline('candidate_file'))return setupDeadline('candidate_file');
    let prepared=0;
    for(const raw of Array.isArray(candidates)?candidates:[]){
      if(++prepared%64===0&&setupDeadline('candidate_pool'))return setupDeadline('candidate_pool');
      const slug=String(raw?.slug||'').toLowerCase();if(!slug||existing.has(slug)||seen.has(slug))continue;
      seen.add(slug);
      const priority=catalogCandidateResearchPriority(raw,affiliateRegistry.get(slug)||null,config);
      pool.push({raw,slug,priority,ready:trustedManufacturerEvidence(raw,{decisionGrade:true}),sequence:sequence++});
    }
  }
  for(const row of staged){
    if(setupDeadline('d1_candidate_pool'))return setupDeadline('d1_candidate_pool');
    let raw=null;try{raw=JSON.parse(row.profile_json||'null')}catch{}
    const slug=String(row.tool_slug||'').toLowerCase();
    if(!raw||raw.slug!==slug||existing.has(slug)||seen.has(slug))continue;
    seen.add(slug);
    const priority=catalogCandidateResearchPriority(raw,affiliateRegistry.get(slug)||null,config);
    pool.push({raw,slug,priority,ready:trustedManufacturerEvidence(raw,{decisionGrade:true}),origin:'d1_research_ready',sequence:sequence++});
  }
  const categoryCounts=new Map();
  for(const t of staticTools||[]){const key=String(t.category||'');categoryCounts.set(key,(categoryCounts.get(key)||0)+1)}
  const target=Math.max(1,Number(config?.coverage?.minimumToolsPerIntentCategory||5));
  pool.sort((a,b)=>Number(b.ready)-Number(a.ready)||
    Math.max(0,target-(categoryCounts.get(b.raw.category)||0))-Math.max(0,target-(categoryCounts.get(a.raw.category)||0))||
    b.priority.score-a.priority.score||a.sequence-b.sequence||a.slug.localeCompare(b.slug));
  let admitted=0,held=0,considered=0,missingManufacturerEvidence=0,cycleBudgetExhausted=false,sourceRetriesDeferred=0;
  const budgetStop=()=>{if(Date.now()-startedAt>MAX_ADMISSION_WALL_MS){cycleBudgetExhausted=true;return true}return false};
  for(const item of pool){
    if(admitted>=MAX_ADMIT_PER_DAY||considered>=MAX_CANDIDATE_CHECKS_PER_CYCLE)break;
    if(budgetStop())break;
    if(sourceHoldCooldown.has(item.slug)){sourceRetriesDeferred++;continue;}
    const {raw,slug,priority}=item;considered++;
    const errors=validCandidate(raw,config);if(errors.length){held++;await logEvent(env,slug,'catalog_candidate_structure_hold','completed','Catalog record failed admission field completeness before publication.',{issues:errors});continue}
    // Pure preflight before any network fetch. Undocumented research seeds
    // cannot become published software merely through a reachable homepage.
    if(!trustedManufacturerEvidence(raw,{decisionGrade:true})){held++;missingManufacturerEvidence++;await logEvent(env,slug,'catalog_candidate_manufacturer_evidence_hold','completed','Vendor documentation or claim-level decision evidence is insufficient for publication.',{required:'decision_grade_manufacturer_evidence'});continue}
    if(item.origin==='d1_research_ready'){
      // API-supplied research attestation alone cannot publish a product:
      // independently check two distinct private manufacturer document pages
      // before applying the same visual/source/editorial admission gates.
      const documents=trustedCandidateOfficialFallbackUrls(raw).slice(0,3);
      const evidenceChecks=await mapLimit(documents,2,url=>fetchOfficial(url,{deadlineAt:startedAt+MAX_ADMISSION_WALL_MS}));
      if(budgetStop())break;
      const accessible=new Set(evidenceChecks.filter((result,index)=>
        result?.status==='ok'&&sameManufacturerHost(result.finalUrl,raw.sourceUrl)&&
        documents[index]&&publicHttps(result.finalUrl)?.pathname!=='/'
      ).map(result=>result.finalUrl));
      if(accessible.size<2){
        held++;
        await logEvent(env,slug,'catalog_candidate_manufacturer_docs_hold','completed',
          'Two independently fetched first-party manufacturer documents were not reachable. Research remains private.',
          {document_checks:evidenceChecks.length,reachable_distinct:accessible.size});
        continue;
      }
    }
    const source=await fetchTrustedCandidateOfficialSource(raw);
    if(budgetStop())break; // homepage and documentation fallbacks may consume several timeouts
    if(config?.admission?.requireReachableOfficialSource!==false&&source.status!=='ok'){
      held++;
      await logEvent(env,slug,'catalog_candidate_official_source_hold','completed',
        'Neither the vendor homepage nor dated first-party product documents yielded a reachable trustworthy source.',
        {source_status:source.status,http_status:source.httpStatus||null,
          verified_vendor_fallbacks_checked:source.fallbackDocumentsAttempted||0});
      continue;
    }
    const aiIntegration=raw?.aiIntegration&&typeof raw.aiIntegration==='object'?raw.aiIntegration:{status:'unverified',tier:'unknown',mcp:'unknown',publicApi:null,assistants:[],summary:'ToolScout has not yet verified this tool\'s current ChatGPT, Claude, Gemini, MCP or agent integration options.',verifiedAt:null,sources:[]};
    let profile={...raw,aiIntegration,sourceUrl:raw.sourceUrl,lastVerified:new Date().toISOString().slice(0,10),rankingEligible:true,comparisonEligible:true,provenance:{...(raw.provenance||{}),mode:'runtime_trusted_catalog',admittedAt:new Date().toISOString(),affiliateNeutral:true,reviewMethod:'first_party_verified_structured_profile_v2',researchPriority:{score:priority.score,aiSignal:priority.aiSignal,affiliateSignal:priority.affiliateSignal}}};
    // Keep the structured review and dated private manufacturer sources. A
    // flattened string destroys verification evidence in downstream decisions.
    profile.editorialReview={...raw.editorialReview};
    profile.provenance.sourceAvailabilityVerifiedVia=source.selectedSource;
    profile.editorialEvidence={sourceUrl:raw.editorialReview.sourceUrl,verifiedAt:new Date().toISOString().slice(0,10),verificationStatus:'vendor_documented'};
    const quality=await auditCatalogTool(env,profile);
    if(budgetStop())break; // quality pages and logo checks are awaited network phases
    if(!quality.publishable){held++;await logEvent(env,slug,'catalog_candidate_quality_hold','completed','Trusted candidate failed full catalog quality gate before publication.',{issues:quality.issues,warnings:quality.warnings,research_priority:priority});continue}
    profile=quality.repairedTool;
    await env.DB.prepare(`INSERT INTO catalog_runtime_candidates(tool_slug,profile_json,status,source_status,verified_at,updated_at) VALUES(?,?,'published','ok',datetime('now'),datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET profile_json=excluded.profile_json,status='published',source_status='ok',verified_at=datetime('now'),updated_at=datetime('now')`)
      .bind(slug,JSON.stringify(profile)).run();
    await logEvent(env,slug,'catalog_candidate_admitted','completed','Trusted candidate admitted as a full ToolScout catalog peer after official-source and deterministic quality gates.',{source_url:profile.sourceUrl,category:profile.category,research_priority:priority});
    existing.add(slug);admitted++;
    if(budgetStop())break; // include database writes and admission evidence in elapsed time
  }
  // Never start unbounded trailing synchronization once the budget is exhausted.
  // Resume any deferred gap synchronization during the next existing cycle.
  let market_gaps=0,market_gaps_deferred=false,snapshot_deferred=false;
  if(budgetStop())market_gaps_deferred=true;
  else{
    const sync=await syncMarketGaps(env,{deadlineAt:startedAt+MAX_ADMISSION_WALL_MS});
    market_gaps=sync.synced;
    market_gaps_deferred=sync.deferred;
    budgetStop();
  }
  runtimeCache.at=0;
  if(admitted>0){
    if(budgetStop())snapshot_deferred=true;
    else{await runtimeSnapshot(env,{force:true}).catch(()=>null);budgetStop()}
  }
  return{ok:true,considered,admitted,held,missing_manufacturer_evidence:missingManufacturerEvidence,
    trusted_sources_total:seen.size,ready_trusted_sources:pool.filter(x=>x.ready).length,
    d1_research_ready_considered:staged.length,
    cycle_budget_exhausted:cycleBudgetExhausted,cycle_wall_budget_ms:MAX_ADMISSION_WALL_MS,
    cycle_elapsed_ms:Date.now()-startedAt,market_gaps_deferred,snapshot_deferred,
    official_source_retries_deferred:sourceRetriesDeferred,official_source_retry_hours:OFFICIAL_SOURCE_HOLD_COOLDOWN_HOURS,
    research_seeds_total:researchSeeds.length,research_seeds_status:'first_party_documentation_research_only_not_admission_ready',
    candidate_supply_status:pool.some(x=>x.ready)?'documented_candidates_available':researchSeeds.length?'research_evidence_incomplete':'no_new_candidate_supply',
    market_gaps_synced:market_gaps,max_admissions:MAX_ADMIT_PER_DAY,candidate_check_limit:MAX_CANDIDATE_CHECKS_PER_CYCLE,
    priority_policy:'documented_first_then_category_coverage_then_affiliate_ai_research',rule:'Documented manufacturer evidence and unmet category coverage outrank commercial discovery hints. Admission and rankings remain affiliate-neutral. Research seeds are not published tools.'};
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
  const documentedSummary=typeof tool?.editorialReview==='string'?tool.editorialReview:tool?.editorialReview?.summary;
  if(typeof documentedSummary==='string'&&documentedSummary.trim())return safeText(documentedSummary,1800);
  const entries=Object.entries(tool?.scores||{}).filter(([,v])=>Number.isFinite(Number(v))).sort((a,b)=>Number(b[1])-Number(a[1]));
  const strongest=entries.slice(0,2).map(([k])=>RUNTIME_SCORE_LABELS[k]||k),weak=entries.at(-1),aud=(tool?.bestFor||[]).slice(0,3),caps=(tool?.features||[]).slice(0,3);
  const fit=tool.name+' is a practical fit for '+runtimeListPhrase(aud.length?aud:['buyers whose workflow matches its core capabilities'])+', especially when '+runtimeListPhrase(caps.length?caps:['its core workflow'])+' matter most.';
  const strengths=strongest.length?' In ToolScout scoring, '+runtimeListPhrase(strongest)+' are its strongest recorded dimensions.':'';
  const trade=weak&&Number(entries[0]?.[1]||0)-Number(weak[1])>=3?' '+(RUNTIME_SCORE_LABELS[weak[0]]||weak[0])+' is the clearest recorded trade-off, so compare alternatives if that requirement is central.':'';
  const commercial=tool?.freePlanKnown===false?' Compare the available purchasing models and operating cost for the intended workload.':tool?.freePlan?' A recorded free plan makes it easier to test before committing.':' Validate the use case and current pricing before committing.';
  return safeText((fit+strengths+trade+commercial+' Check current vendor limits, integrations and pricing before purchase.').replace(/[\u2013\u2014]/g,'-'),1800);
}
function runtimeLogo(tool){
  if(tool?.logoUrl)return tool.logoUrl;
  try{return 'https://www.google.com/s2/favicons?domain='+encodeURIComponent(new URL(tool.sourceUrl).hostname)+'&sz=128'}catch{return''}
}
function runtimeInitials(name){return String(name||'T').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function aiProfile(tool){return tool?.aiIntegration&&typeof tool.aiIntegration==='object'?tool.aiIntegration:{status:'unverified',tier:'unknown',mcp:'unknown',publicApi:null,assistants:[],summary:'ToolScout has not yet verified this tool\'s current ChatGPT, Claude, Gemini, MCP or agent integration options.',verifiedAt:null,sources:[]};}
function aiInteroperabilitySection(tool){
  const p=aiProfile(tool),verified=p.status==='verified',assistants=(p.assistants||[]).filter(Boolean),mcp=p.mcp==='official'?'Official':p.mcp==='community'?'Community':'Not verified',api=p.publicApi===true?'Verified':p.publicApi===false?'No':'Not verified';
  const tier=verified?(p.tier==='strong'?'Strong':p.tier==='moderate'?'Moderate':p.tier==='limited'?'Limited':'Verified'):'Not yet verified';
  const summary=p.summary||'ToolScout has not yet verified this tool\'s current AI assistant, MCP or agent integration options.';
  // Manufacturer documentation is private editorial evidence, never a
  // public non-monetized outbound link on runtime software profiles.
  // Manufacturer evidence stays in the private catalog; no research-process prose is published.
  const hasManufacturerProof=verified&&(p.sources||[]).some(x=>{
    try{
      const u=new URL(x),vendor=new URL(tool.sourceUrl);
      const subdomain=u.hostname.toLowerCase().replace(/^www\./,'');
      const parent=vendor.hostname.toLowerCase().replace(/^www\./,'');
      const documentationRoot=/^(docs|help|developer|developers|support|api)\./i.test(subdomain)&&
        subdomain.endsWith('.'+parent);
      return u.protocol==='https:'&&sameManufacturerHost(x,tool.sourceUrl)&&
        (u.pathname!=='/'||documentationRoot);
    }catch{return false}
  });
  const verificationDate=String(p.verifiedAt||'');
  const verifiedDateMs=Date.parse(verificationDate+'T00:00:00Z');
  const validVerificationDate=/^\d{4}-\d{2}-\d{2}$/.test(verificationDate)&&
    Number.isFinite(verifiedDateMs)&&new Date(verifiedDateMs).toISOString().slice(0,10)===verificationDate&&
    verifiedDateMs<=Date.now();
  const datedManufacturerProof=hasManufacturerProof&&validVerificationDate;
  // Unknown or unsupported AI claims are research state, not reader-facing
  // content. Publish interoperability only with dated manufacturer proof.
  if(!datedManufacturerProof)return '';
  const evidenceNote=datedManufacturerProof?'<p class="small" data-ai-evidence-date="1"><strong>AI compatibility:</strong> Manufacturer-confirmed, verified '+esc(p.verifiedAt)+'.</p>':'';
  return '<section class="section" data-ai-interoperability="1"><div class="eyebrow">AI interoperability</div><h2>How '+esc(tool.name)+' works with AI assistants and agents</h2><p style="color:#667085;line-height:1.65">'+esc(summary)+'</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><span style="font-size:12px;border:1px solid #e4e7ec;border-radius:10px;padding:8px 10px"><strong>AI fit:</strong> '+esc(tier)+'</span><span style="font-size:12px;border:1px solid #e4e7ec;border-radius:10px;padding:8px 10px"><strong>Assistants:</strong> '+esc(assistants.length?assistants.join(', '):'Not verified')+'</span><span style="font-size:12px;border:1px solid #e4e7ec;border-radius:10px;padding:8px 10px"><strong>MCP:</strong> '+esc(mcp)+'</span><span style="font-size:12px;border:1px solid #e4e7ec;border-radius:10px;padding:8px 10px"><strong>Public API:</strong> '+esc(api)+'</span></div>'+evidenceNote+'</section>';
}
function injectAiInteroperability(html,tool){
  if(!tool||String(html).includes('data-ai-interoperability="1"'))return html;
  const section=aiInteroperabilitySection(tool);
  if(!section)return html;
  const faq='<section class="section"><h2>Frequently asked questions</h2>';
  if(String(html).includes(faq))return String(html).replace(faq,section+faq);
  return String(html).includes('</main>')?String(html).replace('</main>','</main>'+section):String(html).replace('</body>',section+'</body>');
}
export function candidatePage(tool,{monetized=false}={}){
  const url=`https://trytoolscout.org/tools/${encodeURIComponent(tool.slug)}`;
  const logo=runtimeLogo(tool),initials=runtimeInitials(tool.name);
  const features=(tool.features||[]).map(x=>`<span>${esc(x)}</span>`).join('');
  const best=(tool.bestFor||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  const free=tool.freePlanKnown===true?'<p><strong>Free plan documented:</strong> '+(tool.freePlan?'Yes':'No')+'</p>':'';
  const freeFaq=tool.freePlanKnown===true?'<details><summary>Does '+esc(tool.name)+' have a free plan?</summary><p>'+(
    tool.freePlan?'The verified manufacturer records a perpetual free plan with documented conditions.':'The current documented plan listing does not include a perpetual free tier.'
  )+'</p></details>':'';
  // Every admitted product has a real tracked vendor visit. /go/ chooses
  // the approved affiliate when present, otherwise the verified manufacturer
  // homepage; non-affiliate clicks must never count as monetized.
  const visitable=Boolean(publicHttps(tool?.sourceUrl))&&trustedManufacturerEvidence(tool,{decisionGrade:true});
  const outbound=visitable
    ?'<a class="cta" data-commercial-status="'+(monetized?'affiliate':'non-affiliate')+'" href="/go/'+encodeURIComponent(tool.slug)+'" target="_blank" rel="nofollow'+(monetized?' sponsored':'')+' noopener">Visit '+esc(tool.name)+'</a>'
    :'';
  const review=runtimeEditorialView(tool);
  const buyerCheck=String(tool?.editorialReview?.buyerCheck||'').trim();
  const editorialBuyerCheck=buyerCheck
    ?'<div class="editorialBuyerCheck"><strong>Before you choose:</strong> '+esc(buyerCheck)+'</div>':'';
  // Align with the original indexed tool profiles. The public 2.0 transform
  // alone injects the single canonical header and shared site-wide CSS.
  const faqBest=(tool.bestFor||[]).join(', ')||'the use cases shown on this page';
  return `<!doctype html><html lang="en" data-toolscout-redesign="2" data-toolscout-surface="tool-profile"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><link rel="canonical" href="${url}"><title>${esc(tool.name)} Tool Profile: Features, Pricing and Best For | ToolScout</title><meta name="description" content="${esc(tool.description)}">${logo?`<meta property="og:image" content="${esc(logo)}">`:''}<style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#101828}.wrap{max-width:940px;margin:auto;padding:24px 22px 80px}a{color:#344054}.backTools{display:inline-flex;align-items:center;gap:8px;margin:0 0 30px;font-size:13px;font-weight:750;color:#667085;text-decoration:none;transition:color .18s ease,transform .18s ease}.backTools:hover{color:#101828;transform:translateX(-2px)}.backTools:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:4px}.backArrow{font-size:18px;line-height:1}.hero{padding:46px 0 26px}.heroHead{display:grid;grid-template-columns:92px 1fr;gap:22px;align-items:center}.toolLogo,.logoFallback{width:88px;height:88px;border-radius:20px;background:#fff;border:1px solid #e4e7ec;box-shadow:0 8px 24px rgba(16,24,40,.08);box-sizing:border-box}.toolLogo{object-fit:contain;padding:14px}.logoFallback{display:grid;place-items:center;font-size:26px;font-weight:850}.logoFallback[hidden],.miniFallback[hidden]{display:none!important}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:800;color:#667085}h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:12px 0 18px}.lead{font-size:19px;line-height:1.65;color:#667085}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel,details{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px}.panel p,.panel li,details p{color:#667085;line-height:1.6}.chips{display:flex;flex-wrap:wrap;gap:7px}.chips span{font-size:12px;background:#f2f4f7;border-radius:999px;padding:7px 9px}.editorialIntro{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px;margin:0 0 14px}.editorialIntro p{font-size:16px;line-height:1.7;color:#475467;margin:8px 0 0}.editorialBuyerCheck{margin-top:14px;padding-top:12px;border-top:1px solid #e4e7ec;color:#344054;font-size:14px;line-height:1.6}.editorialBuyerCheck strong{color:#101828}.section{margin-top:42px;padding-top:28px;border-top:1px solid #e4e7ec}.sectionHead{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:14px}.sectionHead h2{margin:5px 0 0}.links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.links a{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:15px;text-decoration:none;font-weight:700}.cta{display:inline-block;background:#101828;color:#fff;padding:12px 17px;border-radius:11px;text-decoration:none;font-weight:750;margin-top:22px}.secondaryCta{background:#eef2f6;color:#101828;margin-left:8px}.relatedGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.relatedCard{background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}.relatedIdentity{display:flex;align-items:center;gap:10px;min-width:0}.relatedIdentity img,.miniFallback{width:34px;height:34px;border-radius:9px;background:#f2f4f7;border:1px solid #e4e7ec;object-fit:contain;display:grid;place-items:center;font-size:10px;font-weight:850;flex:0 0 34px}.relatedName{font-weight:800;text-decoration:none;display:block}.relatedIdentity span:not(.miniFallback){display:block;font-size:11px;color:#667085}.compareBtn{font-size:12px;font-weight:800;text-decoration:none;background:#101828;color:#fff;padding:9px 11px;border-radius:9px;white-space:nowrap}.textLink{font-size:13px;font-weight:750}.aiInterop p{font-size:16px;line-height:1.65;color:#475467}.aiTier{font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em;border-radius:999px;padding:7px 9px;background:#f2f4f7;color:#667085}.aiTier.verified{background:#ecfdf3;color:#087443}.aiFacts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.aiFacts span{font-size:12px;background:#fff;border:1px solid #e4e7ec;border-radius:10px;padding:9px 10px;color:#475467}.small{font-size:12px;color:#667085;line-height:1.55}.qualityActions{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:18px}.qualityActions a{font-size:12px;color:#667085}summary{font-weight:750;cursor:pointer}@media(max-width:700px){.grid,.links,.relatedGrid{grid-template-columns:1fr}.heroHead{grid-template-columns:72px 1fr;gap:16px}.toolLogo,.logoFallback{width:68px;height:68px}.sectionHead{align-items:flex-start;flex-direction:column}.relatedCard{align-items:flex-start}.secondaryCta{margin-left:0}}</style></head><body data-editorial-quality="full"><div class="wrap"><main class="hero"><a class="backTools" href="/tools" aria-label="Back to tools"><span class="backArrow" aria-hidden="true">←</span><span>Back to tools</span></a><div class="heroHead">${logo?`<img class="toolLogo" src="${esc(logo)}" alt="${esc(tool.name)} logo" width="88" height="88" loading="eager" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="logoFallback" hidden aria-hidden="true">${esc(initials)}</span>`:`<span class="logoFallback" aria-hidden="true">${esc(initials)}</span>`}<div><div class="eyebrow">Independent ${esc(tool.category)} software profile</div><h1>${esc(tool.name)}</h1></div></div><p class="lead">${esc(tool.description)}</p></main><section class="editorialIntro"><div class="eyebrow">ToolScout view</div><p>${esc(review)}</p>${editorialBuyerCheck}</section><section class="grid"><div class="panel"><h2>Best for</h2><ul>${best}</ul><h2>Key capabilities</h2><div class="chips">${features}</div></div><div class="panel"><h2>Pricing at a glance</h2><p>${esc(tool.pricing||'See vendor for current pricing.')}</p>${free}<p><strong>Category:</strong> ${esc(tool.category)}</p>${outbound}<a class="cta secondaryCta" href="/compare.html?a=${encodeURIComponent(tool.slug)}&source=tool-profile">Add to comparator</a></div></section>${aiInteroperabilitySection(tool)}<section class="section"><h2>Frequently asked questions</h2><details><summary>What is ${esc(tool.name)} best for?</summary><p>${esc(tool.name)} is recorded in the ToolScout catalog for ${esc(faqBest)}.</p></details>${freeFaq}<details><summary>How current is this ${esc(tool.name)} profile?</summary><p>Source data last checked ${esc(tool.lastVerified||'recently')}. Vendor pricing and capabilities can change.</p></details></section><p class="small">Information last checked ${esc(tool.lastVerified||'recently')}. Product details can change.${monetized?' ToolScout may earn a commission on qualifying purchases through approved affiliate links.':''} Affiliate relationships do not influence ToolScout rankings or recommendations.</p></div></body></html>`;
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

// This is a read-only commercial URL projection over the same canonical D1
// catalog. It must never affect product eligibility, fit score or ordering.
// Missing/disabled/non-HTTPS affiliate approvals must not become /go/ links.
export async function publicDecisionCatalogTools(env){
  const [tools,registry]=await Promise.all([mergedTools(env),assetJson(env,'/data/affiliate.json',{})]);
  return tools.map(tool=>{
    const slug=String(tool.slug||'').toLowerCase(),approved=registry?.[slug];
    return {...tool,toolscoutApprovedVisit:approved?.enabled===true&&Boolean(publicHttps(approved.url))&&/^[a-z0-9][a-z0-9-]*$/.test(slug)
      ?'https://trytoolscout.org/go/'+encodeURIComponent(slug):null};
  });
}

export async function publicQualityEnhancedToolResponse(response,env,slug){
  if(!response?.ok||!(response.headers.get('Content-Type')||'').includes('text/html'))return response;
  await ensureSchema(env);
  const key=String(slug||'').toLowerCase();
  const [row,staticTools]=await Promise.all([
    env.DB.prepare(`SELECT logo_url FROM catalog_quality_audit WHERE tool_slug=? AND logo_url IS NOT NULL LIMIT 1`).bind(key).first().catch(()=>null),
    assetJson(env,'/data/tools.json',[])
  ]);
  const tool=(Array.isArray(staticTools)?staticTools:[]).find(x=>String(x?.slug||'').toLowerCase()===key)||null;
  if(!row?.logo_url&&!tool)return response;
  let html=await response.text();
  const snapshot=await runtimeSnapshot(env),revision=snapshot.candidateMap.get(key);
  const proof=snapshot.verifiedRevisions?.has(key)&&trustedManufacturerEvidence(revision,{decisionGrade:true})&&hasManufacturerDecisionClaim(revision);
  const hydrated=proof?hydrateLegacyCatalogProfile(html,revision):null;
  if(hydrated)html=hydrated;
  html=cleanPublicCatalogProfileCopy(html);
  // Private change detection never becomes a public generic uncertainty banner.
  if(row?.logo_url){
    const logo=esc(row.logo_url);
    html=html.replace(/(<img class="toolLogo" src=")[^"]*(")/i,`$1${logo}$2`);
    if(/<meta property="og:image"/i.test(html))html=html.replace(/(<meta property="og:image" content=")[^"]*(")/i,`$1${logo}$2`);
    else html=html.replace('</head>',`<meta property="og:image" content="${logo}"></head>`);
  }
  if(tool)html=injectAiInteroperability(html,tool);
  const h=new Headers(response.headers);h.delete('Content-Length');h.delete('Content-Encoding');h.set('Cache-Control','public, max-age=60');
  if(hydrated)h.set('X-ToolScout-Catalog-Hydration','verified-d1-revision');
  // AI enhancement runs after the first cleanup; clean the final response too
  // so unknown/unsupported panels cannot be reintroduced on legacy profiles.
  return new Response(cleanPublicCatalogProfileCopy(html),{status:response.status,statusText:response.statusText,headers:h});
}
export async function publicRuntimeToolResponse(env,slug){
  const key=String(slug||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!key)return null;
  const [state,candidate]=await Promise.all([toolState(env,key),runtimeCandidate(env,key)]);
  if(state?.quality_status==='confirmed_broken')return new Response('Tool profile temporarily unavailable while the official source is re-verified.',{status:404,headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
  if(!candidate)return null;
  // The original 127 indexed profiles must never switch to the newer, more
  // basic runtime template merely because a verified D1 editorial revision
  // changed its source_status away from baseline_snapshot.
  const [snapshot,staticTools,affiliateRegistry]=await Promise.all([
    runtimeSnapshot(env),assetJson(env,'/data/tools.json',[]),assetJson(env,'/data/affiliate.json',{})
  ]);
  if(snapshot.baselineMirrors?.has(key)||(Array.isArray(staticTools)&&staticTools.some(tool=>String(tool?.slug||'').toLowerCase()===key)))return null;
  const approved=affiliateRegistry?.[key];
  const monetized=approved?.enabled===true&&Boolean(publicHttps(approved.url));
  return new Response(cleanPublicCatalogProfileCopy(candidatePage(candidate,{monetized})),{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=60'}});
}
export async function publicMergedSitemap(response,env){return mergedSitemap(response,env)}
export async function publicRuntimeRankingResponse(env,path){return renderRuntimeRanking(env,path,await mergedTools(env))}

async function status(env){
  await ensureSchema(env);
  const [states,candidates,staged,gaps,events,newsSources,newsCandidates,documents]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN quality_status='healthy' THEN 1 ELSE 0 END) healthy,SUM(CASE WHEN quality_status='change_detected' THEN 1 ELSE 0 END) changed,SUM(CASE WHEN quality_status='confirmed_broken' THEN 1 ELSE 0 END) suppressed,SUM(CASE WHEN source_status NOT IN ('ok','broken') THEN 1 ELSE 0 END) warnings,MAX(last_checked_at) last_checked_at FROM catalog_runtime_state`).first(),
    env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN source_status='baseline_snapshot' THEN 1 ELSE 0 END) baseline_seeded, MAX(CASE WHEN source_status IS NULL OR source_status!='baseline_snapshot' THEN verified_at END) last_admitted_at FROM catalog_runtime_candidates WHERE status IN ('published','admitted_coverage','quality_hold')`).first(),
    env.DB.prepare(`SELECT COUNT(*) total FROM catalog_runtime_candidates WHERE status='research_ready'`).first(),
    env.DB.prepare(`SELECT COUNT(*) total FROM catalog_market_gaps WHERE status='research_required'`).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM catalog_runtime_events WHERE created_at>=datetime('now','-7 days')`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(last_checked_at) last_checked_at FROM software_news_sources WHERE status='active'`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(updated_at) last_candidate_at FROM software_news_candidates WHERE status IN ('candidate','verified','published')`).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT CASE WHEN event_type='catalog_docs_snapshot' THEN tool_slug END) baselined,COUNT(DISTINCT CASE WHEN event_type='catalog_docs_change_confirmed' AND created_at>=datetime('now','-7 days') THEN tool_slug END) changes_7d,MAX(CASE WHEN event_type='catalog_docs_snapshot' THEN created_at END) last_baseline_at FROM catalog_runtime_events WHERE event_type IN ('catalog_docs_snapshot','catalog_docs_change_confirmed')`).first()
  ]);
  const baseline=await assetJson(env,'/data/tools.json',[]);
  const tracked=await mergedTools(env);
  const watchable=tracked.filter(tool=>monitoredManufacturerDocuments(tool).length>0).length;
  const multiSource=tracked.filter(tool=>monitoredManufacturerDocuments(tool).length===2).length;
  const baselineTotal=Array.isArray(baseline)?baseline.length:0;
  const snapshot=await runtimeSnapshot(env);
  const originalSlugs=new Set((Array.isArray(baseline)?baseline:[]).map(tool=>String(tool?.slug||'').toLowerCase()).filter(Boolean));
  const baselineSeeded=[...originalSlugs].filter(slug=>snapshot.baselineMirrors?.has(slug)).length;
  const baselinePresent=[...originalSlugs].filter(slug=>snapshot.candidateMap?.has(slug)).length;
  return{ok:true,version:'1.3',storage:{mode:'d1_primary_static_fallback',baseline_total:baselineTotal,baseline_seeded:baselineSeeded,
    baseline_present:baselinePresent,baseline_revised:Math.max(0,baselinePresent-baselineSeeded),
    baseline_remaining:Math.max(0,baselineTotal-baselinePresent),migration_phase:snapshot.degraded?'runtime_degraded':baselinePresent>=baselineTotal&&baselineTotal>0?'all_baseline_records_in_d1':'baseline_seeding',legacy_html_preserved:true},state:{total:Number(states?.total||0),healthy:Number(states?.healthy||0),changed:Number(states?.changed||0),suppressed:Number(states?.suppressed||0),warnings:Number(states?.warnings||0),last_checked_at:states?.last_checked_at||null},runtime_candidates:Math.max(0,Number(candidates?.total||0)-baselineSeeded),last_admitted_at:candidates?.last_admitted_at||null,research_intake:{ready_private:Number(staged?.total||0),publication_owner:'existing_runtime_coverage',requires_live_first_party_documentation:true},document_watch:{product_coverage:watchable,two_source_coverage:multiSource,products_baselined:Number(documents?.baselined||0),confirmed_changes_7d:Number(documents?.changes_7d||0),last_baseline_at:documents?.last_baseline_at||null,rule:'First-party documentation is monitored; conservative prices, explicit plan limits and documented global capability retirements can update D1 after two identical observations. Other changes are not asserted.'},market_gaps:Number(gaps?.total||0),events_7d:Number(events?.n||0),whats_new:{official_sources:Number(newsSources?.total||0),last_source_check:newsSources?.last_checked_at||null,candidates:Number(newsCandidates?.total||0),last_candidate_at:newsCandidates?.last_candidate_at||null},rule:'Once admitted, runtime tools remain full catalog peers during recoverable quality holds, matching static-tool behavior. Only confirmed broken sources are suppressed. Official-source verification is required, and affiliate economics never affect catalog admission or ranking.'};
}

// Accept verified *research* records through the existing internal admin plane.
// The hourly Catalog Autonomy runner remains the sole publication owner.
export async function stageReviewedCatalogCandidate(env,raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return{ok:false,reason:'invalid_candidate'};
  const slug=String(raw.slug||'').toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)||raw.slug!==slug
    ||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>120)
    return{ok:false,reason:'invalid_candidate_identity'};
  const config=await assetJson(env,'/data/catalog-engine.json',null);
  const baseline=await assetJson(env,'/data/tools.json',null);
  if(!config||!Array.isArray(baseline))return{ok:false,reason:'catalog_assets_unavailable'};
  if(baseline.some(x=>x.slug===slug))return{ok:false,reason:'existing_published_tool'};
  const issues=validCandidate(raw,config);
  if(issues.length)return{ok:false,reason:'incomplete_catalog_parity',issues};
  if(!trustedManufacturerEvidence(raw,{decisionGrade:true}))
    return{ok:false,reason:'manufacturer_decision_evidence_required'};
  const serialized=JSON.stringify(raw);
  if(serialized.length>60000)return{ok:false,reason:'candidate_too_large'};
  await ensureSchema(env);
  // Never replace a published profile, baseline mirror or a quality-held
  // record through research intake. An update is permitted only while staged.
  const write=await env.DB.prepare(`INSERT INTO catalog_runtime_candidates
    (tool_slug,profile_json,status,source_status,verified_at,updated_at)
    VALUES(?,?,'research_ready','documented_research_unchecked',NULL,datetime('now'))
    ON CONFLICT(tool_slug) DO UPDATE SET
      profile_json=excluded.profile_json,updated_at=datetime('now')
    WHERE catalog_runtime_candidates.status='research_ready'`)
    .bind(slug,serialized).run();
  if(Number(write?.meta?.changes??write?.changes??0)<1)
    return{ok:false,reason:'existing_non_staged_profile'};
  await logEvent(env,slug,'catalog_candidate_research_staged','completed',
    'Decision-grade first-party reviewed candidate staged privately. Hourly admission must still verify official source, visual asset and full quality gates.',
    {source:'authenticated_research_intake',public:false,admitted:false});
  return{ok:true,slug,status:'research_ready',admitted:false,published:false,
    next:'existing_hourly_catalog_runtime_coverage_admission'};
}
async function handleReviewedCatalogStage(request,env){
  if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
  if(!(request.headers.get('Content-Type')||'').toLowerCase().includes('application/json'))
    return Response.json({error:'json_required'},{status:415,headers:JSON_H});
  const body=await request.text();
  if(body.length>60000)return Response.json({error:'candidate_too_large'},{status:413,headers:JSON_H});
  let candidate=null;try{candidate=JSON.parse(body)}catch{
    return Response.json({error:'invalid_json'},{status:400,headers:JSON_H});
  }
  const result=await stageReviewedCatalogCandidate(env,candidate);
  return Response.json(result,{status:result.ok?202:result.reason==='existing_published_tool'||result.reason==='existing_non_staged_profile'?409:422,headers:JSON_H});
}

export async function handleCatalogAutonomyRoute(request,env){
  const u=new URL(request.url);
  if(request.method==='POST'&&u.pathname==='/api/catalog-autonomy/research-stage')
    return handleReviewedCatalogStage(request,env);
  if(request.method==='GET'&&u.pathname==='/api/catalog-autonomy/status'){
    if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
    return Response.json(await status(env),{headers:JSON_H});
  }
  if(request.method==='POST'&&u.pathname==='/api/catalog-autonomy/run'){
    if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
    const verify=await runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:'manual_api',singleFlightMinutes:8},()=>verifyBatch(env));
    const admit=await runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:'manual_api',singleFlightMinutes:8},()=>admitTrustedCandidates(env));
    return Response.json({ok:true,verify,admit},{headers:JSON_H});
  }
  if(request.method==='GET'&&(u.pathname==='/data/catalog-inventory.json'||u.pathname==='/api/catalog-inventory')){
    const inventory=await publicCatalogInventory(env).catch(async()=>{const tools=await assetJson(env,'/data/tools.json',[]);return{ok:false,version:'canonical-catalog-v1',degraded:true,total:Array.isArray(tools)?tools.length:0,static_unique:Array.isArray(tools)?tools.length:0,runtime_unique:0,affiliate:{active_tools:0,uncovered_tools:Array.isArray(tools)?tools.length:0,catalog_coverage_pct:0},tools:(Array.isArray(tools)?tools:[]).map(x=>({slug:x.slug,name:x.name,category:x.category||null,origin:'static',affiliate_status:'unknown',affiliate_active:false})),generated_at:new Date().toISOString()}});
    return Response.json(inventory,{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=60','X-ToolScout-Catalog':'canonical-inventory'}});
  }
  return null;
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='POST'&&u.pathname==='/api/catalog-autonomy/research-stage')
      return handleReviewedCatalogStage(request,env);
    if(request.method==='GET'&&u.pathname==='/api/catalog-autonomy/status'){if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});return Response.json(await status(env),{headers:JSON_H})}
    if(request.method==='POST'&&u.pathname==='/api/catalog-autonomy/run'){if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});const verify=await runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:'manual_api',singleFlightMinutes:8},()=>verifyBatch(env));const admit=await runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:'manual_api',singleFlightMinutes:8},()=>admitTrustedCandidates(env));return Response.json({ok:true,verify,admit},{headers:JSON_H})}
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
      if(candidate){
        const affiliate=await assetJson(env,'/data/affiliate.json',{});
        const commercial=affiliate?.[slug];
        const monetized=commercial?.enabled===true&&Boolean(publicHttps(commercial.url));
        return new Response(cleanPublicCatalogProfileCopy(candidatePage(candidate,{monetized})),{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=300'}});
      }
      const response=await base.fetch(request,env,ctx);
      if(response.ok&&state?.quality_status==='change_detected'&&(response.headers.get('Content-Type')||'').includes('text/html')){
        const html=await response.text(),h=new Headers(response.headers);h.delete('Content-Length');h.set('Cache-Control','public, max-age=60');return new Response(html,{status:response.status,headers:h});
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
