import base from './dynamic-worker.js';
import { runWithLedger } from './engine-run-ledger.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const MAX_VERIFY_PER_CYCLE=4;
const MAX_NEWS_SOURCE_CHECKS_PER_CYCLE=4;
const MAX_ADMIT_PER_DAY=3;
const MAX_CANDIDATE_CHECKS_PER_CYCLE=4;
const WARNING_RETRY_HOURS=24;
const MAX_WARNING_RETRIES_PER_CYCLE=1;
const FETCH_TIMEOUT_MS=6000;
let schemaReady=null;
let runtimeCache={at:0,candidates:[],candidateMap:new Map(),stateMap:new Map(),suppressed:new Set()};
const RUNTIME_CACHE_MS=60000;

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
      status TEXT NOT NULL DEFAULT 'admitted_coverage',
      source_status TEXT,
      verified_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_catalog_runtime_candidates_status ON catalog_runtime_candidates(status,updated_at)`),
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
async function runtimeSnapshot(env,{force=false}={}){
  if(!force&&Date.now()-runtimeCache.at<RUNTIME_CACHE_MS)return runtimeCache;
  await ensureSchema(env);
  const [states,candidates]=await Promise.all([
    env.DB.prepare(`SELECT * FROM catalog_runtime_state`).all(),
    env.DB.prepare(`SELECT tool_slug,profile_json,status,source_status,verified_at FROM catalog_runtime_candidates WHERE status='admitted_coverage' ORDER BY verified_at DESC`).all()
  ]);
  const stateMap=new Map((states.results||[]).map(row=>[String(row.tool_slug),row])),parsed=[];
  for(const row of candidates.results||[]){try{const p=JSON.parse(row.profile_json);if(p)parsed.push(p)}catch{}}
  runtimeCache={at:Date.now(),candidates:parsed,candidateMap:new Map(parsed.map(x=>[String(x.slug||'').toLowerCase(),x])),stateMap,suppressed:new Set([...stateMap.entries()].filter(([,v])=>v.quality_status==='confirmed_broken').map(([k])=>k))};
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
  for(const tool of chosen){
    const slug=String(tool.slug).toLowerCase(),prior=smap.get(slug)||{},verifyUrl=verificationUrl(tool),verificationSourceChanged=Boolean(prior.source_url&&prior.source_url!==verifyUrl),result=await fetchOfficial(verifyUrl),staticVerified=String(tool.lastVerified||tool.sourceCheckedOn||'');
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
    else if(result.status!=='ok'&&result.status!=='broken'){warnings++;if(quality==='unverified')quality='source_warning'}
    await env.DB.prepare(`INSERT INTO catalog_runtime_state(tool_slug,source_url,source_status,http_status,final_url,fingerprint,pending_fingerprint,change_confirmations,content_changed,broken_consecutive,quality_status,static_last_verified,last_checked_at,last_change_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET source_url=excluded.source_url,source_status=excluded.source_status,http_status=excluded.http_status,final_url=excluded.final_url,fingerprint=COALESCE(excluded.fingerprint,catalog_runtime_state.fingerprint),pending_fingerprint=excluded.pending_fingerprint,change_confirmations=excluded.change_confirmations,content_changed=excluded.content_changed,broken_consecutive=excluded.broken_consecutive,quality_status=excluded.quality_status,static_last_verified=excluded.static_last_verified,last_checked_at=datetime('now'),last_change_at=excluded.last_change_at,updated_at=datetime('now')`)
      .bind(slug,verifyUrl,result.status,result.httpStatus,result.finalUrl,canonicalFingerprint,pendingFingerprint,confirmations,contentChanged,broken,quality,staticVerified,lastChange).run();
  }
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

const GAP_OFFICIAL_HINTS=Object.freeze({
  'character-ai':'https://character.ai/about',
  'google-ai-studio':'https://aistudio.google.com/',
  'kling-ai':'https://kling.ai/',
  'otter-ai':'https://otter.ai/transcription',
  'perplexity-ai':'https://www.perplexity.ai/'
});
const GAP_NAMES=Object.freeze({'character-ai':'Character.AI','google-ai-studio':'Google AI Studio','kling-ai':'Kling AI','otter-ai':'Otter.ai','perplexity-ai':'Perplexity'});
const GAP_BLOCKED_HOSTS=['alternativeto.net','futurepedia.io','g2.com','capterra.com','saashub.com','facebook.com','instagram.com','linkedin.com','x.com','twitter.com','youtube.com','reddit.com'];
const GAP_CAPABILITIES=[
  ['AI assistant',['ai assistant','assistant']],
  ['interactive characters',['characters','character ai']],
  ['conversations',['conversation','conversations','chat']],
  ['storytelling',['storytelling','stories']],
  ['creative expression',['creative expression','create']],
  ['research',['research']],
  ['citations',['citations','sources']],
  ['web search',['web search','open web','answer engine']],
  ['analysis',['analysis','analyze']],
  ['API',[' api ','api platform','gemini api','sdk']],
  ['image generation',['image generation','generate images','image generator']],
  ['video generation',['video generation','generate videos','video generator']],
  ['video editing',['video editing','video editor']],
  ['sound generation',['sound generation','audio generation']],
  ['text to speech',['text-to-speech','text to speech','tts']],
  ['transcription',['transcription','transcribe']],
  ['meeting notes',['meeting notes','notetaker','meeting notetaker']],
  ['summaries',['summaries','summary']],
  ['action items',['action items']],
  ['integrations',['integrations','zOom','google meet','microsoft teams']]
];
const GAP_CATEGORY_RULES={
  'ai-research':['citations','research','web search','answer engine','open web'],
  'ai-assistant':['ai assistant','characters','conversation','chat'],
  developer:['api platform','gemini api','sdk','developer'],
  content:['video generation','video editor','image generation','transcription','meeting notes','notetaker'],
  design:['image generation','visual design']
};
function gapHumanName(slug){return String(slug||'').split('-').filter(Boolean).map(x=>x==='ai'?'AI':x.charAt(0).toUpperCase()+x.slice(1)).join(' ')}
function gapHostBlocked(host){host=String(host||'').toLowerCase().replace(/^www\./,'');return GAP_BLOCKED_HOSTS.come(x=>host===x||host.endsWith('.'+x))}
function gapStrip(html){return stripHtml(String(html||'')).slice(0,50000)}
async function fetchGapPage(url){
  let u;try{u=new URL(url)}catch{return null}
  if(u.protocol!=='https:')return null;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),FETCH_TIMEOUT_MS);
  try{
    const r=await fetch(u.href,{redirect:'follow',headers:{'User-Agent':'ToolScout-Catalog-Gap/1.0 +https://trytoolscout.org/)','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5'},signal:ctl.signal});
    if(!r.ok)return null;
    const html=(await r.text()).slice(0,600000);
    const title=(html.match(/<title[^>]*>([\\S\S]
ÊOÝ]OÚJOËÌW_	ÉÊK\XÙJ×ÊËÙË	È	ÊK[J
NÂÛÛÝ\ØÜ\[Û[Y]J[	Ù\ØÜ\[ÛÊ_Y]J[	ÛÙÎ\ØÜ\[ÛÊNÂ]\Ý\\KY[]K\ØÜ\[Û^Ø\Ý\
[
_NÂXØ]ÚÜ]\[Y[[^ØÛX\[Y[Ý]
[Y\_BB[Ý[ÛØ\[ÔØÛÜJ\X[ÛYÊ^Â]NÝ^ÝO[]ÈT
\
_XØ]ÚÜ]\LLBYØ\ÜÝØÚÙY
KÜÝ[YJJ\]\LLÂÛÛÝÚÙ[ÏTÝ[ÊÛYß	ÉÊKÜ]
	ËIÊK[\O[ÝLÉOOIØ\	ÉOOIÝÛÛ	ÊNÂÛÛÝÜÝ]KÜÝ[YKÓÝÙ\Ø\ÙJ
K\XÙJ×ÝÝ×Ë	ÉÊK\XÙJÖ×K^NWKÙË	ÉÊNÂÛÛÝ]]K][YKÓÝÙ\Ø\ÙJ
K\XÙJÖ×K^NWKÙË	ÉÊNÂ]ØÛÜOLÂÜÛÛÝÚÙ[ÙÚÙ[Ê^ÚYÜÝ[ÛY\ÊÚÙ[J\ØÛÜJÏMNÙ[ÙHY][ÛY\ÊÚÙ[J\ØÛÜJÏL_BYÛÙXÚX[ÙXÚ]_\Ú]Ü[ÚK\Ý
Ý[ÊX[	ÉÊJJ\ØÛÜJÏLÎÂ]\ØÛÜNÂB\Þ[È[Ý[Û\ØÛÝ\Ø\ÙXÚX[ÛÝ\ÙJÛYË^[\\Ê^ÂYÐTÓÑPÒPSÒSÖÜÛY×J^ÂÛÛÝYÙOX]ØZ]]ÚØ\YÙJÐTÓÑPÒPSÒSÖÜÛY×JNÂYYÙIYØ\ÜÝØÚÙY
]ÈT
YÙK\
KÜÝ[YJJ\]\YÙNÂBÛÛÝØ[Y]\Ï[]ÈX\

NÂÜÛÛÝ^[\HÙ
\^K\Ð\^J^[\\ÊOÙ^[\\Î×JKÛXÙJÊJ^ÂÛÛÝYÙOX]ØZ]]ÚØ\YÙJ^[\JNÚY\YÙJXÛÛ[YNÂÛÛÝOKÏW×JYVÈ×J×È×JÊVÈV×J×××JÊOØOÙÚNÛ]NÂÚ[J
O\K^XÊYÙK[
JJ^Â]NÝ^ÝO[]ÈT
Ý[ÊVÌW_	ÉÊKYÙK\
_XØ]ÚØÛÛ[Y_BYKÝØÛÛOOIÚÎßØ\ÜÝØÚÙY
KÜÝ[YJJXÛÛ[YNÂÛÛÝX[YØ\Ý\
VÌJKÛXÙJL
KØÛÜOYØ\[ÔØÛÜJKÔÝ[Ê
KX[ÛYÊNÂYØÛÜO
XÛÛ[YNÂÛÛÝÙ^O]KÜYÚ[ÝÏXØ[Y]\ËÙ]
Ù^J_Ý\KÔÝ[Ê
KØÛÜNNÜÝËØÛÜOSX]X^
ÝËØÛÜKØÛÜJNØØ[Y]\ËÙ]
Ù^KÝÊNÂBBÜÛÛÝÝÈÙËØ[Y]\Ë[Y\Ê
WKÛÜ

KOOØÛÜKXKØÛÜJKÛXÙJJJ^ÂÛÛÝYÙOX]ØZ]]ÚØ\YÙJÝË\
NÚYYÙJ\]\YÙNÂB]\[ÂB[Ý[ÛØ\Ø\X[]Y\Ê^
^ÂÛÛÝÛÜ\ÏIÈ	ÊÔÝ[Ê^	ÉÊKÓÝÙ\Ø\ÙJ
K\XÙJ×ÊËÙË	È	ÊJÉÈ	ÎÂ]\ÐTÐÐTPSUQTË[\
Ë\\×JOO\\ËÛÛYJ\OOÛÜ\Ë[ÛY\Ê\JJJKX\

ÛX[JOOX[
KÛXÙJL
NÂB[Ý[ÛØ\Ø]YÛÜJ^
^ÂÛÛÝÛÜ\ÏTÝ[Ê^	ÉÊKÓÝÙ\Ø\ÙJ
NÂ]\Ý^ØØ]YÛÜNØ\Ú[\ÜÉËØÛÜNNÂÜÛÛÝØØ]YÛÜK\\×HÙØXÝ[Y\ÊÐTÐÐUQÓÔWÔSTÊJ^ØÛÛÝØÛÜO]\\Ë[\OÛÜ\Ë[ÛY\Ê
JK[ÝÚYØÛÜO\ÝØÛÜJX\Ý^ØØ]YÛÜKØÛÜ__B]\\ÝÂB^Ü\Þ[È[Ý[Û^XÝ]PØ][ÙÑÜÝÝ\ÚÊ[\ÚÏ^ßJ^Â]ØZ][Ý\TØÚ[XJ[NÂÛÛÝÛYÏTÝ[Ê\ÚÏËÝXXÝÚÙ^_	ÉÊKÓÝÙ\Ø\ÙJ
K\XÙJÖ×K^NKWKÙË	ÉÊNÂY\ÚÏËÝXXÝÝ\HOOIØØ][Ù×ÙØ\	ß\ÛYÊ\]\ÛÚÎ[ÙK\YYY[ÙKX\ÛÛÝ[Ý\ÜYØØ][Ù×Ý\ÚÉßNÂÛÛÝ^\Ý[ÏX]ØZ][\\JÑSPÕÙ[WÚÛÛ\YYYØ]ÓHØ][Ù×Ü[[YWØØ[Y]\ÈÒTHÛÛÜÛYÏOÈSÝ]\ÏIØYZ]YØÛÝ\YÙIØ
K[
ÛYÊK\Ý

NÂY^\Ý[Ê^Â]ØZ][\\JTUHØ][Ù×ÛX\Ù]ÙØ\ÈÑUÝ]\ÏIØYZ]YØÛÝ\YÙIË\]YØ]Y]][YJ	ÛÝÉÊHÒTHÛÛÜÛYÏOØ
K[
ÛYÊK[
NÂ]Ù[O[[Ý^ÜÙ[ORÓÓ\ÙJ^\Ý[ËÙ[WÚÛÛ_XØ]ÚßB]\ÛÚÎYK\YYYYKYZ]Y[ÙK[XYWØYZ]YYKÛYËÙ[_NÂBÛÛÝØ\X]ØZ][\\JÑSPÕÛÛÜÛYËÚYÛ[ËÛÝ\Ù\×ÚÛÛ^[\\×ÚÛÛÝ]\ÈÓHØ][Ù×ÛX\Ù]ÙØ\ÈÒTHÛÛÜÛYÏOØ
K[
ÛYÊK\Ý

NÂYYØ\
\]\ÛÚÎ[ÙK\YYY[ÙKX\ÛÛØØ][Ù×ÙØ\ÛÝÙÝ[	ËÛYßNÂY[X\Ø\ÚYÛ[ß
O\]\ÛÚÎYK\YYY[ÙKX\ÛÛÚ[ÝYXÚY[Ú[\[[ÛX\Ù]ÜÚYÛ[ÉËÛYßNÂ]^[\\ÏV×NÝ^Ù^[\\ÏRÓÓ\ÙJØ\^[\\×ÚÛÛ	Ö×IÊ_XØ]ÚßBÛÛÝÙXÚX[X]ØZ]\ØÛÝ\Ø\ÙXÚX[ÛÝ\ÙJÛYË^[\\ÊNÂY[ÙXÚX[
\]\ÛÚÎYK\YYY[ÙKX\ÛÛÛÙXÚX[ÜÛÝ\ÙWÛÝÜ\ÛÛY	ËÛYßNÂÛÛÝÛÜ\ÏZÛÙXÚX[]_	ÉßH	ÛÙXÚX[\ØÜ\[Û	ÉßH	ÛÙXÚX[^	ÉßXÂÛÛÝX]\\ÏYØ\Ø\X[]Y\ÊÛÜ\ÊKØ]YØ\Ø]YÛÜJÛÜ\ÊNÂYX]\\Ë[Ý\]\ÛÚÎYK\YYY[ÙKX\ÛÛÙ\ÝÜ\WØØ\X[]Y\×ÝÛ×Ý[ËÛYËÛÝ\ÙU\ÙXÚX[\Ø\X[]Y\ÎX]\\Ë[ÝNÂÛÛÝ[YOQÐTÓSQTÖÜÛY×_Ø\[X[[YJÛYÊNÂÛÛÝ\ØÜ\[ÛTÝ[ÊÙXÚX[\ØÜ\[Û	ÉÊK[J
K[ÝMÔÝ[ÊÙXÚX[\ØÜ\[ÛK[J
N	Û[Y_HÝY\È	ÙX]\\ËÛXÙJ
KÚ[	Ë	Ê_KÛÛØÛÝ]\YYY\ÙHØ\X[]Y\È\XÝHÛHHÙXÝ	ÜÈÙXÚX[\Ý\\HÙXÚ]HYÜHY[È\ÈÛÝ\YÙHÙ[KÂ]ÛÝ\Ù\ÏV×NÝ^ÜÛÝ\Ù\ÏRÓÓ\ÙJØ\ÛÝ\Ù\×ÚÛÛ	Ö×IÊ_XØ]ÚßBÛÛÝÙ[O^ÜÛYË[YKØ]YÛÜNØ]Ø]YÛÜK\ØÜ\[ÛXÚ[ÎÔÙYHHÙXÚX[[ÜÚ]HÜÝ\[XÚ[ËËYT[[X]\\Ë\ÝÜ×KÛÝ\ÙU\ÙXÚX[\\Ý\YYY]È]J
KÒTÓÔÝ[Ê
KÛXÙJL
KØÛÜ\ÎßKØ][ÙÕY\ØÛÝ\YÙIË[Ú[Ñ[YÚXN[ÙKÛÛ\\\ÛÛ[YÚXN[ÙK\XÝÙXÚX[ÝNYKÝ[[ÙNÛ[ÙNÝ\YYYØÛÛ\]]]WÙØ\Ü[[YIËYZ]Y]]È]J
KÒTÓÔÝ[Ê
KX\Ù]ÚYÛ[ÎØÛÝ[[X\Ø\ÚYÛ[ß
KÛÝ\Ù\ßKY[X]S]][YKÛÛ\]]ÜÛÛ[\ÙYÜY]ÜX[XÝÎ[ÙK[Ú[ÓÝNÐØ][ÙÈ[Û\Ú[ÛÙ\ÈÝ[\HXÛÛ[Y[][Û[Ú[È[ÛÛ\\\ÛÛ[YÚX[]H\]Z\HÙ\\]HY]ÜX[]Y[ÙKß_NÂ]ØZ][\\JSÑTSÈØ][Ù×Ü[[YWØØ[Y]\ÊÛÛÜÛYËÙ[WÚÛÛÝ]\ËÛÝ\ÙWÜÝ]\Ë\YYYØ]\]YØ]
HSQTÊËË	ØYZ]YØÛÝ\YÙIË	ÛÚÉË]][YJ	ÛÝÉÊK]][YJ	ÛÝÉÊJHÓÓÓPÕ
ÛÛÜÛYÊHÈTUHÑUÙ[WÚÛÛY^ÛYYÙ[WÚÛÛÝ]\ÏIØYZ]YØÛÝ\YÙIËÛÝ\ÙWÜÝ]\ÏIÛÚÉË\YYYØ]Y]][YJ	ÛÝÉÊK\]YØ]Y]][YJ	ÛÝÉÊX
K[
ÛYËÓÓÝ[ÚYJÙ[JJK[
NÂ]ØZ][\\JSÑTSÈØ][Ù×Ü[[YWÜÝ]JÛÛÜÛYËÛÝ\ÙWÝ\ÛÝ\ÙWÜÝ]\ËÜÝ]\Ë[[Ý\]X[]WÜÝ]\ËÝ]X×Û\ÝÝ\YYY\ÝØÚXÚÙYØ]\]YØ]
HSQTÊËË	ÛÚÉËË	ÚX[IË]J	ÛÝÉÊK]][YJ	ÛÝÉÊK]][YJ	ÛÝÉÊJHÓÓÓPÕ
ÛÛÜÛYÊHÈTUHÑUÛÝ\ÙWÝ\Y^ÛYYÛÝ\ÙWÝ\ÛÝ\ÙWÜÝ]\ÏIÛÚÉËÜÝ]\ÏL[[Ý\Y^ÛYY[[Ý\]X[]WÜÝ]\ÏIÚX[IËÝ]X×Û\ÝÝ\YYYY]J	ÛÝÉÊK\ÝØÚXÚÙYØ]Y]][YJ	ÛÝÉÊK\]YØ]Y]][YJ	ÛÝÉÊX
K[
ÛYËÙXÚX[\ÙXÚX[\
K[
KØ]Ú


OOßJNÂ]ØZ][\\JTUHØ][Ù×ÛX\Ù]ÙØ\ÈÑUÝ]\ÏIØYZ]YØÛÝ\YÙIË\]YØ]Y]][YJ	ÛÝÉÊHÒTHÛÛÜÛYÏOØ
K[
ÛYÊK[
NÂ]ØZ]ÙÑ][
[ÛYË	ØØ][Ù×ÙÜÝÝØYZ]Y	Ë	ØÛÛ\]Y	Ë	Û[Y_HYY]]ÛX]XØ[HÛHH\YYYX\Ù]Y[X[ÛÝ\YÙHØ\Y\\Ý\\HÛÝ\ÙH[Y][ÛÜÛYË[YKÛÝ\ÙWÝ\ÙXÚX[\ÛÛØÛÝ]Ý\ÎËÝ]ÛÛØÛÝ]ÜËÝÛÛËÉÜÛYßXØ]YÛÜNØ]Ø]YÛÜKX\Ù]ÜÚYÛ[Î[X\Ø\ÚYÛ[ß
K\YYYØØ\X[]Y\ÎX]\\ßJNÂ[[YPØXÚK]LÂ]\ÛÚÎYK\YYYYKYZ]YYKÛYËÙ[KÛÛØÛÝ]\ÎËÝ]ÛÛØÛÝ]ÜËÝÛÛËÉÜÛYßXNÂB
async function syncMarketGaps(env){
  const report=await assetJson(env,'/reports/competitive-gap-signals.json',{gaps:[]});
  let synced=0;
  for(const gap of Array.isArray(report?.gaps)?report.gaps:[]){
    const slug=String(gap?.slug||'').toLowerCase().replace(/[^a-z0-9-]/g,'');if(!slug)continue;
    await env.DB.prepare(`INSERT INTO catalog_market_gaps(tool_slug,signals,sources_json,examples_json,status,updated_at) VALUES(?,?,?,?,'research_required',datetime('now'))
      ON CONFLICT(tool_slug) DO UPDATE SET signals=excluded.signals,sources_json=excluded.sources_json,examples_json=excluded.examples_json,status=CASE WHEN catalog_market_gaps.status IN ('admitted_coverage','covered') THEN catalog_market_gaps.status ELSE 'research_required' END,updated_at=datetime('now')`)
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
      const profile={...raw,sourceUrl:source.finalUrl||raw.sourceUrl,lastVerified:new Date().toISOString().slice(0,10),catalogTier:'coverage',rankingEligible:false,comparisonEligible:false,provenance:{...(raw.provenance||{}),mode:'runtime_trusted_coverage',admittedAt:new Date().toISOString(),affiliateNeutral:true,rankingNote:'Catalog inclusion does not imply recommendation. Ranking and comparison eligibility require separate editorial evidence.'}};
      await env.DB.prepare(`INSERT INTO catalog_runtime_candidates(tool_slug,profile_json,status,source_status,verified_at,updated_at) VALUES(?,?,'admitted_coverage','ok',datetime('now'),datetime('now'))
        ON CONFLICT(tool_slug) DO UPDATE SET profile_json=excluded.profile_json,status='admitted_coverage',source_status='ok',verified_at=datetime('now'),updated_at=datetime('now')`)
        .bind(slug,JSON.stringify(profile)).run();
      await logEvent(env,slug,'catalog_candidate_admitted','completed','Trusted candidate admitted to the runtime coverage catalog after official-source and deterministic quality gates. Ranking remains disabled.',{source_url:profile.sourceUrl,category:profile.category});
      existing.add(slug);admitted++;
    }
    if(admitted>=MAX_ADMIT_PER_DAY||considered>=MAX_CANDIDATE_CHECKS_PER_CYCLE)break;
  }
  const market_gaps=await syncMarketGaps(env);
  runtimeCache.at=0;
  return{ok:true,considered,admitted,held,market_gaps_synced:market_gaps,max_admissions:MAX_ADMIT_PER_DAY,candidate_check_limit:MAX_CANDIDATE_CHECKS_PER_CYCLE,rule:'Affiliate economics cannot increase catalog admission or ranking eligibility.'};
}
function candidatePage(tool){
  const url=`https://trytoolscout.org/tools/${encodeURIComponent(tool.slug)}`,features=(tool.features||[]).map(x=>`<li>${esc(x)}</li>`).join(''),best=(tool.bestFor||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><link rel="canonical" href="${url}"><title>${esc(tool.name)} Tool Profile | ToolScout</title><meta name="description" content="${esc(tool.description)}"></head><body style="margin:0;background:#f6f7f9;color:#101828;font-family:Inter,system-ui,sans-serif"><main style="max-width:900px;margin:auto;padding:36px 22px 80px"><a href="/" style="color:#101828;font-weight:850;text-decoration:none;font-size:22px">ToolScout</a><p style="margin-top:42px;color:#667085;font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800">Verified coverage profile</p><h1 style="font-size:52px;letter-spacing:-.05em;margin:10px 0 18px">${esc(tool.name)}</h1><p style="font-size:18px;line-height:1.65;color:#475467">${esc(tool.description)}</p><section style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:28px"><div style="background:white;border:1px solid #e4e7ec;border-radius:18px;padding:22px"><h2>Key capabilities</h2><ul style="line-height:1.7;color:#475467">${features}</ul><h2>Best for</h2><ul style="line-height:1.7;color:#475467">${best}</ul></div><div style="background:white;border:1px solid #e4e7ec;border-radius:18px;padding:22px"><h2>Pricing at a glance</h2><p style="line-height:1.65;color:#475467">${esc(tool.pricing||'Check the vendor for current pricing.')}</p><p><strong>Category:</strong> ${esc(tool.category)}</p><a href="${esc(tool.directOfficialCta?tool.sourceUrl:'/go/'+encodeURIComponent(tool.slug))}" rel="${tool.directOfficialCta?'noopener nofollow':'nofollow sponsored'}" style="display:inline-block;background:#101828;color:white;padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:750">Explore ${esc(tool.name)}</a></div></section><section style="margin-top:30px;background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px"><h2>Verification status</h2><p style="line-height:1.6;color:#475467">ToolScout admitted this product to catalog coverage after validating a trusted product profile against an official first-party source. Catalog inclusion does not imply ranking, endorsement or comparison eligibility.</p><p style="font-size:13px;color:#667085">Official source: <a href="${esc(tool.sourceUrl)}" rel="nofollow">${esc(tool.sourceUrl)}</a> · Last verified ${esc(tool.lastVerified||'recently')}.</p></section></main></body></html>`;
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
async function status(env){
  await ensureSchema(env);
  const [states,candidates,gaps,events,newsSources,newsCandidates]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN quality_status='healthy' THEN 1 ELSE 0 END) healthy,SUM(CASE WHEN quality_status='change_detected' THEN 1 ELSE 0 END) changed,SUM(CASE WHEN quality_status='confirmed_broken' THEN 1 ELSE 0 END) suppressed,SUM(CASE WHEN source_status NOT IN ('ok','broken') THEN 1 ELSE 0 END) warnings,MAX(last_checked_at) last_checked_at FROM catalog_runtime_state`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(verified_at) last_admitted_at FROM catalog_runtime_candidates WHERE status='admitted_coverage'`).first(),
    env.DB.prepare(`SELECT COUNT(*) total FROM catalog_market_gaps WHERE status='research_required'`).first(),
    env.DB.prepare(`SELECT COUNT(*) n FROM catalog_runtime_events WHERE created_at>=datetime('now','-7 days')`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(last_checked_at) last_checked_at FROM software_news_sources WHERE status='active'`).first(),
    env.DB.prepare(`SELECT COUNT(*) total,MAX(updated_at) last_candidate_at FROM software_news_candidates WHERE status IN ('candidate','verified','published')`).first()
  ]);
  return{ok:true,version:'1.1',state:{total:Number(states?.total||0),healthy:Number(states?.healthy||0),changed:Number(states?.changed||0),suppressed:Number(states?.suppressed||0),warnings:Number(states?.warnings||0),last_checked_at:states?.last_checked_at||null},runtime_candidates:Number(candidates?.total||0),last_admitted_at:candidates?.last_admitted_at||null,market_gaps:Number(gaps?.total||0),events_7d:Number(events?.n||0),whats_new:{official_sources:Number(newsSources?.total||0),last_source_check:newsSources?.last_checked_at||null,candidates:Number(newsCandidates?.total||0),last_candidate_at:newsCandidates?.last_candidate_at||null},rule:'Official-source verification is required. Ambiguous factual changes are flagged, not silently rewritten. Affiliate economics never affect catalog admission or ranking.'};
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/catalog-autonomy/status'){if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});return Response.json(await status(env),{headers:JSON_H})}
    if(request.method==='POST'&&u.pathname==='/api/catalog-autonomy/run'){if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});const verify=await runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:'manual_api'},()=>verifyBatch(env));const admit=await runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:'manual_api'},()=>admitTrustedCandidates(env));return Response.json({ok:true,verify,admit},{headers:JSON_H})}
    if(request.method==='GET'&&u.pathname==='/data/tools.json')return Response.json(await mergedTools(env),{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=60'}});
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
