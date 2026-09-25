import http from 'node:http';
import {runResearchBatch} from './research-core.mjs';

const PORT=Number(process.env.PORT||10000);
const TOOLSCOUT_BASE_URL=String(process.env.TOOLSCOUT_BASE_URL||'https://trytoolscout.org').replace(/\/$/,'');
const MAX_CONCURRENCY=Math.max(1,Math.min(48,Number(process.env.MAX_CONCURRENCY||24)));
const active=new Set();
let recentCalls=[];

function json(res,status,body){const data=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(data)});res.end(data)}
function allowedBatchId(v){return /^cob_[0-9a-f-]{36}$/i.test(String(v||''))}
function rateAllowed(){
  const now=Date.now();recentCalls=recentCalls.filter(t=>now-t<60000);
  if(recentCalls.length>=30)return false;
  recentCalls.push(now);return true;
}
async function runBatch(batchId){
  if(active.has(batchId))return;
  active.add(batchId);
  try{
    const payloadResponse=await fetch(`${TOOLSCOUT_BASE_URL}/api/compute/batches/${encodeURIComponent(batchId)}`,{headers:{'User-Agent':'ToolScout-Overflow-Render/1.0','Accept':'application/json'},signal:AbortSignal.timeout(15000)});
    if(!payloadResponse.ok)throw new Error(`batch_fetch_http_${payloadResponse.status}`);
    const payload=await payloadResponse.json();
    const jobs=Array.isArray(payload.jobs)?payload.jobs:[];
    const results=await runResearchBatch(jobs,{concurrency:MAX_CONCURRENCY});
    const complete=await fetch(`${TOOLSCOUT_BASE_URL}/api/compute/batches/${encodeURIComponent(batchId)}/complete`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${payload.completionToken}`,'Content-Type':'application/json','User-Agent':'ToolScout-Overflow-Render/1.0'},
      body:JSON.stringify({results,executor:'render-overflow-v1'}),
      signal:AbortSignal.timeout(20000)
    });
    if(!complete.ok)throw new Error(`batch_complete_http_${complete.status}`);
  }catch(error){
    console.error(JSON.stringify({event:'batch_failed',batchId,error:String(error?.message||error)}));
  }finally{active.delete(batchId)}
}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'toolscout-overflow',runtime:'node',activeBatches:active.size,maxConcurrency:MAX_CONCURRENCY});
  const m=url.pathname.match(/^\/tick\/(cob_[0-9a-f-]{36})$/i);
  if(req.method==='POST'&&m){
    if(!rateAllowed())return json(res,429,{ok:false,error:'rate_limited'});
    if(!allowedBatchId(m[1]))return json(res,400,{ok:false,error:'invalid_batch_id'});
    if(active.size>=4)return json(res,429,{ok:false,error:'worker_busy',activeBatches:active.size});
    void runBatch(m[1]);
    return json(res,202,{ok:true,accepted:true,batchId:m[1],activeBatches:active.size+1});
  }
  return json(res,404,{ok:false,error:'not_found'});
});

server.listen(PORT,'0.0.0.0',()=>console.log(JSON.stringify({event:'listening',port:PORT,maxConcurrency:MAX_CONCURRENCY,toolscout:TOOLSCOUT_BASE_URL})));
