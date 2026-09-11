import { classifySessionRequest, SESSION_CLASSIFICATIONS, SESSION_UPSERT_SQL } from './session-classification.js';

// Internal ASSETS reads remain available to the Worker; these URLs are not public.
export const privateAssetPaths = new Set([
  '/data/affiliate-pipeline.json',
  '/data/affiliate-queue.json',
  '/data/business-intelligence.json',
  '/data/business-intelligence-history.json',
  '/data/traffic-truth.json',
]);

const SESSION_COOKIE='toolscout_session';
const SESSION_TTL_SECONDS=1800;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKABLE_CLASSIFICATIONS=new Set([SESSION_CLASSIFICATIONS.LIKELY_HUMAN,SESSION_CLASSIFICATIONS.OWNER]);
const STATS_PATHS=new Set(['/api/stats','/analytics/api/stats']);
const n=v=>Number(v||0);
const rate=(a,b)=>b?Number((a/b*100).toFixed(1)):null;

function cookieSession(request){
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if(!match)return null;
  try{const value=decodeURIComponent(match[1]);return UUID.test(value)?value:null}catch{return null}
}

function cleanSource(value){return String(value||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,100)}

function acquisition(request,url){
  const source=url.searchParams.get('source');
  const utm=['utm_source','utm_medium','utm_campaign'].map(k=>`${k}=${cleanSource(url.searchParams.get(k))}`).filter(x=>!x.endsWith('=')).join('&');
  if(utm)return cleanSource(utm);
  if(source)return cleanSource(source);
  const ref=request.headers.get('Referer')||request.headers.get('Referrer')||'';
  if(ref){
    try{
      const host=new URL(ref).hostname.replace(/^www\./,'').toLowerCase();
      if(host&&host!==url.hostname.replace(/^www\./,'').toLowerCase())return cleanSource(`ref:${host}`);
    }catch{}
  }
  return 'direct';
}

function referrerHost(request,url){
  const ref=request.headers.get('Referer')||request.headers.get('Referrer')||'';
  if(!ref)return null;
  try{
    const host=new URL(ref).hostname.replace(/^www\./,'').toLowerCase();
    return host&&host!==url.hostname.replace(/^www\./,'').toLowerCase()?host.slice(0,120):null;
  }catch{return null}
}

function publicHtmlRequest(request,url,response){
  if(request.method!=='GET'||response.status!==200)return false;
  const path=url.pathname;
  if(path.startsWith('/analytics')||path.startsWith('/api/')||path.startsWith('/go/')||path.startsWith('/data/')||path.startsWith('/reports/')||path.startsWith('/.well-known/'))return false;
  return (response.headers.get('Content-Type')||'').toLowerCase().includes('text/html');
}

function browserSessionSync(){
  return `<script>(function(){try{var m=document.cookie.match(/(?:^|;\\s*)toolscout_session=([^;]+)/);if(!m)return;var id=decodeURIComponent(m[1]);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return;var now=Date.now();localStorage.setItem('toolscout_session_v2',JSON.stringify({id:id,lastSeen:now}));sessionStorage.setItem('toolscout_started_'+id,'1');var payload={event_id:'confirm_'+id,session_id:id,event_type:'page_confirmed',path:location.pathname.slice(0,200)||'/',source:'browser-confirm'};fetch('/api/events',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(function(){})}catch(e){}})();</script>`;
}

