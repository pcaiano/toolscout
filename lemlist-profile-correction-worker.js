import base from './visitor-dashboard-metrics-worker.js';

const PROFILE_PATH='/tools/lemlist';

function isHtml(response){
  return (response.headers.get('content-type')||'').toLowerCase().includes('text/html');
}

function updateLemlistProfile(html){
  let value=String(html||'');
  value=value.replace(
    '<p>Paid plans with trial options; See vendor for current pricing</p>',
    '<p><strong>Email:</strong> $69/mo, or $55/mo billed yearly, with unlimited users and 50,000 emails per month.</p><p><strong>Multichannel:</strong> $109/mo per user, or $87/mo billed yearly.</p><p><strong>Enterprise:</strong> custom pricing.</p><p><strong>Trial:</strong> 14 days. No free plan.</p><p><strong>Data and enrichment:</strong> 650M+ lead database with verified email enrichment from $0.05 per verified result.</p><p><strong>Recognition:</strong> 4.7/5 on G2 on lemlist current site and ranked #1 sales engagement platform in lemlist structured product information.</p>'
  );
  value=value.replace(
    '<span>AI prospecting</span>',
    '<span>AI prospecting</span><span>lemAgent</span><span>lemlist MCP</span><span>650M+ lead database</span><span>verified email enrichment</span>'
  );
  value=value.replaceAll(
    'The current ToolScout catalog does not record a free plan. Check the vendor for current offers.',
    'lemlist offers a 14-day free trial and no free plan in its current paid-plan lineup.'
  );
  value=value.replaceAll('2026-09-01','2026-09-15');
  return value;
}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  const html=updateLemlistProfile(await response.text());
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','public, max-age=60');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname===PROFILE_PATH)return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);
  }
};
