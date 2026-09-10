import base from './command-center-affiliate-table-worker.js';
import { withPrivateAssets } from './private-assets.js';

const WATCHLIST_QUEUE_BLOCK=new Set(['airtable','klaviyo']);
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};

async function filteredHumanActions(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;
  try{data=await upstream.json()}catch{return upstream}
  const blocked=new Set(WATCHLIST_QUEUE_BLOCK);
  try{
    const result=await env.DB.prepare(`SELECT tool_slug FROM affiliate_workflow WHERE status='watchlist'`).all();
    for(const row of result?.results||[])blocked.add(String(row.tool_slug||'').trim().toLowerCase());
  }catch{}
  const affiliate=(Array.isArray(data.affiliate)?data.affiliate:[]).filter(item=>!blocked.has(String(item.id||item.tool_slug||'').trim().toLowerCase()));
  const distribution=Array.isArray(data.distribution)?data.distribution:[];
  return Response.json({...data,affiliate,distribution,total:affiliate.length+distribution.length},{headers:JSON_H});
}

const filteredBase={
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/human-actions')return filteredHumanActions(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return base.scheduled?base.scheduled(event,env,ctx):undefined;
  }
};

export default withPrivateAssets(filteredBase);
