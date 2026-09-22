import base from './gsc-command-center-trend-worker.js';

function headers(response){const h=new Headers(response.headers);h.set('Content-Type','application/json; charset=UTF-8');h.set('Cache-Control','private, no-store, max-age=0');h.delete('Content-Length');h.delete('Content-Encoding');return h}
function isCatalogBatchWarning(issue){const t=[issue?.engine,issue?.title,issue?.detail,issue?.code].filter(Boolean).join(' ').toLowerCase();return t.includes('catalog')&&t.includes('latest_catalog_batch_all_warnings')}
async function improveStats(response){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const rt=d?.growthOps?.catalogRuntimeQuality,e=rt?.evidence||{};
  if(d?.growthOps?.health&&Array.isArray(d.growthOps.health.issues)){
    d.growthOps.health.issues=d.growthOps.health.issues.map(issue=>{
      if(!isCatalogBatchWarning(issue))return issue;
      const checked=Number(e.checked||0),warnings=Number(e.warnings||0),changed=Number(e.changed||0),suppressed=Number(e.suppressed||0),retry=Number(e.warning_retry_hours||6);
      return {...issue,severity:'warning',title:'Catalog source check needs retry',detail:`Latest due-only catalog batch checked ${checked} official source${checked===1?'':'s'}: ${warnings} warning${warnings===1?'':'s'}, ${changed} changed, ${suppressed} suppressed. Runtime quality mission completed and the warning retry policy is ${retry}h.`};
    });
  }
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:headers(response)});
}
export default{
  async fetch(request,env,ctx){const url=new URL(request.url),response=await base.fetch(request,env,ctx);if(request.method==='GET'&&(url.pathname==='/analytics/api/stats'||url.pathname==='/api/stats'))return improveStats(response);return response},
  async scheduled(event,env,ctx){return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined}
};