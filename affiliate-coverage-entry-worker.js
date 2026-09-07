import base from './distribution-impact-entry-worker.js';
import {runAffiliateCoverageCycle} from './affiliate-coverage-cycle-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
function authorized(request,env){const token=request.headers.get('Authorization')||'';return Boolean(env.ADMIN_TOKEN&&token===`Bearer ${env.ADMIN_TOKEN}`)}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(u.pathname==='/api/affiliate-coverage/run'){
      if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405,headers:JSON_H});
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await runAffiliateCoverageCycle(env),{headers:JSON_H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    if(base.scheduled)await base.scheduled(event,env,ctx);
    ctx.waitUntil(runAffiliateCoverageCycle(env).catch(()=>undefined));
  }
};
