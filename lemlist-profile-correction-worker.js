import base from './visitor-dashboard-metrics-worker.js';

const PROFILE_PATH='/tools/lemlist';
const RSS_FEED='https://trytoolscout.org/feed.xml';
const RSS_HUB='https://pubsubhubbub.appspot.com/';
const RSS_LINK=`<link rel="alternate" type="application/rss+xml" title="ToolScout RSS" href="${RSS_FEED}">`;
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const safe=(value,n=500)=>String(value??'').slice(0,n);

function isHtml(response){
  return (response.headers.get('content-type')||'').toLowerCase().includes('text/html');
}

function shouldAdvertiseRss(pathname){
  return !pathname.startsWith('/admin')&&!pathname.startsWith('/analytics')&&!pathname.startsWith('/api/')&&!pathname.startsWith('/go/');
}

function addRssDiscovery(html){
  const value=String(html||'');
  if(/application\/rss\+xml/i.test(value))return value;
  return value.replace(/<\/head>/i,`${RSS_LINK}</head>`);
}

function updateLemlistProfile(html){
  let value=String(html||'');
  value=value.replace(
    '<p>Paid plans with trial options; See vendor for current pricing</p>',
    '<p><strong>Email:</strong> $69/mo, or $55/mo billed yearly, with unlimited users and 50,000 emails per month.</p><p><strong>Multichannel:</strong> $109/mo per user, or $87/mo billed yearly.</p><p><strong>Enterprise:</strong> custom pricing.</p><p><strong>Trial:</strong> 14 days. No free plan.</p><p><strong>Data and enrichment:</strong> 650M+ lead database with verified email enrichment from $0.05 per verified result.</p><p><strong>Recognition:</strong> 4.7/5 on G2 on lemlist current site and ranked #1 sales engagement platform in lemlist structured product information.</p>'
  );
  value=value.replace(
    '<span>AI prospecting</span>',
    '<span>AI prospecting</span><span>lemAgent</span><span>lemlist MCP</span><span>650M+ lead database</span><span>verified email enrichment</span>'
  );
  value=value.replaceAll(
    'The current ToolScout catalog does not record a free plan. Check the vendor for current offers.',
    'lemlist offers a 14-day free trial and no free plan in its current paid-plan lineup.'
  );
  value=value.replaceAll('2026-09-01','2026-09-15');
  return value;
}

async function decorateHtml(response,url){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(url.pathname===PROFILE_PATH)html=updateLemlistProfile(html);
  if(shouldAdvertiseRss(url.pathname))html=addRssDiscovery(html);
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  if(url.pathname===PROFILE_PATH)headers.set('Cache-Control','public, max-age=60');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function decorateFeed(response){
  if(!response.ok)return response;
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/rss+xml; charset=UTF-8');
  headers.set('Link',`<${RSS_FEED}>; rel="self"; type="application/rss+xml", <${RSS_HUB}>; rel="hub"`);
  headers.set('Cache-Control','public, max-age=300');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function authorized(request,env){
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);
}

async function sha256(text){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text||'')));
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function recordRssEvent(env,{eventType,status,destination,detail,httpStatus=null}){
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,asset_id,source_url,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(`rss_${crypto.randomUUID()}`,'rss',eventType,status,'syndication','feed.xml',RSS_FEED,destination||RSS_FEED,safe(`${detail}${httpStatus?` HTTP ${httpStatus}.`:''}`,1000)).run();
}

async function readFeed(env){
  const response=await env.ASSETS.fetch(new Request(RSS_FEED,{headers:{Accept:'application/rss+xml, application/xml;q=0.9, */*;q=0.1'}}));
  if(!response.ok)throw new Error(`feed_fetch_http_${response.status}`);
  const text=await response.text();
  if(!/<rss\b/i.test(text)||!/<channel>/i.test(text))throw new Error('feed_invalid_rss');
  return text;
}

