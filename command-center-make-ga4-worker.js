import base from './command-center-ga4-worker.js';

const OWNER_EMAIL='pcaiano@gmail.com';
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const DEFAULT_MEASUREMENT_ID='G-9VR80SYYH7';
const DEFAULT_TIMEZONE='Europe/Lisbon';
const FRESH_MS=135*60*1000;
let schemaReady=false;

function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function clampInt(value,min=0,max=100000000){return Math.max(min,Math.min(max,Math.round(n(value))))}
function clampFloat(value,min=0,max=100000000){return Math.max(min,Math.min(max,n(value)))}
function b64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return `tsga4_${b64url(bytes)}`}
async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function sameOrigin(request){return String(request.headers.get('Origin')||'')===new URL(request.url).origin}
async function ownerAuthenticated(request,ctx){
  const headerEmail=String(request.headers.get('Cf-Access-Authenticated-User-Email')||request.headers.get('cf-access-authenticated-user-email')||'').toLowerCase();
  if(headerEmail===OWNER_EMAIL)return true;
  try{if(ctx?.access){const identity=await ctx.access.getIdentity();return String(identity?.email||'').toLowerCase()===OWNER_EMAIL}}catch{}
  return false;
}
async function ensureSchema(env){
  if(schemaReady)return;
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS ga4_make_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'make_google_analytics_4',
    property_id TEXT,
    measurement_id TEXT,
    timezone TEXT,
    sessions_today INTEGER NOT NULL DEFAULT 0,
    sessions_24h INTEGER NOT NULL DEFAULT 0,
    sessions_mtd INTEGER NOT NULL DEFAULT 0,
    users_today INTEGER NOT NULL DEFAULT 0,
    active_users_today INTEGER NOT NULL DEFAULT 0,
    users_mtd INTEGER NOT NULL DEFAULT 0,
    daily_average_mtd REAL NOT NULL DEFAULT 0,
    projected_month INTEGER NOT NULL DEFAULT 0,
    sources_json TEXT NOT NULL DEFAULT '[]',
    observed_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    payload_hash TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ga4_make_snapshots_received ON ga4_make_snapshots(received_at DESC);
  CREATE TABLE IF NOT EXISTS ga4_make_bridge_config (
    id INTEGER PRIMARY KEY CHECK(id=1),
    token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    rotated_at TEXT
  );`);
  schemaReady=true;
}
async function latestSnapshot(env){
  await ensureSchema(env);
  const row=await env.DB.prepare(`SELECT property_id,measurement_id,timezone,sessions_today,sessions_24h,sessions_mtd,users_today,active_users_today,users_mtd,daily_average_mtd,projected_month,sources_json,observed_at,received_at FROM ga4_make_snapshots ORDER BY id DESC LIMIT 1`).first();
  if(!row)return null;
  let sources=[];try{sources=JSON.parse(String(row.sources_json||'[]'))}catch{}
  const receivedMs=Date.parse(String(row.received_at||'').replace(' ','T')+'Z');
  return {row,sources,ageMs:Number.isFinite(receivedMs)?Date.now()-receivedMs:Infinity};
}
async function bridgeConfig(env){
  await ensureSchema(env);
  return env.DB.prepare(`SELECT created_at,rotated_at FROM ga4_make_bridge_config WHERE id=1`).first();
}
async function generateToken(request,env,ctx){
  if(!(await ownerAuthenticated(request,ctx))||!sameOrigin(request))return Response.json({ok:false,error:'forbidden'},{status:403,headers:JSON_H});
  await ensureSchema(env);
  const token=randomToken(),hash=await sha256(token);
  await env.DB.prepare(`INSERT INTO ga4_make_bridge_config(id,token_hash,created_at,rotated_at) VALUES(1,?,datetime('now'),NULL) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,rotated_at=datetime('now')`).bind(hash).run();
  return Response.json({ok:true,token,ingestUrl:'https://trytoolscout.org/api/ga4/make-snapshot',note:'This token is shown only in this response. Rotating it immediately invalidates the previous token.'},{headers:JSON_H});
}
async function revokeToken(request,env,ctx){
  if(!(await ownerAuthenticated(request,ctx))||!sameOrigin(request))return Response.json({ok:false,error:'forbidden'},{status:403,headers:JSON_H});
  await ensureSchema(env);await env.DB.prepare(`DELETE FROM ga4_make_bridge_config WHERE id=1`).run();return Response.json({ok:true,revoked:true},{headers:JSON_H});
}
async function authorizedIngest(request,env){
  await ensureSchema(env);
  const raw=String(request.headers.get('Authorization')||'');
  const token=raw.startsWith('Bearer ')?raw.slice(7).trim():'';
  if(!token)return false;
  const row=await env.DB.prepare(`SELECT token_hash FROM ga4_make_bridge_config WHERE id=1`).first();
  return Boolean(row?.token_hash)&&await sha256(token)===String(row.token_hash);
}
function cleanSources(value){
  if(!Array.isArray(value))return [];
  return value.slice(0,100).map(x=>({source:String(x?.source||'(not set)').slice(0,160),medium:String(x?.medium||'(not set)').slice(0,120),channel:String(x?.channel||'(not set)').slice(0,120),landingPage:String(x?.landingPage||'(not set)').slice(0,500),sessions:clampInt(x?.sessions)})).filter(x=>x.sessions>0);
}
async function ingestSnapshot(request,env){
  if(!(await authorizedIngest(request,env)))return Response.json({ok:false,error:'unauthorized'},{status:401,headers:JSON_H});
  let body;try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H})}
  const observedAt=String(body?.observedAt||new Date().toISOString());const observedMs=Date.parse(observedAt);
  if(!Number.isFinite(observedMs)||observedMs>Date.now()+10*60*1000||observedMs<Date.now()-48*3600000)return Response.json({ok:false,error:'invalid_observed_at'},{status:400,headers:JSON_H});
  const sessions=body?.sessions||{},users=body?.users||{},sources=cleanSources(body?.sources),measurementId=String(body?.measurementId||DEFAULT_MEASUREMENT_ID).slice(0,80),propertyId=String(body?.propertyId||'').replace(/^properties\//,'').slice(0,80),timezone=String(body?.timeZone||DEFAULT_TIMEZONE).slice(0,100);
  const localDay=Math.max(1,new Intl.DateTimeFormat('en-GB',{timeZone:timezone,day:'numeric'}).format(new Date(observedMs))*1||1);const localParts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'numeric'}).formatToParts(new Date(observedMs));const year=Number(localParts.find(p=>p.type==='year')?.value||new Date().getUTCFullYear()),month=Number(localParts.find(p=>p.type==='month')?.value||new Date().getUTCMonth()+1),daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  const mtd=clampInt(sessions.monthToDate??body.sessionsMTD),daily=Number.isFinite(Number(sessions.dailyAverageMTD))?clampFloat(sessions.dailyAverageMTD):mtd/localDay,projection=Number.isFinite(Number(sessions.projectedMonth))?clampInt(sessions.projectedMonth):Math.round(daily*daysInMonth);
  const normalized={propertyId,measurementId,timezone,sessions:{today:clampInt(sessions.today??body.sessionsToday),last24Hours:clampInt(sessions.last24Hours??body.sessions24h??sessions.today??body.sessionsToday),monthToDate:mtd,dailyAverageMTD:Number(daily.toFixed(2)),projectedMonth:projection},users:{today:clampInt(users.today??body.usersToday),activeToday:clampInt(users.activeToday??body.activeUsersToday),monthToDate:clampInt(users.monthToDate??body.usersMTD)},sources,observedAt:new Date(observedMs).toISOString()};
  const payloadHash=await sha256(JSON.stringify(normalized));
  await env.DB.prepare(`INSERT INTO ga4_make_snapshots(property_id,measurement_id,timezone,sessions_today,sessions_24h,sessions_mtd,users_today,active_users_today,users_mtd,daily_average_mtd,projected_month,sources_json,observed_at,payload_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(normalized.propertyId||null,normalized.measurementId,normalized.timezone,normalized.sessions.today,normalized.sessions.last24Hours,normalized.sessions.monthToDate,normalized.users.today,normalized.users.activeToday,normalized.users.monthToDate,normalized.sessions.dailyAverageMTD,normalized.sessions.projectedMonth,JSON.stringify(normalized.sources),normalized.observedAt,payloadHash).run();
  return Response.json({ok:true,accepted:true,observedAt:normalized.observedAt,payloadHash},{headers:JSON_H});
}
function acquisitionFromSnapshot(snapshot,configured){
  if(!snapshot)return {status:'unavailable',canonical:true,source:'Google Analytics 4 via Make',authMode:'make',reason:configured?'The Make GA4 bridge is configured but has not delivered its first snapshot yet.':'The Make GA4 bridge is not configured yet. Open /analytics/make-setup.',measurementId:DEFAULT_MEASUREMENT_ID,oauth:{configured:true,connected:true},fetchedAt:new Date().toISOString()};
  if(snapshot.ageMs>FRESH_MS)return {status:'unavailable',canonical:true,source:'Google Analytics 4 via Make',authMode:'make',reason:`The latest Make GA4 snapshot is stale (${Math.round(snapshot.ageMs/60000)} minutes old).`,propertyId:snapshot.row.property_id||null,measurementId:snapshot.row.measurement_id||DEFAULT_MEASUREMENT_ID,oauth:{configured:true,connected:true},fetchedAt:new Date().toISOString(),lastSnapshotAt:snapshot.row.received_at};
  return {status:'connected',canonical:true,source:'Google Analytics 4 via Make',authMode:'make',propertyId:snapshot.row.property_id||null,measurementId:snapshot.row.measurement_id||DEFAULT_MEASUREMENT_ID,timeZone:snapshot.row.timezone||DEFAULT_TIMEZONE,oauth:{configured:true,connected:true},sessions:{today:n(snapshot.row.sessions_today),last24Hours:n(snapshot.row.sessions_24h),monthToDate:n(snapshot.row.sessions_mtd),dailyAverageMTD:n(snapshot.row.daily_average_mtd),projectedMonth:n(snapshot.row.projected_month)},users:{today:n(snapshot.row.users_today),activeToday:n(snapshot.row.active_users_today),monthToDate:n(snapshot.row.users_mtd)},sources:snapshot.sources,fetchedAt:new Date().toISOString(),observedAt:snapshot.row.observed_at,receivedAt:snapshot.row.received_at,consentNote:'GA4 acquisition remains consent dependent. Make transports GA4 reporting data into ToolScout and does not redefine the GA4 reporting population.'};
}
function overwriteAcquisition(data,acquisition){
  const next={...data,acquisition};
  if(acquisition.status==='connected'){
    next.traffic={...(data.traffic||{}),today:acquisition.sessions.today,monthToDate:acquisition.sessions.monthToDate,dailyAverageMTD:acquisition.sessions.dailyAverageMTD,projectedMonth:acquisition.sessions.projectedMonth,canonicalSource:'ga4_via_make',population:'ga4_reporting_population'};
    next.tracking={...(data.tracking||{}),status:'connected',source:'ga4_via_make',canonicalSource:'ga4_via_make',humanSessionsLast24Hours:acquisition.sessions.last24Hours,legacyFieldSemantic:'ga4_sessions'};
  }else{
    next.traffic={...(data.traffic||{}),canonicalSource:'ga4_make_unavailable',canonicalUnavailable:true};
    next.tracking={...(data.tracking||{}),canonicalSource:'ga4_make_unavailable',canonicalUnavailable:true};
  }
  if(next.growthOps?.health){
    const prior=(next.growthOps.health.issues||[]).filter(i=>i?.code!=='ga4_acquisition_unavailable');
    next.growthOps={...next.growthOps,health:{...next.growthOps.health,acquisition:{status:acquisition.status,last_event_at:acquisition.receivedAt||acquisition.fetchedAt,detail:acquisition.status==='connected'?`GA4 canonical acquisition received through Make${acquisition.propertyId?` for property ${acquisition.propertyId}`:''}.`:`GA4 via Make unavailable: ${acquisition.reason}`},issues:[...prior,...(acquisition.status==='connected'?[]:[{severity:'bug',engine:'analytics',code:'ga4_acquisition_unavailable',title:'GA4 via Make unavailable',detail:acquisition.reason,url:'/analytics/make-setup'}])]}};
  }
  return next;
}
function setupPage(){return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout GA4 Make setup</title><style>body{font-family:system-ui;background:#0b0d0f;color:#f4f6f7;margin:0;padding:24px}main{max-width:720px;margin:auto}.card{background:#15191d;border:1px solid #2b3238;border-radius:16px;padding:20px;margin:16px 0}button{font:inherit;padding:12px 16px;border:0;border-radius:10px;font-weight:700}code,pre{white-space:pre-wrap;word-break:break-all;background:#0b0d0f;padding:10px;border-radius:8px;display:block}.muted{color:#a8b0b7}.ok{color:#b7ff37}</style></head><body><main><h1>GA4 via Make</h1><p class="muted">One connection in Make replaces Google Cloud OAuth setup in ToolScout.</p><div class="card"><h2>1. Generate bridge token</h2><p>This token can only submit GA4 snapshots. Generating a new one invalidates the old one.</p><button id="gen">Generate token</button><pre id="out">Token not generated yet.</pre></div><div class="card"><h2>2. Make endpoint</h2><code>https://trytoolscout.org/api/ga4/make-snapshot</code><p class="muted">In Make, connect Google Analytics 4 with your Google account, run the required reports, then send the normalized JSON to this endpoint using Authorization: Bearer &lt;token&gt;.</p></div><div class="card"><h2>3. Status</h2><pre id="status">Loading...</pre></div><p><a href="/analytics" style="color:#b7ff37">Back to Command Center</a></p></main><script>async function status(){const r=await fetch('/analytics/api/ga4-make/status',{credentials:'same-origin'});document.getElementById('status').textContent=JSON.stringify(await r.json(),null,2)}document.getElementById('gen').onclick=async()=>{const r=await fetch('/analytics/api/ga4-make/token',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'}});const j=await r.json();document.getElementById('out').textContent=j.ok?'TOKEN - copy this now:\n'+j.token+'\n\nEndpoint:\n'+j.ingestUrl:JSON.stringify(j,null,2);status()};status()</script></body></html>`,{headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'private, no-store'}})}
async function statusResponse(request,env,ctx){
  if(!(await ownerAuthenticated(request,ctx)))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const [config,snapshot]=await Promise.all([bridgeConfig(env),latestSnapshot(env)]);return Response.json({ok:true,configured:Boolean(config),latestSnapshot:snapshot?{receivedAt:snapshot.row.received_at,observedAt:snapshot.row.observed_at,ageMinutes:Number.isFinite(snapshot.ageMs)?Math.round(snapshot.ageMs/60000):null,fresh:snapshot.ageMs<=FRESH_MS,propertyId:snapshot.row.property_id||null,sessionsToday:n(snapshot.row.sessions_today),sessions24h:n(snapshot.row.sessions_24h),sessionsMTD:n(snapshot.row.sessions_mtd)}:null},{headers:JSON_H});
}
async function decoratePage(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();if(!response.ok||!type.includes('text/html'))return response;
  let html=await response.text();
  html=html.replaceAll('Google connection needs attention','Make GA4 bridge needs attention');
  html=html.replaceAll("a.authMode==='oauth'?'Google account':'service account'","a.authMode==='make'?'Make bridge':(a.authMode==='oauth'?'Google account':'service account')");
  html=html.replaceAll("a.authMode==='oauth'?'OAuth':'service account'","a.authMode==='make'?'Make bridge':(a.authMode==='oauth'?'OAuth':'service account')");
  html=html.replace('Acquisition & Outbound Truth</div>','Acquisition & Outbound Truth <a href="/analytics/make-setup" style="font-size:12px;margin-left:8px">Make setup</a></div>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
function dashboardPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/command-center'||path==='/command-center/'}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='POST'&&url.pathname==='/api/ga4/make-snapshot')return ingestSnapshot(request,env);
    if(request.method==='GET'&&url.pathname==='/analytics/make-setup')return (await ownerAuthenticated(request,ctx))?setupPage():new Response('Not found',{status:404});
    if(request.method==='POST'&&url.pathname==='/analytics/api/ga4-make/token')return generateToken(request,env,ctx);
    if(request.method==='DELETE'&&url.pathname==='/analytics/api/ga4-make/token')return revokeToken(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/ga4-make/status')return statusResponse(request,env,ctx);
    if(url.pathname.startsWith('/analytics/api/google/')||url.pathname==='/api/google-analytics/callback')return Response.json({ok:false,error:'deprecated_use_make_ga4_bridge',setup:'/analytics/make-setup'},{status:410,headers:JSON_H});
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats'){
      const upstream=await base.fetch(request,env,ctx);if(!upstream.ok)return upstream;
      let data;try{data=await upstream.json()}catch{return new Response('Command Center stats unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
      const [config,snapshot]=await Promise.all([bridgeConfig(env),latestSnapshot(env)]),acquisition=acquisitionFromSnapshot(snapshot,Boolean(config));
      return Response.json(overwriteAcquisition(data,acquisition),{headers:JSON_H});
    }
    const response=await base.fetch(request,env,ctx);
    return request.method==='GET'&&dashboardPath(url.pathname)?decoratePage(response):response;
  },
  async scheduled(event,env,ctx){return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined}
};
