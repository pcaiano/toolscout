import http from 'node:http';
import {runResearchBatch,runtimeStats} from './research-core.mjs';

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
async function runBatch(batchId,completionToken){
  if(active.has(batchId))return;
  active.add(batchId);
  try{
    const payloadResponse=await fetch(`${TOOLSCOUT_BASE_URL}/api/compute/batches/${encodeURIComponent(batchId)}`,{headers:{'User-Agent':'ToolScout-Overflow-Render/1.0','Accept':'application/json'},signal:AbortSignal.timeout(15000)});
    if(!payloadResponse.ok)throw new Error(`batch_fetch_http_${payloadResponse.status}`);
    const payload=await payloadResponse.json();
    const jobs=Array.isArray(payload.jobs)?payload.jobs:[];
    const results=await runResearchBatch(jobs,{concurrency:MAX_CONCURRENCY});
    for(let i=0;i<results.length;i++){
      const job=jobs[i],result=results[i];
      if(job?.type==='authorized_http_action'){
        console.log(JSON.stringify({
          event:'authorized_http_action_result',
          batchId,
          jobId:result?.jobId||job?.jobId||null,
          subjectKey:job?.subjectKey||null,
          endpoint:job?.payload?.endpoint||null,
          method:job?.payload?.method||null,
          ok:result?.ok===true,
          accepted:result?.accepted===true,
          httpStatus:Number(result?.httpStatus||0),
          resultError:result?.error||null,
          responseBody:String(result?.responseBody||'').slice(0,1200)
        }));
        continue;
      }
      if(job?.type!=='distribution_route_research')continue;
      const routes=Array.isArray(result?.routes)?result.routes.slice(0,8).map(route=>({
        url:route?.url||null,
        kind:route?.kind||null,
        submissionIntent:route?.submissionIntent===true,
        hasForm:Boolean(route?.hasForm),
        auth:Boolean(route?.auth),
        captcha:Boolean(route?.captcha),
        candidateKind:route?.machineCandidate?.kind||null,
        candidateConfidence:Number(route?.machineCandidate?.confidence||0),
        provenance:route?.provenance||null,
        explicitFormIntent:route?.formAssessment?.submissionIntentEvidence===true,
        spaScriptProbes:Number(route?.spaScriptProbes||0),
        transportHints:Array.isArray(route?.transportHints)?route.transportHints.slice(0,4):[],
        rejections:Array.isArray(route?.formAssessment?.rejections)?route.formAssessment.rejections.slice(0,8):[],
        rejectionDetails:Array.isArray(route?.formAssessment?.rejectionDetails)?route.formAssessment.rejectionDetails.slice(0,8):[]
      })):[];
      console.log(JSON.stringify({
        event:'distribution_classifier_result',
        batchId,
        jobId:result?.jobId||job?.jobId||null,
        subjectKey:job?.subjectKey||null,
        sourceUrl:job?.payload?.url||null,
        classification:result?.classification||null,
        httpStatus:Number(result?.httpStatus||0),
        resultError:result?.error||null,
        evidence:result?.evidence||null,
        routeSummary:result?.routeSummary||null,
        routes
      }));
    }
    const complete=await fetch(`${TOOLSCOUT_BASE_URL}/api/compute/batches/${encodeURIComponent(batchId)}/complete`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${completionToken}`,'Content-Type':'application/json','User-Agent':'ToolScout-Overflow-Render/1.0'},
      body:JSON.stringify({results,executor:'render-overflow-v1'}),
      signal:AbortSignal.timeout(45000)
    });
    if(!complete.ok)throw new Error(`batch_complete_http_${complete.status}`);
  }catch(error){
    console.error(JSON.stringify({event:'batch_failed',batchId,error:String(error?.message||error)}));
  }finally{active.delete(batchId)}
}

async function readJson(req,maxBytes=16384){
  let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>maxBytes)throw new Error('body_too_large')}
  if(!data)return{};return JSON.parse(data);
}


function safeToolScoutPath(value){
  const path=String(value||'').trim();
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('\\')||path.length>500)return null;
  try{
    const u=new URL(path,TOOLSCOUT_BASE_URL);
    if(u.origin!==new URL(TOOLSCOUT_BASE_URL).origin)return null;
    return u.pathname;
  }catch{return null}
}
async function fetchPublicHtml(pathname){
  const u=new URL(pathname,TOOLSCOUT_BASE_URL);
  u.searchParams.set('__ts_seo_external_probe',String(Date.now()));
  try{
    const r=await fetch(u,{
      headers:{
        'User-Agent':'ToolScout-SEO-External-Proof/1.0',
        'Cache-Control':'no-cache, no-store',
        'Pragma':'no-cache',
        'Accept':'text/html'
      },
      redirect:'follow',
      signal:AbortSignal.timeout(12000)
    });
    const type=String(r.headers.get('content-type')||'').toLowerCase();
    if(!r.ok||!type.includes('text/html'))return {ok:false,status:r.status,html:''};
    return {ok:true,status:r.status,html:await r.text()};
  }catch(error){
    return {ok:false,status:0,html:'',error:String(error?.message||error).slice(0,300)};
  }
}
async function seoProof(pathname,action){
  if(action==='strengthen_internal_links'){
    const hubs=['/guides','/tools','/compare'];
    const pages=await Promise.all(hubs.map(fetchPublicHtml));
    const evidence=pages.map((page,index)=>{
      const path=String(pathname);
      const linked=page.ok&&page.html.includes('data-toolscout-index-recovery-links="1"')&&(
        page.html.includes('href="'+path+'"')||page.html.includes("href='"+path+"'")
      );
      return {hub:hubs[index],ok:page.ok,status:page.status,linked,error:page.error||null};
    });
    const linkedHubs=evidence.filter(x=>x.linked).length;
    return {verified:linkedHubs>=2,action,pathname,linkedHubs,hubs:evidence,observer:'render-overflow'};
  }
  if(action==='deepen_existing_search_asset'){
    const page=await fetchPublicHtml(pathname);
    const marker=page.ok&&(page.html.includes('organic-growth:runtime-start')||page.html.includes('organic-growth:start'));
    const visibleText=page.ok?page.html
      .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
      .replace(/<[^>]+>/g,' ')
      .replace(/&[a-z0-9#]+;/gi,' ')
      .replace(/\s+/g,' ')
      .trim():'';
    const wordCount=visibleText?visibleText.split(/\s+/).filter(Boolean).length:0;
    const h2Count=page.ok?(page.html.match(/<h2\b/gi)||[]).length:0;
    const sectionCount=page.ok?(page.html.match(/<section\b/gi)||[]).length:0;
    const editorialSignal=page.ok&&/(ToolScout view|ToolScout analysis|Best for|trade-off|tradeoff|decision framework|editorial)/i.test(visibleText);
    const structuredDepth=page.ok&&wordCount>=300&&h2Count>=4&&sectionCount>=3&&editorialSignal;
    return {
      verified:Boolean(marker||structuredDepth),
      action,
      pathname,
      status:page.status,
      marker:Boolean(marker),
      structuredDepth:Boolean(structuredDepth),
      wordCount,
      h2Count,
      sectionCount,
      editorialSignal:Boolean(editorialSignal),
      proofPolicy:'runtime_marker_or_structured_editorial_depth_v2',
      error:page.error||null,
      observer:'render-overflow'
    };
  }
  return {verified:false,action,pathname,error:'unsupported_action',observer:'render-overflow'};
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'toolscout-overflow',runtime:'node',activeBatches:active.size,maxConcurrency:MAX_CONCURRENCY,...runtimeStats()});
  if(req.method==='GET'&&url.pathname==='/seo-proof'){
    const pathname=safeToolScoutPath(url.searchParams.get('path'));
    const action=String(url.searchParams.get('action')||'');
    if(!pathname)return json(res,400,{ok:false,verified:false,error:'invalid_path'});
    if(!['strengthen_internal_links','deepen_existing_search_asset'].includes(action))return json(res,400,{ok:false,verified:false,error:'unsupported_action'});
    const proof=await seoProof(pathname,action);
    return json(res,200,{ok:true,...proof});
  }
  const m=url.pathname.match(/^\/tick\/(cob_[0-9a-f-]{36})$/i);
  if(req.method==='POST'&&m){
    if(!rateAllowed())return json(res,429,{ok:false,error:'rate_limited'});
    if(!allowedBatchId(m[1]))return json(res,400,{ok:false,error:'invalid_batch_id'});
    if(active.size>=4)return json(res,429,{ok:false,error:'worker_busy',activeBatches:active.size});
    let body={};try{body=await readJson(req)}catch(error){return json(res,400,{ok:false,error:String(error?.message||'invalid_json')})}
    const completionToken=String(body?.completionToken||'');
    if(!/^[0-9a-f-]{36}\.[0-9a-f-]{36}$/i.test(completionToken))return json(res,400,{ok:false,error:'invalid_completion_capability'});
    void runBatch(m[1],completionToken);
    return json(res,202,{ok:true,accepted:true,batchId:m[1],activeBatches:active.size+1});
  }
  return json(res,404,{ok:false,error:'not_found'});
});

server.listen(PORT,'0.0.0.0',()=>console.log(JSON.stringify({event:'listening',port:PORT,maxConcurrency:MAX_CONCURRENCY,toolscout:TOOLSCOUT_BASE_URL})));
