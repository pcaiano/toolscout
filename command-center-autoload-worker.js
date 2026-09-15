import base from './command-center-truth-consolidation-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

function autoloadScript(){return `<script data-toolscout-command-autoload="1">(function(){
if(window.__toolscoutCommandAutoloadInstalled)return;
window.__toolscoutCommandAutoloadInstalled=true;
var running=false;
function needsLoad(){
  var status=document.getElementById('status');
  if(status&&/Updated\s/i.test(status.textContent||''))return false;
  var bodies=[].slice.call(document.querySelectorAll('.widgetBody'));
  return bodies.some(function(el){return /Refresh to load|Loading current data|Refresh to reconcile|Refresh to load current/i.test(el.textContent||'')})||!bodies.length;
}
async function loadCommandCenter(){
  if(running)return;running=true;
  var status=document.getElementById('status'),button=document.getElementById('refresh');
  try{
    if(status)status.innerHTML='<strong>Refreshing...</strong> Reading current engine state.';
    if(button)button.disabled=true;
    document.cookie='toolscout_owner=1; Max-Age=15552000; Path=/; SameSite=Lax; Secure';
    var response=await fetch('/analytics/api/stats?t='+Date.now(),{credentials:'same-origin',cache:'no-store'});
    if(response.status===401)throw new Error('Secure Command Center session expired. Reload this page.');
    if(!response.ok)throw new Error('Command Center API returned HTTP '+response.status);
    var data=await response.json();
    if(typeof window.render!=='function')throw new Error('Command Center renderer unavailable.');
    window.render(data);
  }catch(error){
    if(status)status.innerHTML='<strong data-state="bad">Unable to refresh.</strong> '+String(error&&error.message||error);
  }finally{
    running=false;if(button)button.disabled=false;
  }
}
function start(){setTimeout(function(){if(needsLoad())loadCommandCenter()},300)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-command-autoload="1"'))html=html.replace(/<\/body>/i,autoloadScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-autoload-health')return Response.json({ok:true,service:'toolscout-command-center-autoload',version:1,autoload:true},{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
