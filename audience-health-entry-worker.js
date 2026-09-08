import base from './audience-command-center-entry-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};

async function audienceHealth(env){
  try{
    const [totals,byPlatform,latest]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) total,
        SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,
        SUM(CASE WHEN status='suggested' THEN 1 ELSE 0 END) suggested,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
        SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) skipped,
        MAX(created_at) last_event_at
        FROM audience_events`).first(),
      env.DB.prepare(`SELECT platform,COUNT(*) total,
        SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,
        SUM(CASE WHEN status='suggested' THEN 1 ELSE 0 END) suggested,
        MAX(created_at) last_event_at
        FROM audience_events GROUP BY platform ORDER BY platform`).all(),
      env.DB.prepare(`SELECT platform,event_type,status,direction,created_at FROM audience_events ORDER BY created_at DESC LIMIT 1`).first()
    ]);
    return {
      ok:true,
      totals:{
        total:Number(totals?.total||0),published:Number(totals?.published||0),suggested:Number(totals?.suggested||0),completed:Number(totals?.completed||0),skipped:Number(totals?.skipped||0),lastEventAt:totals?.last_event_at||null
      },
      byPlatform:(byPlatform?.results||[]).map(x=>({platform:String(x.platform||''),total:Number(x.total||0),published:Number(x.published||0),suggested:Number(x.suggested||0),lastEventAt:x.last_event_at||null})),
      latest:latest?{platform:String(latest.platform||''),eventType:String(latest.event_type||''),status:String(latest.status||''),direction:String(latest.direction||''),createdAt:latest.created_at||null}:null
    };
  }catch(e){return {ok:false,error:'audience_health_unavailable',message:String(e?.message||e)};}
}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/audience-health')return Response.json(await audienceHealth(env),{headers:H});
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};
