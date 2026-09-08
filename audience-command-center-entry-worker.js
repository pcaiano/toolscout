import base from './affiliate-human-action-entry-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};

async function audienceSnapshot(env){
  try{
    const [counts,latestProfile,queue,byPlatform,latestDirective]=await Promise.all([
      env.DB.prepare(`SELECT
        SUM(CASE WHEN event_type IN ('outbound_reply','inbound_reply') AND status='published' THEN 1 ELSE 0 END) publishedReplies,
        SUM(CASE WHEN event_type='engagement_suggestion' AND status='suggested' THEN 1 ELSE 0 END) pendingSuggestions,
        SUM(CASE WHEN direction='outbound' AND status='published' THEN 1 ELSE 0 END) outboundActions,
        SUM(CASE WHEN direction='inbound' AND status='published' THEN 1 ELSE 0 END) inboundActions
        FROM audience_events WHERE created_at>=datetime('now','-30 days')`).first(),
      env.DB.prepare(`SELECT followers,impressions,reactions,replies,reposts,observed_at
        FROM audience_events WHERE event_type='profile_snapshot'
        ORDER BY created_at DESC LIMIT 1`).first(),
      env.DB.prepare(`SELECT event_id,platform,event_type AS type,actor_handle AS author,context_text AS context,
        suggestion_text AS suggestion,risk,status,post_uri,parent_uri,created_at
        FROM audience_events WHERE status='suggested'
        ORDER BY created_at DESC LIMIT 20`).all(),
      env.DB.prepare(`SELECT platform,
        SUM(CASE WHEN status='suggested' THEN 1 ELSE 0 END) pending,
        SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,
        MAX(created_at) last_event_at
        FROM audience_events
        WHERE created_at>=datetime('now','-30 days')
        GROUP BY platform`).all(),
      env.DB.prepare(`SELECT suggestion_text,created_at FROM audience_events
        WHERE event_type='engagement_suggestion' AND content_id='editorial-directive'
        ORDER BY created_at DESC LIMIT 1`).first()
    ]);
    return {
      audienceGrowth:{
        status:'connected',
        followers:latestProfile?.followers??null,
        followersGained:null,
        humanSessions:null,
        commercialYield:null,
        publishedReplies:Number(counts?.publishedReplies||0),
        outboundActions:Number(counts?.outboundActions||0),
        inboundActions:Number(counts?.inboundActions||0),
        editorialDirective:latestDirective?.suggestion_text||null,
        observedAt:latestProfile?.observed_at||null
      },
      engagement:{
        status:'connected',
        pending:Number(counts?.pendingSuggestions||0),
        queue:queue?.results||[],
        byPlatform:(byPlatform?.results||[]).map(x=>({platform:String(x.platform||''),pending:Number(x.pending||0),published:Number(x.published||0),lastEventAt:x.last_event_at||null})),
        editorialDirective:latestDirective?.suggestion_text||null
      }
    };
  }catch(e){
    return {audienceGrowth:{status:'unavailable',reason:String(e?.message||e)},engagement:{status:'unavailable',queue:[],byPlatform:[]}};
  }
}

async function augmentProtectedStats(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;
  try{data=await upstream.json();}catch{return upstream;}
  const audience=await audienceSnapshot(env);
  return Response.json({...data,...audience},{headers:JSON_H});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return augmentProtectedStats(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};
