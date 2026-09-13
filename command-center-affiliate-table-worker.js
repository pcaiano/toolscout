import base from './growth-command-center-v2-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const OWNER_EMAIL='pcaiano@gmail.com';
const LOCAL_LOGIN_PATHS=new Set(['/analytics/login','/analytics/login/']);
const LOCAL_LOGIN_TOKEN_HASH='3bda9f2e1083279e5d79e7025269f7a66e0cd90046d6692d02103f953c5831b0';
const LOCAL_LOGIN_EXPIRES_AT=1788972710;

async function digestHex(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
function safeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function hasValidSession(request,env){
  if(!env.ADMIN_TOKEN)return false;
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if(!match)return false;
  const supplied=decodeURIComponent(match[1]);
  const bucket=sessionBucket();
  for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;
  return false;
}
function cookieValue(request,name){
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?decodeURIComponent(match[1]):'';
}
function jwtPayload(jwt){
  try{
    const parts=String(jwt||'').split('.');
    if(parts.length!==3)return null;
    const body=parts[1].replace(/-/g,'+').replace(/_/g,'/');
    const padded=body+'='.repeat((4-body.length%4)%4);
    return JSON.parse(atob(padded));
  }catch{return null}
}
function accessIssuer(jwt){
  try{
    const iss=String(jwtPayload(jwt)?.iss||'');
    const url=new URL(iss);
    if(url.protocol!=='https:'||!url.hostname.toLowerCase().endsWith('.cloudflareaccess.com'))return '';
    return url.origin;
  }catch{return ''}
}
async function accessIdentityEmail(request){
  const jwt=request.headers.get('Cf-Access-Jwt-Assertion')||request.headers.get('cf-access-jwt-assertion')||cookieValue(request,'CF_Authorization');
  if(!jwt)return '';
  const issuer=accessIssuer(jwt);
  if(!issuer)return '';
  try{
    const response=await fetch(`${issuer}/cdn-cgi/access/get-identity`,{headers:{Cookie:`CF_Authorization=${jwt}`},redirect:'manual'});
    if(!response.ok)return '';
    const identity=await response.json();
    return String(identity?.email||'').toLowerCase();
  }catch{return ''}
}
async function requestWithTrustedSession(request,env){
  const headerEmail=String(request.headers.get('Cf-Access-Authenticated-User-Email')||request.headers.get('cf-access-authenticated-user-email')||'').toLowerCase();
  const sessionValid=await hasValidSession(request,env);
  const identityEmail=sessionValid?'':await accessIdentityEmail(request);
  const authenticated=sessionValid||headerEmail===OWNER_EMAIL||identityEmail===OWNER_EMAIL;
  if(!authenticated)return request;
  const headers=new Headers(request.headers);
  headers.set('Cf-Access-Authenticated-User-Email',OWNER_EMAIL);
  return new Request(request,{headers});
}

function affiliateWidget(){return `<section class="widget" data-widget="affiliate-status" style="--w:12;--h:6">
  <div class="widgetHead"><div><div class="widgetKicker">Affiliate · status · clicks</div><div class="widgetTitle">Affiliate Coverage Status</div></div><div class="widgetMeta">Browser-confirmed clicks · 30d</div></div>
  <div class="widgetBody" id="affiliateCoverageStatusBody"><div class="empty">Loading affiliate status…</div></div><div class="resizeHandle"></div>
</section>`}

function bootstrap(){return `<style>
.affiliateStatusTable{width:100%;border-collapse:collapse;font-size:12px}.affiliateStatusTable th,.affiliateStatusTable td{padding:9px 8px;border-top:1px solid var(--line);text-align:left}.affiliateStatusTable thead th{border-top:0;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.affiliateStatusTable th:last-child,.affiliateStatusTable td:last-child{text-align:right}.affiliateStatusSummary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
</style><script>
(function(){
  const API='/analytics/api/stats';
  const e=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const nn=v=>Number(v||0).toLocaleString();
  const sl=v=>String(v||'').replaceAll('_',' ');
  let bootLoading=false;
  function rg(g,label){return(Array.isArray(g?.items)?g.items:[]).map(x=>({name:x.name||x.slug||'',status:x.status||label,clicks:Number(x.clicks30d||0),group:label}))}
  function paintAffiliate(s){
    const root=document.getElementById('affiliateCoverageStatusBody');if(!root)return;
    if(!s||s.status!=='observed'){root.innerHTML='<div class="empty">Affiliate coverage status is temporarily unavailable.</div>';return}
    const order={active:0,pending:1,rejected:2};
    const rows=[...rg(s.active,'active'),...rg(s.pending,'pending'),...rg(s.rejected,'rejected')].sort((a,b)=>order[a.group]-order[b.group]||b.clicks-a.clicks||a.name.localeCompare(b.name));
    const summary='<div class="affiliateStatusSummary"><span class="pill good">Active '+nn(s.active?.count)+' · '+nn(s.active?.clicks30d)+' clicks</span><span class="pill info">Pending '+nn(s.pending?.count)+' · '+nn(s.pending?.clicks30d)+' clicks</span><span class="pill bad">Rejected '+nn(s.rejected?.count)+' · '+nn(s.rejected?.clicks30d)+' clicks</span></div>';
    const table=rows.length?'<table class="affiliateStatusTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Clicks</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+e(x.name)+'</td><td>'+e(sl(x.status))+'</td><td>'+nn(x.clicks)+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">No active, pending or rejected affiliate programmes found.</div>';
    root.innerHTML=summary+table;
  }
  async function bootstrapLoad(){
    if(bootLoading)return;bootLoading=true;
    const status=document.getElementById('status'),button=document.getElementById('refresh');
    if(status)status.innerHTML='<strong>Refreshing…</strong> Reading current engine state.';
    if(button)button.disabled=true;
    try{
      document.cookie='toolscout_owner=1; Max-Age=15552000; Path=/; SameSite=Lax; Secure';
      const r=await fetch(API+'?t='+Date.now(),{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw new Error('Command Center API returned HTTP '+r.status);
      const d=await r.json();
      if(typeof window.render==='function')window.render(d);
      paintAffiliate(d.affiliateCoverageStatus);
      if(status&&!status.textContent.includes('Updated'))status.innerHTML='<strong>Updated '+e(new Date().toLocaleString(undefined,{timeZone:'Europe/Lisbon'}))+'.</strong> Current operational snapshot.';
    }catch(err){if(status)status.innerHTML='<strong data-state="bad">Unable to refresh.</strong> '+e(err&&err.message?err.message:String(err));}
    finally{bootLoading=false;if(button)button.disabled=false}
  }
  function start(){setTimeout(bootstrapLoad,0);const button=document.getElementById('refresh');if(button)button.addEventListener('click',()=>setTimeout(bootstrapLoad,0));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
</script>`}

async function decoratePage(response){
  const type=response.headers.get('Content-Type')||'';
  if(!response.ok||!type.includes('text/html'))return response;
  let html=await response.text();
  html=html.replaceAll('Likely-human','Browser-confirmed').replaceAll('likely-human','browser-confirmed').replaceAll('—','-').replaceAll('–','-');
  html=html.replace('<div class="widgetMeta">Human only</div>','<div class="widgetMeta">Browser-confirmed</div>');
  if(!html.includes('data-widget="affiliate-status"')){
    const anchor='<section class="widget" data-widget="distribution"';
    html=html.replace(anchor,affiliateWidget()+'\n\n    '+anchor);
  }
  html=html.replace('<strong>Not loaded.</strong> Press Refresh data for a current operational snapshot.','<strong>Loading current data…</strong>');
  if(!html.includes('bootstrapLoad'))html=html.replace('</body>',bootstrap()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, max-age=0');headers.set('Pragma','no-cache');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function serveCanonicalPage(request,env,ctx){
  const trustedRequest=await requestWithTrustedSession(request,env);
  const trustedEmail=String(trustedRequest.headers.get('Cf-Access-Authenticated-User-Email')||'').toLowerCase();
  if(trustedEmail!==OWNER_EMAIL)return base.fetch(trustedRequest,env,ctx);
  if(!env.ADMIN_TOKEN)return new Response('Command Center unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  const assetRequest=new Request(new URL('/analytics-v2',request.url).toString(),{method:'GET',headers:trustedRequest.headers});
  const asset=await env.ASSETS.fetch(assetRequest);
  if(!asset.ok)return asset;
  const headers=new Headers(asset.headers);
  headers.set('Content-Type','text/html; charset=UTF-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.append('Set-Cookie',`${SESSION_COOKIE}=${await sessionValue(env.ADMIN_TOKEN,sessionBucket())}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  const response=new Response(await asset.text(),{status:asset.status,statusText:asset.statusText,headers});
  return decoratePage(response);
}

async function localOwnerLogin(request,env,ctx){
  if(!env.ADMIN_TOKEN)return new Response('Command Center unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  if(Math.floor(Date.now()/1000)>LOCAL_LOGIN_EXPIRES_AT)return new Response('Login link expired',{status:410,headers:{'Cache-Control':'no-store'}});
  const url=new URL(request.url);
  const supplied=await digestHex(url.searchParams.get('token')||'');
  if(!safeEqual(supplied,LOCAL_LOGIN_TOKEN_HASH))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const target=new URL('/analytics/',request.url);
  const headers=new Headers(request.headers);
  headers.set('Cf-Access-Authenticated-User-Email',OWNER_EMAIL);
  const authenticatedRequest=new Request(target.toString(),{method:'GET',headers});
  return serveCanonicalPage(authenticatedRequest,env,ctx);
}

export default {
  ...base,
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&LOCAL_LOGIN_PATHS.has(url.pathname))return localOwnerLogin(request,env,ctx);
    if(request.method!=='GET'||!ANALYTICS_PATHS.has(url.pathname))return base.fetch(request,env,ctx);
    return serveCanonicalPage(request,env,ctx);
  }
};