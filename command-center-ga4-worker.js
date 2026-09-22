import base from './command-center-health-language-worker.js';
import {googleAnalyticsOAuthStatus,googleAnalyticsOAuthAccess,googleAnalyticsConnectResponse,googleAnalyticsCallbackResponse,googleAnalyticsDisconnectResponse} from './google-analytics-oauth.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const GA_SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const GA_TOKEN_URL='https://oauth2.googleapis.com/token';
const GA_DATA_ORIGIN='https://analyticsdata.googleapis.com';
const GA_ADMIN_ORIGIN='https://analyticsadmin.googleapis.com';
const DEFAULT_MEASUREMENT_ID='G-9VR80SYYH7';
const BUSINESS_TIME_ZONE='Europe/Lisbon';
let tokenCache=null;
let propertyCache=null;

function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function b64url(value){
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function pemBytes(value){
  const raw=String(value||'').replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\s+/g,'');
  const binary=atob(raw);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}
function gaConfig(env){
  let service={};
  if(env.GA4_SERVICE_ACCOUNT_JSON){try{service=JSON.parse(String(env.GA4_SERVICE_ACCOUNT_JSON))}catch{service={}}}
  return {
    propertyId:String(env.GA4_PROPERTY_ID||'').replace(/^properties\//,''),
    measurementId:String(env.GA4_MEASUREMENT_ID||DEFAULT_MEASUREMENT_ID),
    clientEmail:String(env.GA4_CLIENT_EMAIL||service.client_email||''),
    privateKey:String(env.GA4_PRIVATE_KEY||service.private_key||'')
  };
}
async function serviceAccountAccessToken(env){
  const cfg=gaConfig(env),now=Math.floor(Date.now()/1000);
  if(!cfg.clientEmail||!cfg.privateKey)throw new Error('ga4_service_account_not_configured');
  if(tokenCache&&tokenCache.email===cfg.clientEmail&&tokenCache.expiresAt>now+90)return tokenCache.token;
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=b64url(JSON.stringify({iss:cfg.clientEmail,scope:GA_SCOPE,aud:GA_TOKEN_URL,iat:now,exp:now+3600}));
  const unsigned=`${header}.${payload}`;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(cfg.privateKey),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));
  const assertion=`${unsigned}.${b64url(new Uint8Array(signature))}`;
  const response=await fetch(GA_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.access_token)throw new Error(`ga4_oauth_${response.status}:${body.error_description||body.error||'token_failed'}`);
  tokenCache={email:cfg.clientEmail,token:body.access_token,expiresAt:now+n(body.expires_in||3600)};
  return tokenCache.token;
}
async function googleJson(url,token,init={}){
  const headers=new Headers(init.headers||{});headers.set('Authorization',`Bearer ${token}`);if(init.body)headers.set('Content-Type','application/json');
  const response=await fetch(url,{...init,headers});const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`google_api_${response.status}:${body?.error?.message||'request_failed'}`);
  return body;
}
async function resolvePropertyId(env,token){
  const cfg=gaConfig(env);if(cfg.propertyId)return cfg.propertyId;
  if(propertyCache&&propertyCache.measurementId===cfg.measurementId&&propertyCache.propertyId)return propertyCache.propertyId;
  const summary=await googleJson(`${GA_ADMIN_ORIGIN}/v1beta/accountSummaries?pageSize=200`,token);
  const properties=[];
  for(const account of summary.accountSummaries||[])for(const property of account.propertySummaries||[])if(property.property)properties.push(property.property);
  for(const property of properties){
    try{
      const streams=await googleJson(`${GA_ADMIN_ORIGIN}/v1beta/${property}/dataStreams?pageSize=200`,token);
      const match=(streams.dataStreams||[]).find(stream=>String(stream?.webStreamData?.measurementId||'')===cfg.measurementId);
      if(match){const propertyId=property.replace(/^properties\//,'');propertyCache={measurementId:cfg.measurementId,propertyId};return propertyId}
    }catch{}
  }
  throw new Error('ga4_property_id_not_configured_or_discoverable');
}
function zoneParts(date=new Date(),timeZone=BUSINESS_TIME_ZONE){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const map={};for(const part of parts)if(part.type!=='literal')map[part.type]=part.value;
  return {year:Number(map.year),month:Number(map.month),day:Number(map.day),hour:Number(map.hour),minute:Number(map.minute)};
}
function ymd(parts){return `${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`}
function compactMinute(date){const p=zoneParts(date);return `${p.year}${String(p.month).padStart(2,'0')}${String(p.day).padStart(2,'0')}${String(p.hour).padStart(2,'0')}${String(p.minute).padStart(2,'0')}`}
function daysInMonth(year,month){return new Date(Date.UTC(year,month,0)).getUTCDate()}
function zonedLocalToUtcMs(parts,timeZone=BUSINESS_TIME_ZONE){
  const desired=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour||0,parts.minute||0,parts.second||0);
  let guess=desired;
  for(let i=0;i<3;i++){
    const seen=zoneParts(new Date(guess),timeZone);
    const represented=Date.UTC(seen.year,seen.month-1,seen.day,seen.hour,seen.minute,0);
    guess+=desired-represented;
  }
  return guess;
}
function sqlUtc(ms){return new Date(ms).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,'')}
async function runReport(propertyId,token,body){return googleJson(`${GA_DATA_ORIGIN}/v1beta/properties/${propertyId}:runReport`,token,{method:'POST',body:JSON.stringify(body)})}
function firstMetric(report,index=0){return n(report?.rows?.[0]?.metricValues?.[index]?.value)}
function sourceRows(report){
  return (report?.rows||[]).map(row=>({
    source:row.dimensionValues?.[0]?.value||'(not set)',
    medium:row.dimensionValues?.[1]?.value||'(not set)',
    channel:row.dimensionValues?.[2]?.value||'(not set)',
    landingPage:row.dimensionValues?.[3]?.value||'(not set)',
    sessions:n(row.metricValues?.[0]?.value)
  })).filter(row=>row.sessions>0);
}
async function ga4Snapshot(env){
  const cfg=gaConfig(env),oauthBefore=await googleAnalyticsOAuthStatus(env);
  let token=null,propertyId=null,authMode=null,connectedEmail=null;
  try{
    if(oauthBefore.connected){
      const oauth=await googleAnalyticsOAuthAccess(env);
      token=oauth.token;propertyId=oauth.propertyId;authMode='oauth';connectedEmail=oauth.ownerEmail;
    }else if(cfg.clientEmail&&cfg.privateKey){
      token=await serviceAccountAccessToken(env);propertyId=await resolvePropertyId(env,token);authMode='service_account';connectedEmail=cfg.clientEmail;
    }else{
      return {status:'unavailable',canonical:true,source:'Google Analytics 4 Data API',reason:oauthBefore.configured?'Google Analytics is not connected. Use Connect Google Analytics in the Command Center.':'Google OAuth app credentials are not configured yet.',measurementId:cfg.measurementId,oauth:oauthBefore,fetchedAt:new Date().toISOString()};
    }
    if(!propertyId)throw new Error('ga4_property_id_unavailable');
    const now=new Date(),local=zoneParts(now),today=ymd(local),monthStart=`${local.year}-${String(local.month).padStart(2,'0')}-01`,yesterdayDate=new Date(now.getTime()-36*3600000),yesterday=ymd(zoneParts(yesterdayDate)),cutoff=compactMinute(new Date(now.getTime()-24*3600000)),current=compactMinute(now);
    const [todayReport,mtdReport,hourReport,sourcesReport]=await Promise.all([
      runReport(propertyId,token,{dateRanges:[{startDate:today,endDate:today}],metrics:[{name:'sessions'},{name:'totalUsers'},{name:'activeUsers'}]}),
      runReport(propertyId,token,{dateRanges:[{startDate:monthStart,endDate:today}],metrics:[{name:'sessions'},{name:'totalUsers'}]}),
      runReport(propertyId,token,{dateRanges:[{startDate:yesterday,endDate:today}],dimensions:[{name:'dateHourMinute'}],metrics:[{name:'sessions'}],limit:'100000',orderBys:[{dimension:{dimensionName:'dateHourMinute'}}]}),
      runReport(propertyId,token,{dateRanges:[{startDate:monthStart,endDate:today}],dimensions:[{name:'sessionSource'},{name:'sessionMedium'},{name:'sessionDefaultChannelGroup'},{name:'landingPagePlusQueryString'}],metrics:[{name:'sessions'}],limit:'100',orderBys:[{metric:{metricName:'sessions'},desc:true}]})
    ]);
    let last24Hours=0;for(const row of hourReport.rows||[]){const key=String(row.dimensionValues?.[0]?.value||'');if(key>=cutoff&&key<=current)last24Hours+=n(row.metricValues?.[0]?.value)}
    const sessionsToday=firstMetric(todayReport,0),mtd=firstMetric(mtdReport,0),elapsedDays=Math.max(1,local.day),dailyAverage=mtd/elapsedDays,projection=dailyAverage*daysInMonth(local.year,local.month),timeZone=todayReport?.metadata?.timeZone||mtdReport?.metadata?.timeZone||BUSINESS_TIME_ZONE,oauth=await googleAnalyticsOAuthStatus(env);
    return {status:'connected',canonical:true,source:'Google Analytics 4 Data API',propertyId,measurementId:cfg.measurementId,timeZone,authMode,connectedEmail,oauth,sessions:{today:sessionsToday,last24Hours,monthToDate:mtd,dailyAverageMTD:Number(dailyAverage.toFixed(2)),projectedMonth:Math.round(projection)},users:{today:firstMetric(todayReport,1),activeToday:firstMetric(todayReport,2),monthToDate:firstMetric(mtdReport,1)},sources:sourceRows(sourcesReport),fetchedAt:new Date().toISOString(),consentNote:'GA4 acquisition is consent dependent under the current ToolScout consent implementation. These figures reproduce the GA4 reporting population and are not expanded with ToolScout traffic classification estimates.'};
  }catch(error){
    return {status:'unavailable',canonical:true,source:'Google Analytics 4 Data API',reason:String(error?.message||error),measurementId:cfg.measurementId,authMode,connectedEmail,oauth:await googleAnalyticsOAuthStatus(env),fetchedAt:new Date().toISOString()};
  }
}
async function serverCommerceSnapshot(env){
  try{
    const local=zoneParts(new Date()),todayStart=zonedLocalToUtcMs({year:local.year,month:local.month,day:local.day,hour:0,minute:0}),monthStart=zonedLocalToUtcMs({year:local.year,month:local.month,day:1,hour:0,minute:0}),row=await env.DB.prepare(`SELECT
      SUM(CASE WHEN created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) outbound_24h,
      SUM(CASE WHEN created_at>=datetime('now','-24 hours') AND affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized_24h,
      SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) outbound_today,
      SUM(CASE WHEN created_at>=? AND affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized_today,
      SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) outbound_mtd,
      SUM(CASE WHEN created_at>=? AND affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized_mtd,
      SUM(CASE WHEN created_at>=? AND affiliate_active_at_click IS NULL THEN 1 ELSE 0 END) unknown_monetization_mtd
      FROM click_events WHERE COALESCE(source,'')<>'internal-test'`).bind(sqlUtc(todayStart),sqlUtc(todayStart),sqlUtc(monthStart),sqlUtc(monthStart),sqlUtc(monthStart)).first();
    return {status:'connected',canonical:true,source:'ToolScout server redirect ledger',definition:'Every non-owner /go/ redirect recorded by the ToolScout Worker. Monetized means affiliate_active_at_click=1 at redirect time.',last24Hours:{outbound:n(row?.outbound_24h),monetized:n(row?.monetized_24h)},today:{outbound:n(row?.outbound_today),monetized:n(row?.monetized_today)},monthToDate:{outbound:n(row?.outbound_mtd),monetized:n(row?.monetized_mtd),unknownMonetization:n(row?.unknown_monetization_mtd)},fetchedAt:new Date().toISOString()};
  }catch(error){return {status:'unavailable',canonical:true,source:'ToolScout server redirect ledger',reason:String(error?.message||error),fetchedAt:new Date().toISOString()}}
}
function diagnosticTraffic(data){
  return {status:data?.tracking?.status||'unavailable',role:'diagnostic_only',source:'ToolScout Traffic Quality',strictHumanSessionsLast24Hours:n(data?.tracking?.humanSessionsLast24Hours),today:n(data?.traffic?.today),monthToDate:n(data?.traffic?.monthToDate),note:'Traffic Quality is diagnostic only. It may flag suspicious or browser-confirmed traffic but it cannot subtract or replace GA4 acquisition sessions.'};
}
function mergeTruth(data,acquisition,commerce){
  const quality=diagnosticTraffic(data),next={...data,acquisition,commerceTruth:commerce,trafficQuality:quality};
  if(acquisition.status==='connected'){
    next.traffic={...(data.traffic||{}),today:acquisition.sessions.today,monthToDate:acquisition.sessions.monthToDate,dailyAverageMTD:acquisition.sessions.dailyAverageMTD,projectedMonth:acquisition.sessions.projectedMonth,canonicalSource:'ga4',population:'ga4_reporting_population'};
    next.tracking={...(data.tracking||{}),status:'connected',source:'ga4',canonicalSource:'ga4',humanSessionsLast24Hours:acquisition.sessions.last24Hours,legacyFieldSemantic:'ga4_sessions',qualityDiagnostic:quality};
  }else{
    next.traffic={...(data.traffic||{}),canonicalSource:'ga4_unavailable',canonicalUnavailable:true};
    next.tracking={...(data.tracking||{}),canonicalSource:'ga4_unavailable',canonicalUnavailable:true,qualityDiagnostic:quality};
  }
  if(next.growthOps?.health){
    next.growthOps={...next.growthOps,health:{...next.growthOps.health,acquisition:{status:acquisition.status,last_event_at:acquisition.fetchedAt,detail:acquisition.status==='connected'?`GA4 canonical acquisition connected for property ${acquisition.propertyId}.`:`GA4 canonical acquisition unavailable: ${acquisition.reason||'configuration required'}.`},issues:[...(next.growthOps.health.issues||[]),...(acquisition.status==='connected'?[]:[{severity:'bug',engine:'analytics',code:'ga4_acquisition_unavailable',title:'GA4 acquisition source unavailable',detail:acquisition.reason||'GA4 reporting is unavailable. D1 Traffic Quality is not promoted as a fallback.',url:null}]),...(commerce.status==='connected'?[]:[{severity:'bug',engine:'analytics',code:'server_commerce_unavailable',title:'Server commerce source unavailable',detail:commerce.reason||'ToolScout server outbound reporting is unavailable.',url:null}])]}};
  }
  return next;
}
function acquisitionWidget(){return `<section class="widget" data-widget="acquisition-truth" style="--w:12;--h:5"><div class="widgetHead"><div><div class="widgetKicker">GA4 acquisition + server commerce</div><div class="widgetTitle">Acquisition & Outbound Truth</div></div><div class="widgetMeta" id="acquisitionTruthMeta">Canonical business sources</div></div><div class="widgetBody" id="acquisitionTruthBody"><div class="empty">Refresh to load GA4 acquisition.</div></div><div class="resizeHandle"></div></section>`}
function acquisitionScript(){return `<script data-ga4-acquisition-renderer="v2">(function(){
const esc2=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),num2=v=>Number(v||0).toLocaleString(),pct2=v=>Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'Unavailable';
function metric2(label,value,meta){return '<div class="metric"><small>'+esc2(label)+'</small><b>'+esc2(value)+'</b><span>'+esc2(meta||'')+'</span></div>'}
function row2(name,value,meta){return '<div class="row"><div><div class="rowName">'+esc2(name)+'</div>'+(meta?'<div class="rowMeta">'+esc2(meta)+'</div>':'')+'</div><div class="rowValue">'+esc2(value)+'</div></div>'}
function draw(d){
  const a=d&&d.acquisition||{},c=d&&d.commerceTruth||{},q=d&&d.trafficQuality||{},oauth=a.oauth||{},root=document.getElementById('acquisitionTruthBody'),meta=document.getElementById('acquisitionTruthMeta');if(!root)return;
  if(a.status!=='connected'){
    let action='';if(oauth.configured&&!oauth.connected)action='<div class="taskActions" style="margin-top:10px"><a class="btn primary" href="/analytics/api/google/connect">Connect Google Analytics</a></div>';else if(!oauth.configured)action='<div class="note" style="margin-top:10px">One-time Google OAuth app setup is still required before the Connect button can work.</div>';
    if(meta)meta.textContent=oauth.connected?'Google connection needs attention':'GA4 unavailable';root.innerHTML='<div class="bug"><b>GA4 acquisition is unavailable.</b><div style="margin-top:6px">'+esc2(a.reason||'Google Analytics is not connected.')+'</div></div>'+action+row2('Traffic Quality diagnostic',num2(q.strictHumanSessionsLast24Hours)+' / 24h','Diagnostic only. It is not promoted to canonical acquisition.')+(c.status==='connected'?row2('Server outbound / 24h',num2(c.last24Hours&&c.last24Hours.outbound),num2(c.last24Hours&&c.last24Hours.monetized)+' monetized'):'');
  }else{
    const s=a.sessions||{},m=c.monthToDate||{},h=c.last24Hours||{},ratio=s.monthToDate?m.outbound/s.monthToDate*100:null;if(meta)meta.textContent='GA4 property '+a.propertyId+' · '+(a.authMode==='oauth'?'Google account':'service account');
    root.innerHTML='<div class="metricGrid">'+metric2('GA4 sessions · today',num2(s.today),'Canonical acquisition')+metric2('GA4 sessions · 24h',num2(s.last24Hours),'Rolling hourly report')+metric2('GA4 sessions · MTD',num2(s.monthToDate),'Google Analytics reporting population')+metric2('Avg GA4 sessions / day · MTD',Number(s.dailyAverageMTD||0).toFixed(1),'Projection '+num2(s.projectedMonth)+' this month')+metric2('Server outbound · 24h',c.status==='connected'?num2(h.outbound):'Unavailable','Worker /go/ redirect ledger')+metric2('Monetized outbound · 24h',c.status==='connected'?num2(h.monetized):'Unavailable',c.status==='connected'&&h.outbound?pct2(h.monetized/h.outbound*100)+' of server outbound':'Click-time affiliate state')+metric2('Server outbound · MTD',c.status==='connected'?num2(m.outbound):'Unavailable',ratio===null?'Different measurement populations':pct2(ratio)+' vs GA4 sessions')+metric2('Monetized outbound · MTD',c.status==='connected'?num2(m.monetized):'Unavailable',c.status==='connected'&&m.outbound?pct2(m.monetized/m.outbound*100)+' of server outbound':'Click-time affiliate state')+'</div>';
    if(a.authMode==='oauth')root.innerHTML+=row2('Google connection','Connected',a.connectedEmail||oauth.ownerEmail||'Owner Google account')+'<div class="taskActions" style="margin-top:8px"><button class="btn" data-ga4-disconnect>Disconnect Google Analytics</button></div>';
    const sources=Array.isArray(a.sources)?a.sources.slice(0,10):[];root.innerHTML+='<div style="margin-top:10px">'+(sources.length?sources.map(x=>row2(x.source+' / '+x.medium,num2(x.sessions)+' sessions',(x.channel||'')+(x.landingPage?' · '+x.landingPage:''))).join(''):'<div class="note">No GA4 acquisition source rows in the current month.</div>')+'</div><div class="note" style="margin-top:10px">GA4 is the acquisition source of truth. ToolScout server redirects are the outbound and monetization source of truth. Traffic Quality remains diagnostic and cannot zero GA4 sessions. '+esc2(a.consentNote||'')+'</div>';
  }
  const ns=document.getElementById('northstarBody');if(ns){const r=d&&d.revenue||{},rv=r.confirmedRevenue==null?'Unknown':(typeof money==='function'?money(r.confirmedRevenue,r.currency):String(r.confirmedRevenue));if(a.status==='connected'){const s=a.sessions||{},h=c.last24Hours||{};ns.innerHTML='<div class="metricGrid">'+metric2('GA4 sessions · 24h',num2(s.last24Hours),'Canonical acquisition')+metric2('GA4 sessions · today',num2(s.today),'Since 00:00 property time')+metric2('GA4 sessions · MTD',num2(s.monthToDate),'Reporting population')+metric2('Server outbound · 24h',c.status==='connected'?num2(h.outbound):'Unavailable','First-party redirect ledger')+metric2('Monetized outbound · 24h',c.status==='connected'?num2(h.monetized):'Unavailable','Affiliate active at click')+metric2('Confirmed revenue',rv,r.reportingStatus==='connected'?'Vendor evidence connected':'Vendor evidence only')+metric2('Avg GA4 sessions / day · MTD',Number(s.dailyAverageMTD||0).toFixed(1),'Current month pace')+metric2('Month projection',num2(s.projectedMonth),'GA4 sessions at current pace')+'</div>'}else{ns.innerHTML='<div class="empty">GA4 acquisition is unavailable. Traffic Quality is intentionally not used as a substitute.</div>'}}
  const health=document.getElementById('healthBody');if(health&&!health.querySelector('[data-ga4-health-row]')){health.insertAdjacentHTML('afterbegin','<div data-ga4-health-row>'+row2('GA4 acquisition',a.status==='connected'?'Observed':'Unavailable',a.status==='connected'?'Canonical sessions · '+(a.authMode==='oauth'?'OAuth':'service account'):' '+esc2(a.reason||'configuration required'))+row2('Traffic Quality','Diagnostic only',num2(q.strictHumanSessionsLast24Hours)+' strict / browser-confirmed sessions · 24h')+row2('Server commerce',c.status==='connected'?'Observed':'Unavailable',c.status==='connected'?num2(c.last24Hours&&c.last24Hours.outbound)+' outbound · '+num2(c.last24Hours&&c.last24Hours.monetized)+' monetized / 24h':esc2(c.reason||''))+'</div>')}
}
document.addEventListener('click',async function(e){const button=e.target.closest('[data-ga4-disconnect]');if(!button)return;e.preventDefault();const old=button.textContent;button.disabled=true;button.textContent='Disconnecting';try{const response=await fetch('/analytics/api/google/disconnect',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'}});if(!response.ok)throw new Error('disconnect_failed');location.reload()}catch{button.disabled=false;button.textContent='Disconnect failed';setTimeout(()=>button.textContent=old,1500)}});
const original=window.render;if(typeof original==='function')window.render=function(d){original(d);draw(d)};
})();</script>`}
async function decoratePage(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();if(!response.ok||!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('data-widget="acquisition-truth"'))html=html.replace('<section class="widget" data-widget="chairman"',acquisitionWidget()+'\n    <section class="widget" data-widget="chairman"');
  if(!html.includes('data-ga4-acquisition-renderer="v2"'))html=html.replace('</body>',acquisitionScript()+'</body>');
  html=html.replace('Business truth first · operational detail optional','GA4 acquisition + server commerce first · operational detail optional');
  html=html.replace('<div class="widgetMeta">Human only</div>','<div class="widgetMeta">GA4 + server</div>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
function analyticsPage(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/command-center'||path==='/command-center/'}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/google/connect')return googleAnalyticsConnectResponse(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/google-analytics/callback')return googleAnalyticsCallbackResponse(request,env);
    if(request.method==='POST'&&url.pathname==='/analytics/api/google/disconnect')return googleAnalyticsDisconnectResponse(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats'){
      const upstream=await base.fetch(request,env,ctx);if(!upstream.ok)return upstream;
      let data;try{data=await upstream.json()}catch{return new Response('Command Center stats unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
      const [acquisition,commerce]=await Promise.all([ga4Snapshot(env),serverCommerceSnapshot(env)]);
      return Response.json(mergeTruth(data,acquisition,commerce),{headers:JSON_H});
    }
    if(request.method==='GET'&&url.pathname==='/analytics/api/ga4-health'){
      const acquisition=await ga4Snapshot(env);return Response.json({ok:acquisition.status==='connected',acquisition},{status:acquisition.status==='connected'?200:503,headers:JSON_H});
    }
    const response=await base.fetch(request,env,ctx);
    return request.method==='GET'&&analyticsPage(url.pathname)?decoratePage(response):response;
  },
  async scheduled(event,env,ctx){return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined}
};

export {ga4Snapshot,serverCommerceSnapshot,mergeTruth};
