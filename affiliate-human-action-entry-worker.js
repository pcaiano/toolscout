import base from './human-action-entry-worker.js';
import { recordAffiliateHumanAction } from './affiliate-human-action-state.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const PUBLIC_JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const HUMAN_PLATFORMS=new Set(['x','linkedin']);
const HUMAN_ACTIONS=new Set(['completed','skipped']);
const AUDIENCE_INGEST_TOKEN_SHA256='2cae5760a1a416aa3bbe14128c10539e157d527b1daa2f2a1df456c35099d770';
function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'}
async function digestHex(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function validSession(request,env){if(!env.ADMIN_TOKEN)return false;const cookie=request.headers.get('Cookie')||'';const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));if(!match)return false;const supplied=decodeURIComponent(match[1]);const bucket=sessionBucket();for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;return false}
async function validAudienceIngest(request){const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(token&&(await digestHex(token))===AUDIENCE_INGEST_TOKEN_SHA256)}
const safeText=(v,n=2000)=>String(v??'').slice(0,n);
function safeActionUrl(v,platform){try{const u=new URL(String(v||''));if(u.protocol!=='https:')return null;const h=u.hostname.toLowerCase().replace(/^www\./,'');if(platform==='linkedin'&&(h==='linkedin.com'||h.endsWith('.linkedin.com')))return u.toString();if(platform==='x'&&(h==='x.com'||h==='twitter.com'||h==='t.co'||h.endsWith('.x.com')||h.endsWith('.twitter.com')))return u.toString();return null}catch{return null}}

async function audienceSnapshot(env){
  try{
    const [counts,latestProfile,queue,byPlatform,latestDirective]=await Promise.all([
      env.DB.prepare(`SELECT SUM(CASE WHEN event_type IN ('outbound_reply','inbound_reply') AND status='published' THEN 1 ELSE 0 END) publishedReplies,SUM(CASE WHEN event_type='engagement_suggestion' AND status='suggested' THEN 1 ELSE 0 END) pendingSuggestions,SUM(CASE WHEN direction='outbound' AND status='published' THEN 1 ELSE 0 END) outboundActions,SUM(CASE WHEN direction='inbound' AND status='published' THEN 1 ELSE 0 END) inboundActions FROM audience_events WHERE created_at>=datetime('now','-30 days')`).first(),
      env.DB.prepare(`SELECT followers,impressions,reactions,replies,reposts,observed_at FROM audience_events WHERE event_type='profile_snapshot' ORDER BY created_at DESC LIMIT 1`).first(),
      env.DB.prepare(`SELECT event_id,platform,event_type AS type,actor_handle AS author,context_text AS context,suggestion_text AS suggestion,risk,status,post_uri,parent_uri,created_at FROM audience_events WHERE status='suggested' ORDER BY created_at DESC LIMIT 20`).all(),
      env.DB.prepare(`SELECT platform,SUM(CASE WHEN status='suggested' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) skipped,MAX(created_at) last_event_at FROM audience_events WHERE created_at>=datetime('now','-30 days') GROUP BY platform`).all(),
      env.DB.prepare(`SELECT suggestion_text,created_at FROM audience_events WHERE event_type='engagement_suggestion' AND content_id='editorial-directive' ORDER BY created_at DESC LIMIT 1`).first()
    ]);
    return {audienceGrowth:{status:'connected',followers:latestProfile?.followers??null,followersGained:null,humanSessions:null,commercialYield:null,publishedReplies:Number(counts?.publishedReplies||0),outboundActions:Number(counts?.outboundActions||0),inboundActions:Number(counts?.inboundActions||0),editorialDirective:latestDirective?.suggestion_text||null,observedAt:latestProfile?.observed_at||null},engagement:{status:'connected',pending:Number(counts?.pendingSuggestions||0),queue:queue?.results||[],byPlatform:(byPlatform?.results||[]).map(x=>({platform:String(x.platform||''),pending:Number(x.pending||0),published:Number(x.published||0),completed:Number(x.completed||0),skipped:Number(x.skipped||0),lastEventAt:x.last_event_at||null})),editorialDirective:latestDirective?.suggestion_text||null}};
  }catch(e){return {audienceGrowth:{status:'unavailable',reason:String(e?.message||e)},engagement:{status:'unavailable',queue:[],byPlatform:[]}}}
}

