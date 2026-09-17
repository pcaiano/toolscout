import base from './traffic-integrity-live-worker.js';
import { classifySessionRequest, SESSION_CLASSIFICATIONS } from './session-classification.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_ZONE='Europe/Lisbon';
let schemaReady=null;

function parseSession(request){
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(/(?:^|;\s*)toolscout_session=([^;]+)/);
  if(!match)return null;
  try{const value=decodeURIComponent(match[1]);return UUID.test(value)?value:null}catch{return null}
}
function sameOriginReferrer(request,url){
  const value=request.headers.get('Referer')||request.headers.get('Referrer')||'';
  if(!value)return null;
  try{const ref=new URL(value);return ref.hostname===url.hostname?ref:null}catch{return null}
}
async function digestHex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function parseUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
function zonedParts(value,timeZone=TIME_ZONE){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value instanceof Date?value:new Date(value));
  return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
}
function offsetMs(value,timeZone=TIME_ZONE){const d=value instanceof Date?value:new Date(value),p=zonedParts(d,timeZone);return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-Math.floor(d.getTime()/1000)*1000}
function zonedMidnight(value=new Date(),timeZone=TIME_ZONE){const p=zonedParts(value,timeZone),localUtc=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),0,0,0);let guess=localUtc;for(let i=0;i<3;i++)guess=localUtc-offsetMs(new Date(guess),timeZone);return new Date(guess)}
function sqliteUtc(date){return date.toISOString().replace('T',' ').slice(0,19)}

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS verified_outbound_events (
        proof_key TEXT PRIMARY KEY,
        click_id INTEGER,
        click_ref TEXT,
        session_id TEXT NOT NULL,
        tool_slug TEXT NOT NULL,
        source TEXT NOT NULL,
        affiliate_active_at_click INTEGER,
        proof_type TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_verified_outbound_created ON verified_outbound_events(created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_verified_outbound_session ON verified_outbound_events(session_id,created_at)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS outbound_integrity_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)`),
      env.DB.prepare(`INSERT OR IGNORE INTO outbound_integrity_meta(key,value) VALUES('tracking_started_at',datetime('now'))`)
    ]);
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}

async function recordVerifiedOutbound(request,env,url,response){
  if(request.method!=='GET'||!url.pathname.startsWith('/go/')||response.status<300||response.status>=400||!response.headers.get('Location'))return;
  const session=parseSession(request),ref=sameOriginReferrer(request,url),classification=classifySessionRequest(request);
  if(!session||!ref||classification!==SESSION_CLASSIFICATIONS.LIKELY_HUMAN)return;
  const denied=await env.DB.prepare(`SELECT decision FROM traffic_guard_events WHERE session_id=? ORDER BY id DESC LIMIT 1`).bind(session).first().catch(()=>null);
  if(denied?.decision==='denied')return;
  const tool=url.pathname.slice(4).toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!tool)return;
  await ensureSchema(env);
  const click=await env.DB.prepare(`SELECT id,click_ref,source,affiliate_active_at_click,created_at FROM click_events WHERE session_id=? AND tool_slug=? ORDER BY id DESC LIMIT 1`).bind(session,tool).first();
  if(!click)return;
  const created=parseUtc(click.created_at)||new Date();
  const proofKey=`${session}:${tool}:${Math.floor(created.getTime()/5000)}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO verified_outbound_events(proof_key,click_id,click_ref,session_id,tool_slug,source,affiliate_active_at_click,proof_type,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(proofKey,Number(click.id||0)||null,click.click_ref||null,session,tool,String(click.source||'public-redirect'),click.affiliate_active_at_click==null?null:Number(click.affiliate_active_at_click),'same_origin_established_session_navigation',String(click.created_at||sqliteUtc(created))).run();

  const alreadyAllowed=await env.DB.prepare(`SELECT 1 ok FROM traffic_guard_events WHERE session_id=? AND decision='allowed' LIMIT 1`).bind(session).first().catch(()=>null);
  if(!alreadyAllowed){
    const ua=request.headers.get('User-Agent')||'',uaHash=await digestHex(ua),fingerprint=await digestHex(`${session}|${ref.pathname}|outbound`);
    await env.DB.prepare(`INSERT INTO traffic_guard_events(fingerprint,ua_hash,session_id,path,country,asn,suspicious_direct,decision,reason,created_at) VALUES(?,?,?,?,?,?,0,'allowed','same_origin_outbound_navigation',datetime('now'))`)
      .bind(fingerprint,uaHash,session,ref.pathname.slice(0,200)||'/',String(request.cf?.country||'').slice(0,8)||null,Number(request.cf?.asn||0)||null).run();
  }

  const existingPage=await env.DB.prepare(`SELECT 1 ok FROM funnel_events WHERE session_id=? AND event_type='page_confirmed' LIMIT 1`).bind(session).first().catch(()=>null);
  if(!existingPage){
    await env.DB.prepare(`INSERT INTO funnel_events(event_id,session_id,event_type,path,source,referrer_host,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
      .bind(`evt_${crypto.randomUUID()}`,session,'page_confirmed',ref.pathname.slice(0,200)||'/','outbound-proof',url.hostname).run().catch(()=>{});
  }
}

async function outboundSnapshot(env){
  await ensureSchema(env);
  const now=new Date(),todayStart=sqliteUtc(zonedMidnight(now)),last24=sqliteUtc(new Date(now.getTime()-86400000)),window30=sqliteUtc(new Date(now.getTime()-30*86400000));
  const [meta,verified,legacy,guard]=await Promise.all([
    env.DB.prepare(`SELECT value FROM outbound_integrity_meta WHERE key='tracking_started_at' LIMIT 1`).first(),
    env.DB.prepare(`SELECT COUNT(*) outbound30d,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized30d,SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) outbound24h,SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) outboundToday,SUM(CASE WHEN affiliate_active_at_click=1 AND created_at>=? THEN 1 ELSE 0 END) monetizedToday,COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) outboundSessionsToday FROM verified_outbound_events WHERE created_at>=?`).bind(last24,todayStart,todayStart,todayStart,window30).first(),
    env.DB.prepare(`WITH confirmed AS (SELECT DISTINCT session_id FROM funnel_events WHERE event_type='page_confirmed') SELECT COUNT(*) outbound30d FROM click_events c JOIN confirmed x ON x.session_id=c.session_id LEFT JOIN sessions s ON s.session_id=c.session_id WHERE c.created_at>=? AND COALESCE(s.classification,'unknown/legacy') IN ('likely-human','human') AND c.source NOT IN ('internal-test','synthetic','health-check','ci')`).bind(window30).first().catch(()=>null),
    env.DB.prepare(`SELECT COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) sessions24h,COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) sessionsToday,MAX(CASE WHEN decision='allowed' THEN created_at END) lastAllowedAt FROM traffic_guard_events WHERE decision='allowed' AND created_at>=datetime('now','-36 hours')`).bind(last24,todayStart).first().catch(()=>null)
  ]);
  const trackingSince=parseUtc(meta?.value),windowComplete=Boolean(trackingSince&&trackingSince.getTime()<=now.getTime()-30*86400000);
  const outbound30d=Number(verified?.outbound30d||0),monetized30d=Number(verified?.monetized30d||0);
  return {
    status:'observed',source:'D1',proof:'same-origin established-session browser navigation',trackingSince:trackingSince?.toISOString()||null,windowDays:30,windowComplete,
    humanOutbound:outbound30d,monetizedOutbound:monetized30d,unmonetizedOutbound:Math.max(0,outbound30d-monetized30d),weightedCoverage:outbound30d?monetized30d/outbound30d:null,
    humanOutboundLast24:Number(verified?.outbound24h||0),humanOutboundToday:Number(verified?.outboundToday||0),monetizedOutboundToday:Number(verified?.monetizedToday||0),outboundSessionsToday:Number(verified?.outboundSessionsToday||0),
    legacyStrictOutbound30d:Number(legacy?.outbound30d||0),guardSessionsLast24:Number(guard?.sessions24h||0),guardSessionsToday:Number(guard?.sessionsToday||0),lastGuardAllowedAt:guard?.lastAllowedAt||null,
    definition:'Verified outbound counts only same-origin /go/ navigations from a browser-like request carrying an established first-party ToolScout session. Owner, bot, synthetic and direct redirect-only traffic are excluded. Repeated same-tool redirects within five seconds are deduplicated. History before trackingStartedAt is not backfilled.'
  };
}

async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const snap=await outboundSnapshot(env);
  data.canonicalCommercialTruth=snap;
  data.outboundIntegrity=snap;
  if(data.monetizationProof){
    data.monetizationProof={...data.monetizationProof,monetizedOutboundClicks:snap.monetizedOutbound,verifiedOutboundTrackingSince:snap.trackingSince,outboundWindowComplete:snap.windowComplete};
    if(data.monetizationProof.confirmedRevenue!==null&&data.monetizationProof.confirmedRevenue!==undefined){
      const revenue=Number(data.monetizationProof.confirmedRevenue);
      data.monetizationProof.earningsPerMonetizedClick=snap.monetizedOutbound>0?revenue/snap.monetizedOutbound:null;
    }
  }
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

async function augmentHealth(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const snap=await outboundSnapshot(env);
  data.canonical='D1 browser-guard sessions + first-party verified outbound navigation';
  data.sessions24h=snap.guardSessionsLast24;
  data.trafficState=snap.guardSessionsLast24>0?'active':'quiet';
  data.note='Human traffic uses Browser Guard truth. Outbound uses first-party same-origin navigation proof and does not depend on consent analytics or the legacy page_confirmed gate.';
  data.legacyPageConfirmed={sessions24h:data.legacyPageConfirmed?.sessions24h??null,lastPageConfirmedAt:data.lastPageConfirmedAt||null};
  data.outboundIntegrity=snap;
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
}

async function decorateAnalytics(response){
  if(!response.ok||(response.headers.get('content-type')||'').toLowerCase().includes('text/html')===false)return response;
  let html=await response.text();
  html=html.replaceAll('Outbound clicks, 30d','Verified outbound clicks').replaceAll('Monetized outbound, 30d','Verified monetized outbound').replaceAll('Browser-confirmed human outbound clicks','First-party verified outbound clicks since exact tracking began').replaceAll('Browser-confirmed outbound with affiliate active at click time','Verified outbound with affiliate active at click time');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const response=await base.fetch(request,env,ctx);
    if(url.pathname.startsWith('/go/')){try{await recordVerifiedOutbound(request,env,url,response)}catch{}}
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return augmentStats(response,env);
    if(request.method==='GET'&&url.pathname==='/api/traffic-integrity-health')return augmentHealth(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorateAnalytics(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
