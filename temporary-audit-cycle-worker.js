import base from './mission-integrity-v2-worker.js';

const AUDIT_SHA256='872eaba13793c6b85087c204b325ce121bedb581439cde81a3631df267417327';
async function digestHex(value){const bytes=new TextEncoder().encode(String(value||''));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function authorized(request){const proof=String(request.headers.get('X-ToolScout-Audit')||'');return Boolean(proof)&&await digestHex(proof)===AUDIT_SHA256}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/internal-audit-cycle'&&request.method==='POST'){
      if(!await authorized(request))return Response.json({error:'unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
      const waits=[];
      const auditCtx={waitUntil(p){waits.push(Promise.resolve(p))},passThroughOnException(){}};
      try{
        if(typeof base.scheduled!=='function')return Response.json({error:'scheduled_handler_unavailable'},{status:500});
        await base.scheduled({cron:'15 * * * *',scheduledTime:Date.now()},env,auditCtx);
        const results=await Promise.allSettled(waits);
        return Response.json({ok:true,cron:'15 * * * *',waitUntilTasks:results.length,settled:results.map((r,i)=>({task:i+1,status:r.status,reason:r.status==='rejected'?String(r.reason?.message||r.reason):null}))},{headers:{'Cache-Control':'no-store'}});
      }catch(error){return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:{'Cache-Control':'no-store'}})}
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
