import base from './affiliate-human-action-entry-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const HUMAN_PLATFORMS=new Set(['x','linkedin']);
const HUMAN_ACTIONS=new Set(['completed','skipped']);

async function digestHex(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000));}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`);}
async function validSession(request,env){if(!env.ADMIN_TOKEN)return false;const cookie=request.headers.get('Cookie')||'';const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));if(!match)return false;const supplied=decodeURIComponent(match[1]);const bucket=sessionBucket();for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;return false;}

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
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
        SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) skipped,
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
        status:'connected',followers:latestProfile?.followers??null,followersGained:null,humanSessions:null,commercialYield:null,
        publishedReplies:Number(counts?.publishedReplies||0),outboundActions:Number(counts?.outboundActions||0),inboundActions:Number(counts?.inboundActions||0),
        editorialDirective:latestDirective?.suggestion_text||null,observedAt:latestProfile?.observed_at||null
      },
      engagement:{
        status:'connected',pending:Number(counts?.pendingSuggestions||0),queue:queue?.results||[],
        byPlatform:(byPlatform?.results||[]).map(x=>({platform:String(x.platform||''),pending:Number(x.pending||0),published:Number(x.published||0),completed:Number(x.completed||0),skipped:Number(x.skipped||0),lastEventAt:x.last_event_at||null})),
        editorialDirective:latestDirective?.suggestion_text||null
      }
    };
  }catch(e){
    return {audienceGrowth:{status:'unavailable',reason:String(e?.message||e)},engagement:{status:'unavailable',queue:[],byPlatform:[]}};
  }
}

async function recordAudienceHumanAction(request,env){
  if(!(await validSession(request,env)))return Response.json({ok:false,error:'command_center_session_expired'},{status:401,headers:JSON_H});
  let body={};try{body=await request.json();}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H});}
  const eventId=String(body.event_id||'').slice(0,120),action=String(body.action||'').toLowerCase();
  if(!eventId||!HUMAN_ACTIONS.has(action))return Response.json({ok:false,error:'invalid_action'},{status:400,headers:JSON_H});
  const row=await env.DB.prepare(`SELECT platform,status FROM audience_events WHERE event_id=? LIMIT 1`).bind(eventId).first();
  if(!row||!HUMAN_PLATFORMS.has(String(row.platform||'').toLowerCase()))return Response.json({ok:false,error:'audience_action_not_found'},{status:404,headers:JSON_H});
  if(String(row.status)!=='suggested')return Response.json({ok:true,event_id:eventId,status:String(row.status),unchanged:true},{headers:JSON_H});
  await env.DB.prepare(`UPDATE audience_events SET status=?,observed_at=datetime('now') WHERE event_id=? AND status='suggested'`).bind(action,eventId).run();
  return Response.json({ok:true,event_id:eventId,status:action},{headers:JSON_H});
}

async function augmentProtectedStats(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json();}catch{return upstream;}
  const audience=await audienceSnapshot(env);
  return Response.json({...data,...audience},{headers:JSON_H});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return augmentProtectedStats(request,env,ctx);
    if(request.method==='POST'&&url.pathname==='/analytics/api/audience-action')return recordAudienceHumanAction(request,env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined;}
};
