import { classifySessionRequest, SESSION_CLASSIFICATIONS, SESSION_UPSERT_SQL } from './session-classification.js';

// Internal ASSETS reads remain available to the Worker; these URLs are not public.
export const privateAssetPaths = new Set([
  '/data/affiliate-pipeline.json',
  '/data/affiliate-queue.json',
  '/data/business-intelligence.json',
  '/data/business-intelligence-history.json',
]);

const SESSION_COOKIE='toolscout_session';
const SESSION_TTL_SECONDS=1800;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKABLE_CLASSIFICATIONS=new Set([SESSION_CLASSIFICATIONS.LIKELY_HUMAN,SESSION_CLASSIFICATIONS.OWNER]);

function cookieSession(request){
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if(!match)return null;
  try{const value=decodeURIComponent(match[1]);return UUID.test(value)?value:null}catch{return null}
}

function cleanSource(value){return String(value||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,100)}

function acquisition(request,url){
  const source=url.searchParams.get('source');
  const utm=['utm_source','utm_medium','utm_campaign'].map(k=>`${k}=${cleanSource(url.searchParams.get(k))}`).filter(x=>!x.endsWith('=')).join('&');
  if(utm)return cleanSource(utm);
  if(source)return cleanSource(source);
  const ref=request.headers.get('Referer')||request.headers.get('Referrer')||'';
  if(ref){
    try{
      const host=new URL(ref).hostname.replace(/^www\./,'').toLowerCase();
      if(host&&host!==url.hostname.replace(/^www\./,'').toLowerCase())return cleanSource(`ref:${host}`);
    }catch{}
  }
  return 'direct';
}

function referrerHost(request,url){
  const ref=request.headers.get('Referer')||request.headers.get('Referrer')||'';
  if(!ref)return null;
  try{
    const host=new URL(ref).hostname.replace(/^www\./,'').toLowerCase();
    return host&&host!==url.hostname.replace(/^www\./,'').toLowerCase()?host.slice(0,120):null;
  }catch{return null}
}

function publicHtmlRequest(request,url,response){
  if(request.method!=='GET'||response.status!==200)return false;
  const path=url.pathname;
  if(path.startsWith('/analytics')||path.startsWith('/api/')||path.startsWith('/go/')||path.startsWith('/data/')||path.startsWith('/reports/')||path.startsWith('/.well-known/'))return false;
  return (response.headers.get('Content-Type')||'').toLowerCase().includes('text/html');
}

function browserSessionSync(){
  return `<script>(function(){try{var m=document.cookie.match(/(?:^|;\\s*)toolscout_session=([^;]+)/);if(!m)return;var id=decodeURIComponent(m[1]);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return;var now=Date.now();localStorage.setItem('toolscout_session_v2',JSON.stringify({id:id,lastSeen:now}));sessionStorage.setItem('toolscout_started_'+id,'1')}catch(e){}})();</script>`;
}

async function withPageEntryTracking(request,env,ctx,response){
  const url=new URL(request.url);
  if(!publicHtmlRequest(request,url,response)||!env.DB)return response;
  const classification=classifySessionRequest(request);
  if(!TRACKABLE_CLASSIFICATIONS.has(classification))return response;
  const existing=cookieSession(request);
  const session=existing||crypto.randomUUID();
  const source=acquisition(request,url);
  const refHost=referrerHost(request,url);
  const ownerFlag=classification===SESSION_CLASSIFICATIONS.OWNER?1:0;
  const path=url.pathname.slice(0,200)||'/';
  const eventId=`start_${session}`;
  const write=env.DB.batch([
    env.DB.prepare(SESSION_UPSERT_SQL).bind(session,source,ownerFlag,classification),
    env.DB.prepare(`INSERT OR IGNORE INTO funnel_events (event_id,session_id,event_type,intent_slug,tool_slug,path,source,referrer_host,created_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).bind(eventId,session,'session_started',null,null,path,source,refHost)
  ]).catch(()=>undefined);
  if(ctx?.waitUntil)ctx.waitUntil(write);else await write;
  const headers=new Headers(response.headers);
  if(!existing)headers.append('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(session)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; SameSite=Lax; Secure`);
  const tracked=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  return new HTMLRewriter().on('head',{element(el){el.prepend(browserSessionSync(),{html:true})}}).transform(tracked);
}

export function withPrivateAssets(base) {
  return {
    ...base,
    async fetch(request, env, ctx) {
      let path;
      try { path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, ''); }
      catch { return new Response('Bad request', {status: 400}); }
      if (privateAssetPaths.has(path)) {
        return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
      }
      if (['/data/tools.json', '/data/pending-affiliate-tools.json'].includes(path)) {
        const asset = await env.ASSETS.fetch(request);
        if (!asset.ok) return asset;
        const tools = await asset.json();
        const publicTools = tools.map(({commission, affiliateProgram, affiliateUrl, ...tool}) => tool);
        return Response.json(publicTools, {headers: {'Cache-Control': 'no-store'}});
      }
      const response=await base.fetch(request,env,ctx);
      return withPageEntryTracking(request,env,ctx,response);
    },
  };
}
