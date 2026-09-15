import base from './discovery-attribution-worker.js';

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/discovery-attribution-health'){
      return Response.json({ok:true,service:'toolscout-discovery-attribution',version:1,categories:['search','ai_referral','distribution','social','dark_direct_deep','direct_home','tracked_campaign','other_referral']},{headers:{'Cache-Control':'no-store'}});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};