import {runResearchBatch} from './research-core.mjs';

const TOOLSCOUT_BASE_URL=(Deno.env.get('TOOLSCOUT_BASE_URL')||'https://trytoolscout.org').replace(/\/$/,'');
const MAX_CONCURRENCY=Math.max(1,Math.min(48,Number(Deno.env.get('MAX_CONCURRENCY')||24)));
const active=new Set<string>();
const recentCalls:number[]=[];

function j(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}})}
function rateAllowed(){
  const now=Date.now();
  while(recentCalls.length&&now-recentCalls[0]>60000)recentCalls.shift();
  if(recentCalls.length>=30)return false;
  recentCalls.push(now);return true;
}
async function runBatch(batchId:string){
  if(active.has(batchId))return;
  active.add(batchId);
  try{
    const payloadResponse=await fetch(`${TOOLSCOUT_BASE_URL}/api/compute/batches/${encodeURIComponent(batchId)}`,{headers:{'User-Agent':'ToolScout-Overflow-Deno/1.0','Accept':'application/json'},signal:AbortSignal.timeout(15000)});
    if(!payloadResponse.ok)throw new Error(`batch_fetch_http_${payloadResponse.status}`);
    const payload=await payloadResponse.json();
    const jobs=Array.isArray(payload.jobs)?payload.jobs:[];
    const results=await runResearchBatch(jobs,{concurrency:MAX_CONCURRENCY});
    const complete=await fetch(`${TOOLSCOUT_BASE_URL}/api/compute/batches/${encodeURIComponent(batchId)}/complete`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${payload.completionToken}`,'Content-Type':'application/json','User-Agent':'ToolScout-Overflow-Deno/1.0'},
      body:JSON.stringify({results,executor:'deno-overflow-v1'}),
      signal:AbortSignal.timeout(20000)
    });
    if(!complete.ok)throw new Error(`batch_complete_http_${complete.status}`);
  }catch(error){console.error(JSON.stringify({event:'batch_failed',batchId,error:String(error?.message||error)}))}
  finally{active.delete(batchId)}
}

Deno.serve(async req=>{
  const u=new URL(req.url);
  if(req.method==='GET'&&u.pathname==='/health')return j(200,{ok:true,service:'toolscout-overflow',runtime:'deno',activeBatches:active.size,maxConcurrency:MAX_CONCURRENCY});
  const m=u.pathname.match(/^\/tick\/(cob_[0-9a-f-]{36})$/i);
  if(req.method==='POST'&&m){
    if(!rateAllowed())return j(429,{ok:false,error:'rate_limited'});
    if(active.size>=4)return j(429,{ok:false,error:'worker_busy',activeBatches:active.size});
    EdgeRuntime.waitUntil(runBatch(m[1]));
    return j(202,{ok:true,accepted:true,batchId:m[1],activeBatches:active.size+1});
  }
  return j(404,{ok:false,error:'not_found'});
});
