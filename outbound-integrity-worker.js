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
function userActivatedNavigation(request){
  return request.headers.get('Sec-Fetch-User')==='?1'&&String(request.headers.get('Sec-Fetch-Mode')||'').toLowerCase()==='navigate';
}
function sessionFromResponse(response){
  const cookie=response.headers.get('Set-Cookie')||'';
  const match=cookie.match(/(?:^|,?\s*)toolscout_session=([^;]+)/);
  if(!match)return null;
  try{const value=decodeURIComponent(match[1]);return UUID.test(value)?value:null}catch{return null}
}
async function affiliateEntry(request,env,tool){
  try{
    const r=await env.ASSETS.fetch(new Request(new URL('/data/affiliate.json',request.url)));
    if(!r.ok)return null;
    const cfg=await r.json();
    return cfg?.[tool]||null;
  }catch{return null}
}
function withRedirectRobots(response){
  if(response.status<300||response.status>=400)return response;
  const h=new Headers(response.headers);
  h.set('X-Robots-Tag','noindex, nofollow, noarchive');
  h.set('Cache-Control','private, no-store, max-age=0');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
async function bypassKnownAutomation(request,env,url,response){
  const classification=classifySessionRequest(request);
  if(![SESSION_CLASSIFICATIONS.KNOWN_BOT,SESSION_CLASSIFICATIONS.SYNTHETIC].includes(classification))return response;
  if(response.status<300||response.status>=400||!response.headers.get('Location'))return response;
  const tool=url.pathname.slice(4).toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!tool)return response;
  const entry=await affiliateEntry(request,env,tool);
  const destination=entry?.publicUrl||new URL('/tools/'+tool+'.html',request.url).toString();
  const session=parseSession(request)||sessionFromResponse(response);
  if(session){
    await env.DB.prepare(`UPDATE click_events
      SET affiliate_active_at_click=0,affiliate_route='known_automation_public_bypass'
      WHERE id=(SELECT id FROM click_events WHERE session_id=? AND tool_slug=? ORDER BY id DESC LIMIT 1)`)
      .bind(session,tool).run().catch(()=>{});
  }
  const h=new Headers(response.headers);
  h.set('Location',destination);
  h.set('X-Robots-Tag','noindex, nofollow, noarchive');
  h.set('Cache-Control','private, no-store, max-age=0');
  return new Response(null,{status:302,headers:h});
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
    const requiredTables=[
      'verified_outbound_events',
      'outbound_integrity_meta',
      'traffic_integrity_meta',
      'traffic_human_evidence'
    ];
    const requiredIndexes=[
      'idx_verified_outbound_created',
      'idx_verified_outbound_session',
      'idx_verified_outbound_created_affiliate',
      'idx_verified_outbound_tool_created',
      'idx_traffic_human_evidence_created'
    ];
    const tableMarks=requiredTables.map(()=>'?').join(',');
    const indexMarks=requiredIndexes.map(()=>'?').join(',');
    const [tables,indexes,tracking,strict]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN (${tableMarks})`).bind(...requiredTables).first(),
      env.DB.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN (${indexMarks})`).bind(...requiredIndexes).first(),
      env.DB.prepare(`SELECT value FROM outbound_integrity_meta WHERE key='tracking_started_at' LIMIT 1`).first(),
      env.DB.prepare(`SELECT value FROM traffic_integrity_meta WHERE key='strict_human_tracking_started_at' LIMIT 1`).first()
    ]);
    const tableCount=Number(tables?.n||0),indexCount=Number(indexes?.n||0);
    const markersReady=Boolean(tracking?.value&&strict?.value);
    if(tableCount!==requiredTables.length||indexCount!==requiredIndexes.length||!markersReady){
      throw new Error(`outbound_integrity_schema_not_migrated:tables_${tableCount}/${requiredTables.length}:indexes_${indexCount}/${requiredIndexes.length}:markers_${markersReady?'ready':'missing'}`);
    }
    return{ok:true,source:'d1_migrations',tables:tableCount,indexes:indexCount,markers:'ready'};
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}