async function audienceHealth(env){
  try{
    const [totals,byPlatform,latest]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,SUM(CASE WHEN status='suggested' THEN 1 ELSE 0 END) suggested,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) skipped,MAX(created_at) last_event_at FROM audience_events`).first(),
      env.DB.prepare(`SELECT platform,COUNT(*) total,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,SUM(CASE WHEN status='suggested' THEN 1 ELSE 0 END) suggested,MAX(created_at) last_event_at FROM audience_events GROUP BY platform ORDER BY platform`).all(),
      env.DB.prepare(`SELECT platform,event_type,status,direction,created_at FROM audience_events ORDER BY created_at DESC LIMIT 1`).first()
    ]);
    return {ok:true,totals:{total:Number(totals?.total||0),published:Number(totals?.published||0),suggested:Number(totals?.suggested||0),completed:Number(totals?.completed||0),skipped:Number(totals?.skipped||0),lastEventAt:totals?.last_event_at||null},byPlatform:(byPlatform?.results||[]).map(x=>({platform:String(x.platform||''),total:Number(x.total||0),published:Number(x.published||0),suggested:Number(x.suggested||0),lastEventAt:x.last_event_at||null})),latest:latest?{platform:String(latest.platform||''),eventType:String(latest.event_type||''),status:String(latest.status||''),direction:String(latest.direction||''),createdAt:latest.created_at||null}:null};
  }catch(e){return {ok:false,error:'audience_health_unavailable',message:String(e?.message||e)}}
}

async function ingestAudienceSuggestion(request,env){
  if(!(await validAudienceIngest(request)))return Response.json({ok:false,error:'unauthorized'},{status:401,headers:JSON_H});
  let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H})}
  const platform=safeText(body.platform,30).toLowerCase();if(!HUMAN_PLATFORMS.has(platform))return Response.json({ok:false,error:'unsupported_platform'},{status:422,headers:JSON_H});
  const postUri=safeActionUrl(body.post_uri,platform),suggestion=safeText(body.suggestion_text,2000).trim(),context=safeText(body.context_text,2000).trim();if(!postUri||!suggestion||!context)return Response.json({ok:false,error:'invalid_suggestion'},{status:422,headers:JSON_H});
  const eventId=safeText(body.event_id,120)||`aud_${platform}_${crypto.randomUUID()}`,risk=['green','amber','red'].includes(String(body.risk))?String(body.risk):'amber';
  await env.DB.prepare(`INSERT INTO audience_events(event_id,platform,event_type,direction,status,actor_handle,post_uri,parent_uri,content_id,context_text,suggestion_text,risk,source,observed_at,created_at) VALUES(?,?,'engagement_suggestion','outbound','suggested',?,?,?,?,?,?,?,'audience-intelligence',datetime('now'),datetime('now')) ON CONFLICT(event_id) DO UPDATE SET actor_handle=excluded.actor_handle,post_uri=excluded.post_uri,context_text=excluded.context_text,suggestion_text=excluded.suggestion_text,risk=excluded.risk,observed_at=datetime('now') WHERE audience_events.status='suggested'`).bind(eventId,platform,safeText(body.actor_handle,120)||null,postUri,safeText(body.parent_uri,500)||null,safeText(body.content_id,120)||null,context,suggestion,risk).run();
  return Response.json({ok:true,event_id:eventId,status:'suggested'},{headers:JSON_H});
}

async function recordAudienceHumanAction(request,env){
  if(!(await validSession(request,env)))return Response.json({ok:false,error:'command_center_session_expired'},{status:401,headers:JSON_H});
  let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H})}
  const eventId=String(body.event_id||'').slice(0,120),action=String(body.action||'').toLowerCase();if(!eventId||!HUMAN_ACTIONS.has(action))return Response.json({ok:false,error:'invalid_action'},{status:400,headers:JSON_H});
  const row=await env.DB.prepare(`SELECT platform,status FROM audience_events WHERE event_id=? LIMIT 1`).bind(eventId).first();if(!row||!HUMAN_PLATFORMS.has(String(row.platform||'').toLowerCase()))return Response.json({ok:false,error:'audience_action_not_found'},{status:404,headers:JSON_H});
  if(String(row.status)!=='suggested')return Response.json({ok:true,event_id:eventId,status:String(row.status),unchanged:true},{headers:JSON_H});
  await env.DB.prepare(`UPDATE audience_events SET status=?,observed_at=datetime('now') WHERE event_id=? AND status='suggested'`).bind(action,eventId).run();return Response.json({ok:true,event_id:eventId,status:action},{headers:JSON_H});
}

async function augmentProtectedStats(request,env,ctx){const upstream=await base.fetch(request,env,ctx);if(!upstream.ok)return upstream;let data;try{data=await upstream.json()}catch{return upstream}return Response.json({...data,...await audienceSnapshot(env)},{headers:JSON_H})}

function recorderScript(){return `<script>(function(){function addButtons(){document.querySelectorAll('[data-human-open^="affiliate:"]').forEach(function(open){if(open.parentElement.querySelector('[data-affiliate-record]'))return;var id=(open.getAttribute('data-human-open')||'').split(':').slice(1).join(':');if(!id)return;['contacted','submitted'].forEach(function(event){var b=document.createElement('button');b.className='btn';b.type='button';b.setAttribute('data-affiliate-record',event);b.setAttribute('data-tool-slug',id);b.textContent=event==='contacted'?'Record contacted':'Record submitted';open.parentElement.appendChild(b)})})}function refreshSoon(){setTimeout(addButtons,150);setTimeout(addButtons,900)}document.addEventListener('click',function(e){var b=e.target.closest('[data-affiliate-record]');if(!b)return;var event=b.getAttribute('data-affiliate-record'),slug=b.getAttribute('data-tool-slug');if(!event||!slug)return;b.disabled=true;var old=b.textContent;b.textContent='Saving…';fetch('/analytics/api/affiliate-human-action',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool_slug:slug,event:event,evidence:'Confirmed from Command Center human action queue'})}).then(function(r){return r.json().then(function(d){if(!r.ok||!d.ok)throw new Error(d.error||'save_failed');return d})}).then(function(){b.textContent='Recorded';setTimeout(function(){var rb=document.getElementById('refreshHumanActions');if(rb)rb.click()},150)}).catch(function(){b.disabled=false;b.textContent='Save failed';setTimeout(function(){b.textContent=old},1800)})});var observer=new MutationObserver(refreshSoon);var root=document.getElementById('humanActionSection')||document.body;observer.observe(root,{childList:true,subtree:true});refreshSoon()})();</script>`}
function inject(html){if(html.includes('data-affiliate-record'))return html;return html.replace('</body>',recorderScript()+'</body>')}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/audience-health')return Response.json(await audienceHealth(env),{headers:PUBLIC_JSON_H});
    if(request.method==='GET'&&u.pathname==='/analytics/api/stats')return augmentProtectedStats(request,env,ctx);
    if(request.method==='POST'&&u.pathname==='/analytics/api/audience-action')return recordAudienceHumanAction(request,env);
    if(request.method==='POST'&&u.pathname==='/api/audience-suggestion')return ingestAudienceSuggestion(request,env);
    if(request.method==='POST'&&u.pathname==='/analytics/api/affiliate-human-action'){
      if(!(await validSession(request,env)))return Response.json({ok:false,error:'command_center_session_expired'},{status:401,headers:JSON_H});
      let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H})}
      const result=await recordAffiliateHumanAction(env,body);return Response.json(result,{status:result.ok?200:400,headers:JSON_H});
    }
    const r=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&analyticsPath(u.pathname)&&r.ok&&(r.headers.get('Content-Type')||'').includes('text/html')){const h=new Headers(r.headers);h.delete('Content-Length');h.set('Cache-Control','private, no-store');return new Response(inject(await r.text()),{status:r.status,headers:h})}
    return r;
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined}
};
