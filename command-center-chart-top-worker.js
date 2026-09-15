import base from './command-center-autoload-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

function chartTopScript(){return `<script data-toolscout-chart-top="1">(function(){
function moveChartToTop(){
  var root=document.getElementById('trafficTruthBody');
  if(!root)return;
  var svg=root.querySelector('svg[aria-label="Traffic evolution over the last 30 days"]');
  var chart=svg&&svg.parentElement;
  if(chart&&root.firstElementChild!==chart)root.insertBefore(chart,root.firstElementChild);
}
var previous=window.render;
if(typeof previous==='function')window.render=function(d){var result=previous(d);moveChartToTop();return result};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(moveChartToTop,500)},{once:true});else setTimeout(moveChartToTop,500);
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-chart-top="1"'))html=html.replace(/<\/body>/i,chartTopScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-chart-health')return Response.json({ok:true,service:'toolscout-command-center-chart',version:1,chartPosition:'top'},{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