async function recordVerifiedOutbound(request,env,url,response){
  if(request.method!=='GET'||!url.pathname.startsWith('/go/')||response.status<300||response.status>=400||!response.headers.get('Location'))return;
  const session=parseSession(request),ref=sameOriginReferrer(request,url),classification=classifySessionRequest(request);
  if(!session||!ref||classification!==SESSION_CLASSIFICATIONS.LIKELY_HUMAN)return;
  const guard=await env.DB.prepare(`SELECT decision FROM traffic_guard_events WHERE session_id=? ORDER BY id DESC LIMIT 1`).bind(session).first().catch(()=>null);
  if(['blocked','denied'].includes(String(guard?.decision||'').toLowerCase()))return;
  const tool=url.pathname.slice(4).toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!tool)return;
  await ensureSchema(env);
  const click=await env.DB.prepare(`SELECT id,click_ref,source,affiliate_active_at_click,created_at FROM click_events WHERE session_id=? AND tool_slug=? ORDER BY id DESC LIMIT 1`).bind(session,tool).first();
  if(!click)return;
  const created=parseUtc(click.created_at)||new Date();
  const proofKey=`${session}:${tool}:${Math.floor(created.getTime()/5000)}`;
  const proofType=userActivatedNavigation(request)?'user_activation_navigation':'same_origin_established_session_navigation';
  await env.DB.prepare(`INSERT OR IGNORE INTO verified_outbound_events(proof_key,click_id,click_ref,session_id,tool_slug,source,affiliate_active_at_click,proof_type,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(proofKey,Number(click.id||0)||null,click.click_ref||null,session,tool,String(click.source||'public-redirect'),click.affiliate_active_at_click==null?null:Number(click.affiliate_active_at_click),proofType,String(click.created_at||sqliteUtc(created))).run();
}

export async function applyAffiliateRedirectIntegrity(request,env,url,response){
  try{
    response=await bypassKnownAutomation(request,env,url,response);
    await recordVerifiedOutbound(request,env,url,response);
    response=withRedirectRobots(response);
  }catch{}
  return response;
}

async function outboundSnapshot(env){
  await ensureSchema(env);
  const now=new Date(),todayStart=sqliteUtc(zonedMidnight(now)),last24=sqliteUtc(new Date(now.getTime()-86400000)),window30=sqliteUtc(new Date(now.getTime()-30*86400000));
  const [meta,verified,guard]=await Promise.all([
    env.DB.prepare(`SELECT value FROM outbound_integrity_meta WHERE key='tracking_started_at' LIMIT 1`).first(),
    env.DB.prepare(`WITH classified AS (
      SELECT v.*,
        CASE WHEN v.proof_type='user_activation_navigation'
          OR EXISTS(SELECT 1 FROM funnel_events f WHERE f.session_id=v.session_id AND f.event_type='page_confirmed' AND COALESCE(f.source,'')<>'outbound-proof' AND f.created_at<=v.created_at)
          OR EXISTS(SELECT 1 FROM traffic_human_evidence h WHERE h.session_id=v.session_id AND h.evidence_type<>'verified_outbound_navigation' AND h.first_evidence_at<=v.created_at)
        THEN 1 ELSE 0 END strict_proof
      FROM verified_outbound_events v
      WHERE v.created_at>=?
    )
    SELECT
      COUNT(*) browser30d,
      SUM(CASE WHEN strict_proof=1 THEN 1 ELSE 0 END) strict30d,
      SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) browserMonetized30d,
      SUM(CASE WHEN strict_proof=1 AND affiliate_active_at_click=1 THEN 1 ELSE 0 END) strictMonetized30d,
      SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) browser24h,
      SUM(CASE WHEN strict_proof=1 AND created_at>=? THEN 1 ELSE 0 END) strict24h,
      SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) browserToday,
      SUM(CASE WHEN strict_proof=1 AND created_at>=? THEN 1 ELSE 0 END) strictToday,
      SUM(CASE WHEN affiliate_active_at_click=1 AND created_at>=? THEN 1 ELSE 0 END) browserMonetizedToday,
      SUM(CASE WHEN strict_proof=1 AND affiliate_active_at_click=1 AND created_at>=? THEN 1 ELSE 0 END) strictMonetizedToday
    FROM classified`).bind(window30,last24,last24,todayStart,todayStart,todayStart,todayStart).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT CASE WHEN first_evidence_at>=? THEN session_id END) sessions24h,COUNT(DISTINCT CASE WHEN first_evidence_at>=? THEN session_id END) sessionsToday,MAX(last_evidence_at) lastAllowedAt FROM traffic_human_evidence WHERE first_evidence_at>=datetime('now','-36 hours') AND evidence_type<>'verified_outbound_navigation'`).bind(last24,todayStart).first().catch(()=>null)
  ]);
  const trackingSince=parseUtc(meta?.value),windowComplete=Boolean(trackingSince&&trackingSince.getTime()<=now.getTime()-30*86400000);
  const browser30d=Number(verified?.browser30d||0),strict30d=Number(verified?.strict30d||0);
  const browserMonetized30d=Number(verified?.browserMonetized30d||0),strictMonetized30d=Number(verified?.strictMonetized30d||0);
  return {
    status:'observed',source:'D1',trackingSince:trackingSince?.toISOString()||null,windowDays:30,windowComplete,
    browserQualifiedOutbound:browser30d,
    browserQualifiedMonetizedOutbound:browserMonetized30d,
    strictHumanOutbound:strict30d,
    strictHumanMonetizedOutbound:strictMonetized30d,
    browserQualifiedOutboundLast24:Number(verified?.browser24h||0),
    strictHumanOutboundLast24:Number(verified?.strict24h||0),
    browserQualifiedOutboundToday:Number(verified?.browserToday||0),
    strictHumanOutboundToday:Number(verified?.strictToday||0),
    browserQualifiedMonetizedToday:Number(verified?.browserMonetizedToday||0),
    strictHumanMonetizedToday:Number(verified?.strictMonetizedToday||0),
    strictHumanSessionsLast24:Number(guard?.sessions24h||0),
    strictHumanSessionsToday:Number(guard?.sessionsToday||0),
    lastStrictHumanEvidenceAt:guard?.lastAllowedAt||null,
    humanOutbound:strict30d,
    monetizedOutbound:strictMonetized30d,
    humanOutboundLast24:Number(verified?.strict24h||0),
    humanOutboundToday:Number(verified?.strictToday||0),
    monetizedOutboundToday:Number(verified?.strictMonetizedToday||0),
    definition:'Commercial outbound uses separate evidence levels. Browser-qualified means a same-origin /go/ navigation from an established first-party session with a plausible browser request. Strict human means prior positive browser/human evidence or an explicit browser user-activation navigation. Known bots, synthetic traffic and owner traffic are excluded. A /go/ request never creates page-confirmation evidence by itself.'
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
  data.canonical='D1 strict-human-v2 + layered outbound evidence';
  data.sessions24h=snap.strictHumanSessionsLast24;
  data.trafficState=snap.strictHumanSessionsLast24>0?'active':'quiet';
  data.note='Human traffic requires positive evidence. Outbound evidence is layered: network-observed, first-party redirect, browser-qualified, and strict/user-activated. These populations are never silently collapsed.';
  data.legacyPageConfirmed={sessions24h:data.legacyPageConfirmed?.sessions24h??null,lastPageConfirmedAt:data.lastPageConfirmedAt||null};
  data.outboundIntegrity=snap;
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
}

async function decorateAnalytics(response){
  if(!response.ok||(response.headers.get('content-type')||'').toLowerCase().includes('text/html')===false)return response;
  let html=await response.text();
  html=html.replaceAll('Outbound clicks, 30d','Strict human outbound').replaceAll('Monetized outbound, 30d','Strict human monetized outbound').replaceAll('Browser-confirmed human outbound clicks','Strict human outbound since layered tracking began').replaceAll('Browser-confirmed outbound with affiliate active at click time','Strict human outbound with affiliate active at click time');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(url.pathname.startsWith('/go/'))response=await applyAffiliateRedirectIntegrity(request,env,url,response);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return augmentStats(response,env);
    if(request.method==='GET'&&url.pathname==='/api/traffic-integrity-health')return augmentHealth(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorateAnalytics(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};

export {augmentHealth as augmentOutboundIntegrityHealth};