async function publishRssIfChanged(env,{force=false,reason='scheduled'}={}){
  await env.DB.prepare(`INSERT OR IGNORE INTO distribution_rss_state(feed_url,created_at,updated_at) VALUES(?,datetime('now'),datetime('now'))`).bind(RSS_FEED).run();
  let feed;
  try{
    feed=await readFeed(env);
  }catch(error){
    const message=safe(error?.message||error,300);
    await env.DB.prepare(`UPDATE distribution_rss_state SET last_checked_at=datetime('now'),last_ping_status='feed_check_failed',last_error=?,updated_at=datetime('now') WHERE feed_url=?`).bind(message,RSS_FEED).run();
    await recordRssEvent(env,{eventType:'rss_feed_check',status:'failed',destination:RSS_FEED,detail:`RSS feed check failed. Trigger: ${reason}. ${message}`});
    return {ok:false,changed:false,pinged:false,error:message};
  }
  const digest=await sha256(feed);
  const state=await env.DB.prepare(`SELECT content_sha256,last_ping_at,last_ping_status,ping_count,change_count FROM distribution_rss_state WHERE feed_url=?`).bind(RSS_FEED).first();
  const changed=!state?.content_sha256||state.content_sha256!==digest;
  await env.DB.prepare(`UPDATE distribution_rss_state SET last_checked_at=datetime('now'),updated_at=datetime('now') WHERE feed_url=?`).bind(RSS_FEED).run();
  if(!changed&&!force)return {ok:true,changed:false,pinged:false,digest,last_ping_at:state?.last_ping_at||null,last_ping_status:state?.last_ping_status||null};

  const body=new URLSearchParams({'hub.mode':'publish','hub.url':RSS_FEED});
  let hubResponse=null,responseText='',errorMessage='';
  try{
    hubResponse=await fetch(RSS_HUB,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'follow'});
    responseText=safe(await hubResponse.text(),300);
    if(!hubResponse.ok)errorMessage=responseText||`hub_http_${hubResponse.status}`;
  }catch(error){
    errorMessage=safe(error?.message||error,300);
  }
  const ok=Boolean(hubResponse?.ok)&&!errorMessage;
  const httpStatus=hubResponse?.status||null;
  if(ok){
    if(changed){
      await env.DB.prepare(`UPDATE distribution_rss_state SET content_sha256=?,last_changed_at=datetime('now'),last_ping_at=datetime('now'),last_ping_status='completed',last_http_status=?,last_error=NULL,ping_count=ping_count+1,change_count=change_count+1,updated_at=datetime('now') WHERE feed_url=?`).bind(digest,httpStatus,RSS_FEED).run();
    }else{
      await env.DB.prepare(`UPDATE distribution_rss_state SET last_ping_at=datetime('now'),last_ping_status='completed',last_http_status=?,last_error=NULL,ping_count=ping_count+1,updated_at=datetime('now') WHERE feed_url=?`).bind(httpStatus,RSS_FEED).run();
    }
    await recordRssEvent(env,{eventType:'rss_websub_publish',status:'completed',destination:RSS_HUB,httpStatus,detail:`WebSub hub accepted ToolScout RSS publish notification. Trigger: ${reason}. Feed changed: ${changed?'yes':'no'}.`});
    return {ok:true,changed,pinged:true,digest,hub:RSS_HUB,http_status:httpStatus};
  }

  await env.DB.prepare(`UPDATE distribution_rss_state SET last_ping_at=datetime('now'),last_ping_status='failed',last_http_status=?,last_error=?,ping_count=ping_count+1,updated_at=datetime('now') WHERE feed_url=?`).bind(httpStatus,errorMessage||'websub_publish_failed',RSS_FEED).run();
  await recordRssEvent(env,{eventType:'rss_websub_publish',status:'failed',destination:RSS_HUB,httpStatus,detail:`WebSub publish notification failed. Trigger: ${reason}. ${errorMessage||'No response from hub.'}`});
  return {ok:false,changed,pinged:true,digest,hub:RSS_HUB,http_status:httpStatus,error:errorMessage||'websub_publish_failed'};
}

async function rssStatus(env){
  const state=await env.DB.prepare(`SELECT feed_url,content_sha256,last_checked_at,last_changed_at,last_ping_at,last_ping_status,last_http_status,last_error,ping_count,change_count,updated_at FROM distribution_rss_state WHERE feed_url=?`).bind(RSS_FEED).first();
  const events=await env.DB.prepare(`SELECT event_type,status,destination_url,detail,observed_at FROM distribution_events WHERE surface_slug='rss' ORDER BY created_at DESC LIMIT 10`).all();
  return {status:'connected',feed:RSS_FEED,hub:RSS_HUB,state:state||null,recent_events:events.results||[]};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/rss/status'&&request.method==='GET'){
      if(!(await authorized(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await rssStatus(env),{headers:JSON_H});
    }
    if(url.pathname==='/api/distribution/rss/publish'&&request.method==='POST'){
      if(!(await authorized(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await publishRssIfChanged(env,{force:true,reason:'manual'}),{headers:JSON_H});
    }
    const response=await base.fetch(request,env,ctx);
    if((request.method==='GET'||request.method==='HEAD')&&url.pathname==='/feed.xml')return decorateFeed(response);
    if(request.method==='GET'&&isHtml(response)&&shouldAdvertiseRss(url.pathname))return decorateHtml(response,url);
    if(request.method==='GET'&&url.pathname===PROFILE_PATH)return decorateHtml(response,url);
    return response;
  },
  async scheduled(event,env,ctx){
    if(typeof base.scheduled==='function')await base.scheduled(event,env,ctx);
    if(event?.cron==='15 * * * *')await publishRssIfChanged(env,{reason:'hourly'});
  }
};
