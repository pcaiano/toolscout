import base from './affiliate-workflow-worker.js';

const TOOLSCOUT_BLUESKY_DID='did:plc:hjawfnxtifnuqcgidlvmas76';
const jsonHeaders={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const safeText=(v,n=1000)=>String(v??'').slice(0,n);
const publicVerifiedType=new Set(['outbound_reply','inbound_reply','content_published']);
const allowedStatus=new Set(['published','observed']);
const allowedRisk=new Set(['green','amber','red','none']);

async function verifyToolScoutBlueskyPost(uri){
  if(!uri||!String(uri).startsWith('at://'))return false;
  try{
    const endpoint=new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts');
    endpoint.searchParams.append('uris',String(uri));
    const res=await fetch(endpoint,{headers:{Accept:'application/json'}});
    if(!res.ok)return false;
    const body=await res.json();
    const post=Array.isArray(body.posts)?body.posts[0]:null;
    return Boolean(post&&post.uri===uri&&post.author?.did===TOOLSCOUT_BLUESKY_DID);
  }catch{return false;}
}

async function ingestAudienceEvent(request,env){
  let body={};
  try{body=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400,headers:jsonHeaders});}
  const platform=safeText(body.platform,30).toLowerCase();
  const eventType=safeText(body.event_type,50);
  const status=allowedStatus.has(String(body.status))?String(body.status):'observed';
  const risk=allowedRisk.has(String(body.risk))?String(body.risk):'none';
  const postUri=safeText(body.post_uri,500);
  if(platform!=='bluesky')return Response.json({error:'unsupported_platform'},{status:422,headers:jsonHeaders});
  if(!publicVerifiedType.has(eventType))return Response.json({error:'unsupported_public_event_type'},{status:422,headers:jsonHeaders});
  if(!(await verifyToolScoutBlueskyPost(postUri)))return Response.json({error:'unverified_toolscout_post'},{status:422,headers:jsonHeaders});
  const eventId=safeText(body.event_id,120)||`aud_${crypto.randomUUID()}`;
  try{
    await env.DB.prepare(`INSERT INTO audience_events(event_id,platform,event_type,direction,status,actor_handle,post_uri,parent_uri,content_id,context_text,suggestion_text,risk,followers,impressions,reactions,replies,reposts,source,observed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(event_id) DO NOTHING`)
      .bind(eventId,platform,eventType,safeText(body.direction,20)||null,status,safeText(body.actor_handle,120)||null,postUri||null,safeText(body.parent_uri,500)||null,safeText(body.content_id,120)||null,safeText(body.context_text,2000)||null,safeText(body.suggestion_text,2000)||null,risk,null,null,null,null,null,safeText(body.source,80)||'make',safeText(body.observed_at,80)||new Date().toISOString()).run();
    return Response.json({ok:true,event_id:eventId,verified:true},{headers:jsonHeaders});
  }catch(e){return Response.json({error:'audience_event_store_failed',message:String(e?.message||e)},{status:500,headers:jsonHeaders});}
}

async function audienceSnapshot(env){
  try{
    const [counts,latestProfile,queue,latestDirective]=await Promise.all([
      env.DB.prepare(`SELECT SUM(CASE WHEN event_type IN ('outbound_reply','inbound_reply') AND status='published' THEN 1 ELSE 0 END) publishedReplies, SUM(CASE WHEN event_type='engagement_suggestion' AND status='suggested' THEN 1 ELSE 0 END) pendingSuggestions, SUM(CASE WHEN direction='outbound' AND status='published' THEN 1 ELSE 0 END) outboundActions, SUM(CASE WHEN direction='inbound' AND status='published' THEN 1 ELSE 0 END) inboundActions FROM audience_events WHERE created_at>=datetime('now','-30 days')`).first(),
      env.DB.prepare(`SELECT followers,impressions,reactions,replies,reposts,observed_at FROM audience_events WHERE event_type='profile_snapshot' ORDER BY created_at DESC LIMIT 1`).first(),
      env.DB.prepare(`SELECT event_id,platform,event_type AS type,actor_handle AS author,context_text AS context,suggestion_text AS suggestion,risk,status,post_uri,parent_uri,created_at FROM audience_events WHERE status='suggested' ORDER BY created_at DESC LIMIT 20`).all(),
      env.DB.prepare(`SELECT suggestion_text,created_at FROM audience_events WHERE event_type='engagement_suggestion' AND content_id='editorial-directive' ORDER BY created_at DESC LIMIT 1`).first()
    ]);
    return {
      audienceGrowth:{status:'connected',followers:latestProfile?.followers??null,followersGained:null,humanSessions:null,commercialYield:null,publishedReplies:Number(counts?.publishedReplies||0),outboundActions:Number(counts?.outboundActions||0),inboundActions:Number(counts?.inboundActions||0),editorialDirective:latestDirective?.suggestion_text||null,observedAt:latestProfile?.observed_at||null},
      engagement:{status:'connected',pending:Number(counts?.pendingSuggestions||0),queue:queue?.results||[],editorialDirective:latestDirective?.suggestion_text||null}
    };
  }catch(e){return {audienceGrowth:{status:'unavailable',reason:String(e?.message||e)},engagement:{status:'unavailable',queue:[]}};}
}

async function augmentStats(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data={};
  try{data=await upstream.json();}catch{return upstream;}
  const audience=await audienceSnapshot(env);
  return Response.json({...data,...audience},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, max-age=60'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/audience-event'&&request.method==='POST')return ingestAudienceEvent(request,env);
    if(url.pathname==='/api/stats'&&request.method==='GET')return augmentStats(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(base.scheduled)return base.scheduled(event,env,ctx);}
};
