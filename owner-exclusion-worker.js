import base from './traffic-integrity-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const OWNER_MAX_AGE=31536000;

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
async function digestHex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function validSession(request,env){
  if(!env.ADMIN_TOKEN)return false;
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if(!match)return false;
  const supplied=decodeURIComponent(match[1]);
  const bucket=sessionBucket();
  for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;
  return false;
}
function hasOwnerCookie(request){
  return (request.headers.get('Cookie')||'').split(';').some(part=>part.trim()==='toolscout_owner=1');
}
function ownerCookie(){return `toolscout_owner=1; Max-Age=${OWNER_MAX_AGE}; Path=/; SameSite=Lax; Secure`}

async function ownerStatus(request,env){
  if(!await validSession(request,env))return Response.json({ok:false,excluded:false,reason:'unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  const wasPresent=hasOwnerCookie(request);
  const headers=new Headers({'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'});
  headers.append('Set-Cookie',ownerCookie());
  return new Response(JSON.stringify({
    ok:true,
    excluded:true,
    cookiePresentBefore:wasPresent,
    classification:'owner',
    scope:'this browser on this device',
    persistentDays:365,
    canonicalHumanTrafficExcluded:true,
    verifiedAt:new Date().toISOString()
  }),{status:200,headers});
}

function ownerScript(){return `<script data-toolscout-owner-exclusion="1">(function(){
if(window.__toolscoutOwnerExclusion)return;window.__toolscoutOwnerExclusion=true;
function row(state){
  var root=document.getElementById('healthBody');if(!root)return false;
  var old=document.getElementById('ownerExclusionRow');if(old)old.remove();
  var div=document.createElement('div');div.id='ownerExclusionRow';div.className='row';
  var active=state&&state.ok&&state.excluded&&state.cookiePresentBefore===true;
  var label=active?'Owner exclusion active on this browser':'Owner exclusion verification pending';
  var meta=active?'Persistent for 365 days. D1 classifies this browser as owner and excludes it from canonical human traffic.':'The Command Center is registering this browser as owner.';
  div.innerHTML='<div><div class="rowName">'+label+'</div><div class="rowMeta">'+meta+'</div></div><div class="rowValue">'+(active?'Active':'Pending')+'</div>';
  root.prepend(div);return true;
}
function show(state,n){if(row(state))return;if((n||0)<8)setTimeout(function(){show(state,(n||0)+1)},250)}
function verify(){
  fetch('/analytics/api/owner-exclusion',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(first){
    if(!first||!first.ok){show(first,0);return}
    setTimeout(function(){fetch('/analytics/api/owner-exclusion',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(second){show(second,0)}).catch(function(){show(first,0)})},80)
  }).catch(function(){show({ok:false},0)})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',verify,{once:true});else verify();
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-owner-exclusion="1"'))html=html.replace(/<\/body>/i,ownerScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.append('Set-Cookie',ownerCookie());
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/owner-exclusion')return ownerStatus(request,env);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
