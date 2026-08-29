import base from './worker.js';
import { renderOpportunityPage } from './seo-page.js';

const BASE = 'https://trytoolscout.org';

const xmlEscape = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const slugFromPath = pathname => { const match=pathname.match(/^\/([a-z0-9][a-z0-9-]*)\.html$/i); return match ? decodeURIComponent(match[1]) : null; };
async function staticAsset(request,env){ try { const response=await env.ASSETS.fetch(request); return response.ok?response:null; } catch { return null; } }
async function dynamicOpportunity(request,env,slug){
  const row=await env.DB.prepare("SELECT intent_slug,search_sessions,commercial_score,catalog_score,duplication_penalty,opportunity_score,status,updated_at FROM seo_opportunities WHERE intent_slug=? LIMIT 1").bind(slug).first();
  if(!row||!['ready','published'].includes(String(row.status))) return null;
  const toolsResponse=await env.ASSETS.fetch(new Request(new URL('/data/tools.json',request.url))); if(!toolsResponse.ok)return null;
  const html=renderOpportunityPage({slug,opportunity:row,tools:await toolsResponse.json()});
  return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=300, s-maxage=3600','X-ToolScout-Source':'dynamic-opportunity'}});
}
async function dynamicSitemap(request,env){
  const baseResponse=await staticAsset(new Request(new URL('/sitemap.xml',request.url)),env); const urls=new Set([BASE+'/']);
  if(baseResponse){const text=await baseResponse.text();for(const match of text.matchAll(/<loc>([^<]+)<\/loc>/g))urls.add(match[1]);}
  const rows=await env.DB.prepare("SELECT intent_slug FROM seo_opportunities WHERE status IN ('ready','published') ORDER BY opportunity_score DESC LIMIT 500").all();
  for(const row of rows.results||[]){const slug=String(row.intent_slug||'');if(/^[a-z0-9][a-z0-9-]*$/i.test(slug))urls.add(`${BASE}/${slug}.html`);}
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map(url=>`  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml,{status:200,headers:{'Content-Type':'application/xml; charset=UTF-8','Cache-Control':'public, max-age=300, s-maxage=3600'}});
}
async function contentSignals(request,env){
  const rows=await env.DB.prepare("SELECT intent_slug,COUNT(DISTINCT session_id) AS searches FROM search_events WHERE created_at >= datetime('now','-30 days') AND intent_slug IS NOT NULL AND intent_slug != 'general' GROUP BY intent_slug ORDER BY searches DESC, intent_slug ASC LIMIT 100").all();
  return Response.json({ok:true,window_days:30,signals:(rows.results||[]).map(r=>({intent_slug:String(r.intent_slug),searches:Number(r.searches||0)}))},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=300, s-maxage=900'}});
}
async function readAffiliateMap(request,env){
  try{
    const response=await env.ASSETS.fetch(new Request(new URL('/data/affiliate.json',request.url)));
    if(!response.ok)return {};
    return await response.json();
  }catch{return {};}
}
async function stats(request,env,ctx){
  const url=new URL(request.url);
  let accessAuthorized=false;
  try{
    if(url.hostname==='trytoolscout.org'&&ctx?.access){
      const identity=await ctx.access.getIdentity();
      accessAuthorized=Boolean(identity?.email);
    }
  }catch{}
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const legacyAuthorized=url.hostname!=='trytoolscout.org' && !!env.ADMIN_TOKEN && token===env.ADMIN_TOKEN;
  if(!accessAuthorized&&!legacyAuthorized)return Response.json({error:'unauthorized'},{status:401});

  const [byTool,byIntent,bySource,bySearchSource,total,searches,opportunities,dailyClicks,dailySearches,affiliate]=await Promise.all([
    env.DB.prepare('SELECT tool_slug,COUNT(*) AS clicks FROM click_events GROUP BY tool_slug ORDER BY clicks DESC LIMIT 20').all(),
    env.DB.prepare('SELECT intent_slug,COUNT(*) AS clicks FROM click_events GROUP BY intent_slug ORDER BY clicks DESC LIMIT 20').all(),
    env.DB.prepare("SELECT COALESCE(NULLIF(source,''),'direct') AS source,COUNT(*) AS clicks FROM click_events GROUP BY COALESCE(NULLIF(source,''),'direct') ORDER BY clicks DESC LIMIT 20").all(),
    env.DB.prepare("SELECT COALESCE(NULLIF(source,''),'direct') AS source,COUNT(DISTINCT session_id) AS searches FROM search_events WHERE created_at >= datetime('now','-30 days') GROUP BY COALESCE(NULLIF(source,''),'direct') ORDER BY searches DESC LIMIT 20").all(),
    env.DB.prepare('SELECT COUNT(*) AS clicks,COUNT(DISTINCT session_id) AS sessions FROM click_events').first(),
    env.DB.prepare('SELECT intent_slug,COUNT(DISTINCT session_id) AS searches FROM search_events GROUP BY intent_slug ORDER BY searches DESC LIMIT 20').all(),
    env.DB.prepare('SELECT intent_slug,search_sessions,commercial_score,catalog_score,duplication_penalty,opportunity_score,status FROM seo_opportunities ORDER BY opportunity_score DESC LIMIT 20').all(),
    env.DB.prepare("SELECT substr(created_at,1,10) AS day,COUNT(*) AS clicks FROM click_events WHERE created_at >= datetime('now','-30 days') GROUP BY substr(created_at,1,10) ORDER BY day ASC").all(),
    env.DB.prepare("SELECT substr(created_at,1,10) AS day,COUNT(DISTINCT session_id) AS searches FROM search_events WHERE created_at >= datetime('now','-30 days') GROUP BY substr(created_at,1,10) ORDER BY day ASC").all(),
    readAffiliateMap(request,env)
  ]);

  const tools=byTool.results||[];
  const activeSlugs=new Set(Object.entries(affiliate||{}).filter(([,entry])=>entry&&entry.enabled&&entry.url).map(([slug])=>slug));
  const monetizedClicks=tools.filter(row=>activeSlugs.has(String(row.tool_slug))).reduce((sum,row)=>sum+Number(row.clicks||0),0);
  const unmonetizedClicks=Number(total?.clicks||0)-monetizedClicks;
  const affiliateCoverage={catalogTools:Object.keys(affiliate||{}).length,activeTools:activeSlugs.size,toolsWithClicks:tools.length,monetizedClicks,unmonetizedClicks,activeToolSlugs:[...activeSlugs]};

  return Response.json({total,byTool,byIntent,bySource,bySearchSource,searches,opportunities,dailyClicks,dailySearches,affiliateCoverage},{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, max-age=60'}});
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/stats'&&request.method==='GET'){try{return await stats(request,env,ctx);}catch{return Response.json({error:'stats_failed'},{status:500});}}
    if(url.pathname==='/api/content-signals'&&request.method==='GET'){try{return await contentSignals(request,env);}catch{return Response.json({ok:false,signals:[]},{status:500});}}
    if(url.pathname==='/sitemap.xml'&&request.method==='GET'){try{return await dynamicSitemap(request,env);}catch{return base.fetch(request,env,ctx);}}
    if(url.pathname==='/robots.txt'&&request.method==='GET')return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`,{status:200,headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'public, max-age=300, s-maxage=3600'}});
    const slug=slugFromPath(url.pathname); if(slug){const staticResponse=await staticAsset(request,env);if(staticResponse)return staticResponse;const dynamicResponse=await dynamicOpportunity(request,env,slug);if(dynamicResponse)return dynamicResponse;}
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);}
};
