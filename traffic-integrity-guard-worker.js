import base from './owner-exclusion-worker.js';
import { classifySessionRequest, SESSION_CLASSIFICATIONS, SESSION_UPSERT_SQL } from './session-classification.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_VISIBLE_MS=1800;
const FP_SESSION_LIMIT_10M=4;
const FP_PATH_LIMIT_10M=6;
const GLOBAL_SESSION_LIMIT_1M=8;
const GLOBAL_PATH_LIMIT_1M=5;
let guardSchemaReady=null;

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
function jsonHeaders(){return {'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}}
async function digestHex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function ensureGuardSchema(env){
  if(guardSchemaReady)return guardSchemaReady;
  guardSchemaReady=(async()=>{
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS traffic_guard_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      ua_hash TEXT NOT NULL,
      session_id TEXT NOT NULL,
      path TEXT,
      country TEXT,
      asn INTEGER,
      suspicious_direct INTEGER NOT NULL DEFAULT 0,
      decision TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_guard_created ON traffic_guard_events(created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_guard_fingerprint_created ON traffic_guard_events(fingerprint,created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_guard_decision_created ON traffic_guard_events(decision,created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_guard_decision_created_session ON traffic_guard_events(decision,created_at,session_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_guard_session_decision_created ON traffic_guard_events(session_id,decision,created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_guard_suspicious_created ON traffic_guard_events(suspicious_direct,created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS traffic_quarantine_sessions (
      session_id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      original_classification TEXT,
      first_confirmed_at TEXT,
      quarantined_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  ]);
  })().catch(error=>{guardSchemaReady=null;throw error});
  return guardSchemaReady;
}
function safePath(value){
  const text=String(value||'/').slice(0,200);
  return text.startsWith('/')?text:'/';
}
function proofIsValid(body){
  const proof=body?.browser_proof;
  return Boolean(proof&&Number(proof.version)===1&&Number(proof.visible_ms)>=MIN_VISIBLE_MS&&proof.webdriver!==true&&Number(proof.screen_w)>0&&Number(proof.screen_h)>0);
}
async function guardFingerprint(request){
  const ip=request.headers.get('CF-Connecting-IP')||'';
  const ua=request.headers.get('User-Agent')||'';
  const lang=request.headers.get('Accept-Language')||'';
  const ch=request.headers.get('Sec-CH-UA')||'';
  return {
    fingerprint:await digestHex(`ip:${ip}\nua:${ua}\nlang:${lang}\nch:${ch}`),
    uaHash:await digestHex(ua),
    country:String(request.cf?.country||'').slice(0,8)||null,
    asn:Number.isFinite(Number(request.cf?.asn))?Number(request.cf.asn):null
  };
}
async function markSynthetic(env,sessionId,source='traffic-guard'){
  if(!UUID.test(String(sessionId||'')))return;
  await env.DB.prepare(SESSION_UPSERT_SQL).bind(sessionId,source,0,SESSION_CLASSIFICATIONS.SYNTHETIC).run();
}
async function handlePageConfirmation(request,env,ctx,body){
  const headers=jsonHeaders();
  const classification=classifySessionRequest(request);
  if(classification!==SESSION_CLASSIFICATIONS.LIKELY_HUMAN)return base.fetch(request,env,ctx);
  const sessionId=String(body?.session_id||'');
  if(!UUID.test(sessionId))return base.fetch(request,env,ctx);
  if(!proofIsValid(body)){
    return Response.json({ok:false,recorded:false,reason:'browser_proof_pending',minimumVisibleMs:MIN_VISIBLE_MS},{status:409,headers});
  }
  await ensureGuardSchema(env);
  const fp=await guardFingerprint(request);
  const path=safePath(body?.path);
  const source=String(body?.source||'direct').toLowerCase();
  const referrer=String(body?.referrer_host||'').trim();
  const suspiciousDirect=(!referrer&&(source==='direct'||source==='browser-confirm'||!source))?1:0;
  const insert=await env.DB.prepare(`INSERT INTO traffic_guard_events
    (fingerprint,ua_hash,session_id,path,country,asn,suspicious_direct,decision,created_at)
    VALUES (?,?,?,?,?,?,?,'pending',datetime('now'))`).bind(fp.fingerprint,fp.uaHash,sessionId,path,fp.country,fp.asn,suspiciousDirect).run();
  const guardId=Number(insert?.meta?.last_row_id||0);
  const [sameFp,globalBurst]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT session_id) sessions,COUNT(DISTINCT path) paths
      FROM traffic_guard_events
      WHERE fingerprint=? AND created_at>=datetime('now','-10 minutes')`).bind(fp.fingerprint).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT session_id) sessions,COUNT(DISTINCT path) paths,COUNT(DISTINCT fingerprint) fingerprints
      FROM traffic_guard_events
      WHERE suspicious_direct=1 AND created_at>=datetime('now','-60 seconds')`).first()
  ]);
  const fpSessions=Number(sameFp?.sessions||0),fpPaths=Number(sameFp?.paths||0);
  const globalSessions=Number(globalBurst?.sessions||0),globalPaths=Number(globalBurst?.paths||0);
  let reason=null;
  if(body?.browser_proof?.webdriver===true)reason='webdriver';
  else if(fpSessions>=FP_SESSION_LIMIT_10M)reason='fingerprint_session_rate';
  else if(fpPaths>=FP_PATH_LIMIT_10M)reason='fingerprint_path_scan';
  else if(suspiciousDirect&&globalSessions>=GLOBAL_SESSION_LIMIT_1M&&globalPaths>=GLOBAL_PATH_LIMIT_1M)reason='global_direct_multi_page_burst';
  if(reason){
    await Promise.all([
      markSynthetic(env,sessionId),
      guardId?env.DB.prepare(`UPDATE traffic_guard_events SET decision='blocked',reason=? WHERE id=?`).bind(reason,guardId).run():Promise.resolve()
    ]);
    return Response.json({ok:true,recorded:false,classification:SESSION_CLASSIFICATIONS.SYNTHETIC,guard:{decision:'blocked',reason}},{status:202,headers});
  }
  if(guardId)await env.DB.prepare(`UPDATE traffic_guard_events SET decision='allowed',reason='browser_proof_and_rate_ok' WHERE id=?`).bind(guardId).run();
  return base.fetch(request,env,ctx);
}
async function handleEvents(request,env,ctx){
  if(request.method!=='POST')return base.fetch(request,env,ctx);
  const type=(request.headers.get('Content-Type')||'').toLowerCase();
  if(!type.startsWith('application/json'))return base.fetch(request,env,ctx);
  let body;
  try{body=JSON.parse(await request.clone().text())}catch{return base.fetch(request,env,ctx)}
  if(body?.event_type!=='page_confirmed')return base.fetch(request,env,ctx);
  return handlePageConfirmation(request,env,ctx,body);
}
function guardClientScript(){
  return `<script data-toolscout-browser-guard="1">(function(){try{if(window.__toolscoutBrowserGuard)return;window.__toolscoutBrowserGuard=true;var uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,visibleStart=document.visibilityState==='visible'?performance.now():null,interaction=0;['pointerdown','touchstart','keydown','wheel'].forEach(function(k){addEventListener(k,function(){interaction++},{passive:true,once:true})});document.addEventListener('visibilitychange',function(){visibleStart=document.visibilityState==='visible'?performance.now():null});function clean(v,n){return String(v||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,n||100)}function sourceInfo(){var source='direct',refHost=null;try{var q=new URLSearchParams(location.search),utm=['utm_source','utm_medium','utm_campaign'].map(function(k){var x=clean(q.get(k));return x?k+'='+x:''}).filter(Boolean).join('&');if(utm)source=clean(utm);else if(q.get('source'))source=clean(q.get('source'));else if(document.referrer){var u=new URL(document.referrer),h=u.hostname.replace(/^www\\./,'');if(h&&h!==location.hostname){refHost=h.slice(0,120);source=clean('ref:'+h)}}}catch(e){}return {source:source,referrer_host:refHost}}function session(){try{var s=JSON.parse(localStorage.getItem('toolscout_session_v2')||'null');return s&&uuid.test(String(s.id||''))?s.id:null}catch(e){return null}}function send(){if(document.visibilityState!=='visible'||visibleStart==null){setTimeout(send,350);return}var ms=Math.round(performance.now()-visibleStart);if(ms<2100){setTimeout(send,Math.max(150,2100-ms));return}var sid=session();if(!sid){setTimeout(send,180);return}try{if(localStorage.getItem('toolscout_page_confirmed_v1')===sid)return}catch(e){}var info=sourceInfo(),eid='evt_'+crypto.randomUUID(),payload={event_id:eid,session_id:sid,event_type:'page_confirmed',path:location.pathname.slice(0,200)||'/',source:info.source,referrer_host:info.referrer_host,browser_proof:{version:1,visible_ms:ms,webdriver:navigator.webdriver===true,interaction_count:interaction,screen_w:Number(screen&&screen.width||0),screen_h:Number(screen&&screen.height||0)}};fetch('/api/events',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json().catch(function(){return {}}).then(function(d){if(r.ok&&d&&d.ok&&d.recorded!==false){try{localStorage.setItem('toolscout_page_confirmed_v1',sid)}catch(e){}}})}).catch(function(){})}setTimeout(send,2200)}catch(e){}})();</script>`;
}
async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-browser-guard="1"'))html=html.replace(/<\/body>/i,guardClientScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
async function trafficForensics48h(env){
  await ensureGuardSchema(env);
  const [overview,countryAsn,fingerprintClusters,uaClusters,hourly,paths,sources,visitorClusters,outbound]=await Promise.all([
    env.DB.prepare(`WITH allowed AS (
      SELECT * FROM traffic_guard_events WHERE decision='allowed' AND created_at>=datetime('now','-48 hours')
    )
    SELECT COUNT(DISTINCT session_id) allowed_sessions,
      COUNT(DISTINCT country) countries,
      COUNT(DISTINCT asn) asns,
      COUNT(DISTINCT fingerprint) fingerprints,
      COUNT(DISTINCT ua_hash) ua_hashes,
      SUM(CASE WHEN suspicious_direct=1 THEN 1 ELSE 0 END) suspicious_direct_events,
      COUNT(DISTINCT path) paths,
      MIN(created_at) first_at,
      MAX(created_at) last_at
    FROM allowed`).first(),
    env.DB.prepare(`SELECT COALESCE(country,'??') country,COALESCE(asn,0) asn,
      COUNT(DISTINCT session_id) sessions,
      COUNT(DISTINCT fingerprint) fingerprints,
      COUNT(DISTINCT ua_hash) ua_hashes,
      COUNT(DISTINCT path) paths,
      SUM(CASE WHEN suspicious_direct=1 THEN 1 ELSE 0 END) suspicious_direct_events
    FROM traffic_guard_events
    WHERE decision='allowed' AND created_at>=datetime('now','-48 hours')
    GROUP BY country,asn
    ORDER BY sessions DESC
    LIMIT 25`).all(),
    env.DB.prepare(`SELECT COUNT(DISTINCT session_id) sessions,
      COUNT(DISTINCT path) paths,
      COUNT(DISTINCT country) countries,
      COUNT(DISTINCT asn) asns,
      SUM(CASE WHEN suspicious_direct=1 THEN 1 ELSE 0 END) suspicious_direct_events,
      MIN(created_at) first_at,
      MAX(created_at) last_at
    FROM traffic_guard_events
    WHERE decision='allowed' AND created_at>=datetime('now','-48 hours')
    GROUP BY fingerprint
    ORDER BY sessions DESC
    LIMIT 25`).all(),
    env.DB.prepare(`SELECT COUNT(DISTINCT session_id) sessions,
      COUNT(DISTINCT fingerprint) fingerprints,
      COUNT(DISTINCT path) paths,
      COUNT(DISTINCT country) countries,
      COUNT(DISTINCT asn) asns
    FROM traffic_guard_events
    WHERE decision='allowed' AND created_at>=datetime('now','-48 hours')
    GROUP BY ua_hash
    ORDER BY sessions DESC
    LIMIT 25`).all(),
    env.DB.prepare(`SELECT strftime('%Y-%m-%d %H:00:00',created_at) hour_utc,
      COUNT(DISTINCT session_id) sessions,
      COUNT(DISTINCT fingerprint) fingerprints,
      COUNT(DISTINCT asn) asns
    FROM traffic_guard_events
    WHERE decision='allowed' AND created_at>=datetime('now','-48 hours')
    GROUP BY hour_utc
    ORDER BY hour_utc ASC`).all(),
    env.DB.prepare(`SELECT COALESCE(path,'/') path,COUNT(DISTINCT session_id) sessions,
      COUNT(DISTINCT fingerprint) fingerprints,
      COUNT(DISTINCT asn) asns
    FROM traffic_guard_events
    WHERE decision='allowed' AND created_at>=datetime('now','-48 hours')
    GROUP BY path
    ORDER BY sessions DESC
    LIMIT 30`).all(),
    env.DB.prepare(`SELECT COALESCE(v.source,'direct') source,COALESCE(v.referrer_host,'') referrer_host,
      COUNT(DISTINCT v.session_id) sessions,
      COUNT(DISTINCT v.visitor_id) visitors
    FROM confirmed_visitor_events v
    WHERE v.created_at>=datetime('now','-48 hours')
    GROUP BY source,referrer_host
    ORDER BY sessions DESC
    LIMIT 30`).all().catch(()=>({results:[]})),
    env.DB.prepare(`SELECT COUNT(DISTINCT session_id) sessions
    FROM confirmed_visitor_events
    WHERE created_at>=datetime('now','-48 hours')
    GROUP BY visitor_id
    ORDER BY sessions DESC
    LIMIT 25`).all().catch(()=>({results:[]})),
    env.DB.prepare(`SELECT COUNT(*) events,COUNT(DISTINCT session_id) sessions,
      SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized
    FROM verified_outbound_events
    WHERE created_at>=datetime('now','-48 hours')`).first().catch(()=>null)
  ]);
  const blocked=await env.DB.prepare(`SELECT reason,COUNT(DISTINCT session_id) sessions
    FROM traffic_guard_events
    WHERE decision='blocked' AND created_at>=datetime('now','-48 hours')
    GROUP BY reason ORDER BY sessions DESC`).all();
  const topCluster=(fingerprintClusters.results||[])[0]||null;
  const allowed=Number(overview?.allowed_sessions||0),topFp=Number(topCluster?.sessions||0);
  return {
    ok:true,
    window_hours:48,
    generated_at:new Date().toISOString(),
    privacy:'Aggregate diagnostics only. No raw IPs, User-Agents, fingerprints, visitor IDs or session IDs are returned.',
    overview:{
      allowed_sessions:allowed,
      countries:Number(overview?.countries||0),
      asns:Number(overview?.asns||0),
      fingerprints:Number(overview?.fingerprints||0),
      ua_hashes:Number(overview?.ua_hashes||0),
      paths:Number(overview?.paths||0),
      suspicious_direct_events:Number(overview?.suspicious_direct_events||0),
      first_at:overview?.first_at||null,
      last_at:overview?.last_at||null,
      top_fingerprint_share_pct:allowed?Number((topFp/allowed*100).toFixed(1)):0
    },
    country_asn:countryAsn.results||[],
    fingerprint_cluster_sizes:fingerprintClusters.results||[],
    ua_cluster_sizes:uaClusters.results||[],
    hourly:hourly.results||[],
    paths:paths.results||[],
    sources:sources.results||[],
    visitor_session_cluster_sizes:visitorClusters.results||[],
    blocked:blocked.results||[],
    verified_outbound_48h:outbound?{events:Number(outbound.events||0),sessions:Number(outbound.sessions||0),monetized:Number(outbound.monetized||0)}:{events:0,sessions:0,monetized:0},
    interpretation_hints:{
      high_risk_cluster:'A small number of ASNs/fingerprints dominating many sessions is consistent with automation or proxy concentration.',
      distributed_human_pattern:'Many ASNs and fingerprints, varied pages and referrers, and low per-fingerprint session counts are more consistent with human traffic.',
      outbound_note:'Zero verified outbound with many accepted sessions does not prove automation, but it materially weakens the traction signal.'
    }
  };
}

async function augmentHealth(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  await ensureGuardSchema(env);
  const [blocked,quarantined]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) count,MAX(created_at) last_blocked_at FROM traffic_guard_events WHERE decision='blocked' AND created_at>=datetime('now','-24 hours')`).first(),
    env.DB.prepare(`SELECT COUNT(*) count FROM traffic_quarantine_sessions`).first()
  ]);
  data.browserGuard={status:'active',minimumVisibleMs:MIN_VISIBLE_MS,blockedAutomation24h:Number(blocked?.count||0),lastBlockedAt:blocked?.last_blocked_at||null,historicalQuarantinedSessions:Number(quarantined?.count||0),rawIpStored:false,rawUserAgentStored:false};
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','no-store');headers.delete('Content-Length');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/events')return handleEvents(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/traffic-forensics-48h')return Response.json(await trafficForensics48h(env),{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}});
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/traffic-integrity-health')response=await augmentHealth(response,env);
    if(request.method==='GET'&&isHtml(response)&&!ANALYTICS_PATHS.has(url.pathname))response=await decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){
    if(typeof base.scheduled==='function')await base.scheduled(event,env,ctx);
    await ensureGuardSchema(env);
    await env.DB.prepare(`DELETE FROM traffic_guard_events WHERE created_at<datetime('now','-7 days')`).run();
  }
};
