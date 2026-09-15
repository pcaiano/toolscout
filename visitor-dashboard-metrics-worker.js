import base from './visitor-accuracy-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

function metricsScript(){
  return `<script data-toolscout-month-metrics="1">(function(){function renderMonthMetrics(d){var v=d?.visitors||{},t=d?.traffic||{};var mtdMeta=v.coverage?.monthToDateComplete?'Complete month-to-date unique visitor count':('Partial unique visitor count since '+(v.trackingSince?dt(v.trackingSince):'tracking activation'));var forecast=Number.isFinite(Number(t.projectedMonth))?Number(t.projectedMonth):null;var forecastMeta=forecast==null?'Waiting for enough visit data':'Projected visits based on current browser-session pace';var root=document.getElementById('northstarBody');if(root){var grid=root.querySelector('.metricGrid');if(grid&&!grid.querySelector('[data-month-metric="visitors-mtd"]')){grid.insertAdjacentHTML('beforeend','<div class="metric" data-month-metric="visitors-mtd"><small>Unique visitors · MTD</small><b>'+esc(num(v.monthToDate||0))+'</b><span>'+esc(mtdMeta)+'</span></div><div class="metric" data-month-metric="visit-forecast"><small>Projected visits · month</small><b>'+esc(forecast==null?'Unavailable':num(forecast))+'</b><span>'+esc(forecastMeta)+'</span></div>')}}var truth=document.getElementById('trafficTruthBody');if(truth){var grid2=truth.querySelector('.metricGrid');if(grid2&&!grid2.querySelector('[data-month-metric="visitors-mtd"]')){grid2.insertAdjacentHTML('beforeend','<div class="metric" data-month-metric="visitors-mtd"><small>Unique visitors MTD</small><b>'+esc(num(v.monthToDate||0))+'</b><span>'+esc(mtdMeta)+'</span></div><div class="metric" data-month-metric="visit-forecast"><small>Projected visits this month</small><b>'+esc(forecast==null?'Unavailable':num(forecast))+'</b><span>'+esc(forecastMeta)+'</span></div>')}}}var previous=window.render;if(typeof previous==='function')window.render=function(d){previous(d);renderMonthMetrics(d)};try{if(typeof snapshot!=='undefined'&&snapshot)renderMonthMetrics(snapshot)}catch(e){}})();</script>`;
}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-month-metrics="1"'))html=html.replace(/<\/body>/i,metricsScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/month-metrics-health')return Response.json({ok:true,service:'toolscout-month-metrics',version:1},{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);
  }
};
