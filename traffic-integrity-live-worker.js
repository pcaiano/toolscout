import base from './traffic-integrity-guard-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

function lateVisitorRetryScript(){return `<script data-toolscout-confirmed-visitor-late-retry="1">(function(){try{if(window.__toolscoutConfirmedVisitorLateRetry)return;window.__toolscoutConfirmedVisitorLateRetry=true;var uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function clean(v,n){return String(v||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,n||100)}function payload(){var v=null,s=null;try{v=JSON.parse(localStorage.getItem('toolscout_visitor_v1')||'null');s=JSON.parse(localStorage.getItem('toolscout_session_v2')||'null')}catch(e){}if(!v||!s||!uuid.test(String(v.id||''))||!uuid.test(String(s.id||'')))return null;var source='direct',refHost=null;try{var q=new URLSearchParams(location.search),utm=['utm_source','utm_medium','utm_campaign'].map(function(k){var x=clean(q.get(k));return x?k+'='+x:''}).filter(Boolean).join('&');if(utm)source=clean(utm);else if(q.get('source'))source=clean(q.get('source'));else if(document.referrer){var u=new URL(document.referrer),h=u.hostname.replace(/^www\\./,'');if(h&&h!==location.hostname){refHost=h.slice(0,120);source=clean('ref:'+h)}}}catch(e){}return {visitor_id:v.id,session_id:s.id,path:location.pathname.slice(0,200)||'/',source:source,referrer_host:refHost}}function send(n){var p=payload();if(!p){if(n<12)setTimeout(function(){send(n+1)},500);return}fetch('/api/confirmed-visitor',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify(p)}).then(function(r){if(!r.ok&&n<12)setTimeout(function(){send(n+1)},500)}).catch(function(){if(n<12)setTimeout(function(){send(n+1)},500)})}setTimeout(function(){send(0)},2600)}catch(e){}})();</script>`}

function commandCenterRefreshScript(){return `<script data-toolscout-command-center-live-refresh="1">(function(){try{if(window.__toolscoutCommandCenterLiveRefresh)return;window.__toolscoutCommandCenterLiveRefresh=true;function refresh(){if(document.hidden)return;var b=document.getElementById('refresh');if(b&&!b.disabled)b.click()}setInterval(refresh,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(refresh,250)})}catch(e){}})();</script>`}

async function decorate(response,isAnalytics){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  const script=isAnalytics?commandCenterRefreshScript():lateVisitorRetryScript();
  const marker=isAnalytics?'data-toolscout-command-center-live-refresh="1"':'data-toolscout-confirmed-visitor-late-retry="1"';
  if(!html.includes(marker))html=html.replace(/<\/body>/i,script+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control',isAnalytics?'private, no-store, max-age=0':headers.get('Cache-Control')||'public, max-age=0, must-revalidate');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response,true);
    if(request.method==='GET'&&url.hostname==='trytoolscout.org'&&isHtml(response))return decorate(response,false);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
