import base from './posthog-behavior-worker.js';
import { handleFirecrawlWebhook } from './firecrawl-monitor-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const FIRECRAWL_PATH='/api/affiliate-workflow/firecrawl';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===FIRECRAWL_PATH){
      if(request.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:JSON_H});
      return handleFirecrawlWebhook(request,env);
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined}
};