async function withPageEntryTracking(request,env,ctx,response){
  const url=new URL(request.url);
  if(!publicHtmlRequest(request,url,response)||!env.DB)return response;
  const classification=classifySessionRequest(request);
  if(!TRACKABLE_CLASSIFICATIONS.has(classification))return response;
  const existing=cookieSession(request);
  const session=existing||crypto.randomUUID();
  const source=acquisition(request,url);
  const refHost=referrerHost(request,url);
  const ownerFlag=classification===SESSION_CLASSIFICATIONS.OWNER?1:0;
  const path=url.pathname.slice(0,200)||'/';
  const eventId=`start_${session}`;
  try{
    await env.DB.batch([
      env.DB.prepare(SESSION_UPSERT_SQL).bind(session,source,ownerFlag,classification),
      env.DB.prepare(`INSERT OR IGNORE INTO funnel_events (event_id,session_id,event_type,intent_slug,tool_slug,path,source,referrer_host,created_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).bind(eventId,session,'session_started',null,null,path,source,refHost)
    ]);
  }catch{
    return response;
  }
  const headers=new Headers(response.headers);
  if(!existing)headers.append('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(session)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; SameSite=Lax; Secure`);
  const tracked=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  return new HTMLRewriter().on('head',{element(el){el.prepend(browserSessionSync(),{html:true})}}).transform(tracked);
}

async function guardPageConfirmation(request,env){
  if(!env.DB||request.method!=='POST')return null;
  let url;try{url=new URL(request.url)}catch{return null}
  if(url.pathname!=='/api/events')return null;
  let body;try{body=await request.clone().json()}catch{return null}
  if(String(body?.event_type||'')!=='page_confirmed')return null;
  const reject=(status,error)=>Response.json({ok:false,recorded:false,error},{status,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}});
  const accept=(recorded)=>Response.json({ok:true,recorded},{status:202,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}});
  const origin=request.headers.get('Origin')||'';
  if(origin&&origin!==url.origin)return reject(403,'confirmation_origin_mismatch');
  const fetchSite=(request.headers.get('Sec-Fetch-Site')||'').toLowerCase();
  if(fetchSite&&fetchSite!=='same-origin')return reject(403,'confirmation_not_same_origin');
  const cookie=cookieSession(request);
  const session=String(body?.session_id||'');
  if(!cookie||!UUID.test(session)||cookie!==session)return reject(403,'confirmation_session_mismatch');
  if(String(body?.event_id||'')!==`confirm_${session}`||String(body?.source||'')!=='browser-confirm')return reject(400,'confirmation_contract_invalid');
  const classification=classifySessionRequest(request);
  if(!TRACKABLE_CLASSIFICATIONS.has(classification))return reject(403,'confirmation_request_not_trackable');
  let established;
  try{
    established=await env.DB.prepare(`SELECT s.classification,st.path,
      EXISTS(SELECT 1 FROM funnel_events conf WHERE conf.session_id=s.session_id AND conf.event_type='page_confirmed') AS already_confirmed
      FROM sessions s JOIN funnel_events st ON st.session_id=s.session_id AND st.event_type='session_started'
      WHERE s.session_id=? ORDER BY st.created_at ASC LIMIT 1`).bind(session).first();
  }catch{
    return reject(503,'confirmation_state_unavailable');
  }
  if(!established||!TRACKABLE_CLASSIFICATIONS.has(String(established.classification||'')))return reject(403,'confirmation_session_not_established');
  const eventPath=String(body?.path||'');
  if(!Number(established.already_confirmed||0)&&eventPath!==String(established.path||''))return reject(409,'confirmation_entry_path_mismatch');
  try{
    const result=await env.DB.batch([
      env.DB.prepare(`UPDATE sessions SET last_seen_at=datetime('now') WHERE session_id=?`).bind(session),
      env.DB.prepare(`INSERT INTO funnel_events (event_id,session_id,event_type,intent_slug,tool_slug,path,source,referrer_host,created_at) VALUES (?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(event_id) DO NOTHING`).bind(`confirm_${session}`,session,'page_confirmed',null,null,eventPath,'browser-confirm',null)
    ]);
    const recorded=Number(result?.[1]?.meta?.changes||0)>0||Number(established.already_confirmed||0)>0;
    return accept(recorded);
  }catch{
    return reject(503,'confirmation_write_failed');
  }
}

async function observedTrafficIntegrity(env){
  const confirmed=await env.DB.prepare(`SELECT
    COUNT(DISTINCT CASE WHEN conf.created_at>=datetime('now','-24 hours') THEN conf.session_id END) human24h,
    COUNT(DISTINCT CASE WHEN date(conf.created_at,'+1 hour')=date('now','+1 hour') THEN conf.session_id END) today,
    COUNT(DISTINCT CASE WHEN strftime('%Y-%m',datetime(conf.created_at,'+1 hour'))=strftime('%Y-%m',datetime('now','+1 hour')) THEN conf.session_id END) mtd,
    COUNT(DISTINCT CASE WHEN conf.created_at>=datetime('now','-30 days') THEN conf.session_id END) d30
    FROM funnel_events conf JOIN sessions s ON s.session_id=conf.session_id
    WHERE conf.event_type='page_confirmed' AND s.classification='likely-human'`).first();
  const server=await env.DB.prepare(`SELECT
    COUNT(DISTINCT CASE WHEN st.created_at>=datetime('now','-30 days') THEN st.session_id END) server30d,
    COUNT(DISTINCT CASE WHEN st.created_at>=datetime('now','-30 days') AND NOT EXISTS (SELECT 1 FROM funnel_events conf WHERE conf.session_id=st.session_id AND conf.event_type='page_confirmed') THEN st.session_id END) unconfirmed30d
    FROM funnel_events st JOIN sessions s ON s.session_id=st.session_id
    WHERE st.event_type='session_started' AND s.classification='likely-human'`).first();
  const clicks=await env.DB.prepare(`SELECT COUNT(*) outbound,COUNT(DISTINCT c.session_id) sessions_with_outbound,SUM(CASE WHEN c.affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized
    FROM click_events c JOIN sessions s ON s.session_id=c.session_id
    WHERE s.classification='likely-human' AND c.created_at>=datetime('now','-30 days') AND c.source!='internal-test'
    AND EXISTS (SELECT 1 FROM funnel_events conf WHERE conf.session_id=c.session_id AND conf.event_type='page_confirmed' AND conf.created_at<=c.created_at)`).first();
  const calendar=await env.DB.prepare(`SELECT CAST(strftime('%d',datetime('now','+1 hour')) AS INTEGER) day_of_month,CAST(strftime('%d',date(datetime('now','+1 hour'),'start of month','+1 month','-1 day')) AS INTEGER) days_in_month`).first();
  const today=n(confirmed?.today),mtd=n(confirmed?.mtd),d30=n(confirmed?.d30),human24h=n(confirmed?.human24h),outbound=n(clicks?.outbound),monetized=n(clicks?.monetized),sessionsWithOutbound=n(clicks?.sessions_with_outbound);
  const day=Math.max(1,n(calendar?.day_of_month)),daysInMonth=Math.max(day,n(calendar?.days_in_month)||30),dailyAverage=mtd/day;
  return {human24h,today,mtd,d30,outbound,monetized,sessionsWithOutbound,dailyAverage,projectedMonth:Math.round(dailyAverage*daysInMonth),server30d:n(server?.server30d),unconfirmed30d:n(server?.unconfirmed30d)};
}

async function patchStats(response,env){
  if(!response.ok||!env.DB)return response;
  let data;try{data=await response.clone().json()}catch{return response}
  let x;try{x=await observedTrafficIntegrity(env)}catch{return response}
  const definition='Human traffic requires a browser-confirmed public page entry. Redirect-only and server-only page requests are excluded.';
  data.tracking={...(data.tracking||{}),status:'browser-confirmed',humanSessionsLast24Hours:x.human24h,definition};
  data.traffic={...(data.traffic||{}),today:x.today,monthToDate:x.mtd,dailyAverageMTD:Number(x.dailyAverage.toFixed(2)),projectedMonth:x.projectedMonth,definition};
  data.funnel={...(data.funnel||{}),sessions:x.d30,outboundClicks:x.outbound,sessionToOutboundCtr:rate(x.sessionsWithOutbound,x.d30),definition};
  data.audience={...(data.audience||{}),likelyHumanSessions:x.d30};
  data.total={...(data.total||{}),sessions:x.d30};
  data.commercial={...(data.commercial||{}),monetizedOutbound:x.monetized,totals:{...(data.commercial?.totals||{}),outbound:x.outbound,monetizedOutbound:x.monetized},trafficDefinition:definition};
  data.trafficIntegrity={status:'browser-confirmed',definition,confirmedHumanSessions30d:x.d30,confirmedHumanOutbound30d:x.outbound,confirmedMonetizedOutbound30d:x.monetized,serverObservedPageEntrySessions30d:x.server30d,serverOnlyUnconfirmedSessions30d:x.unconfirmed30d};
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

export function withPrivateAssets(base) {
  return {
    ...base,
    async fetch(request, env, ctx) {
      let path;
      try { path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, ''); }
      catch { return new Response('Bad request', {status: 400}); }
      if (privateAssetPaths.has(path)) {
        return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
      }
      if (['/data/tools.json', '/data/pending-affiliate-tools.json'].includes(path)) {
        const asset = await env.ASSETS.fetch(request);
        if (!asset.ok) return asset;
        const tools = await asset.json();
        const publicTools = tools.map(({commission, affiliateProgram, affiliateUrl, ...tool}) => tool);
        return Response.json(publicTools, {headers: {'Cache-Control': 'no-store'}});
      }
      const confirmationResponse=await guardPageConfirmation(request,env);
      if(confirmationResponse)return confirmationResponse;
      let response=await base.fetch(request,env,ctx);
      if(STATS_PATHS.has(path))response=await patchStats(response,env);
      return withPageEntryTracking(request,env,ctx,response);
    },
  };
}