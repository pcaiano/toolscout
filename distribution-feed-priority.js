const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=900'};
const XML_HEADERS={'Content-Type':'application/rss+xml; charset=UTF-8','Cache-Control':'public, max-age=900'};
const SPRINT_START=Date.parse('2026-09-18T23:00:00.000Z');
const SPRINT_END=Date.parse('2026-09-28T23:00:00.000Z');
const SPRINT_PATHS=Object.freeze([
  '/best-project-management-tools',
  '/best-seo-tools-for-agencies',
  '/best-no-code-automation-tools',
  '/tools/semrush',
  '/tools/airtable',
  '/best-funnel-builder'
]);
function sprintActive(now=Date.now()){return now>=SPRINT_START&&now<SPRINT_END;}
const esc=s=>String(s??'').replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[m]));
async function assetJson(request,env,path,fallback){try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback;}catch{return fallback;}}
function cleanUrl(value){try{const u=new URL(String(value));u.protocol='https:';u.hostname='trytoolscout.org';u.search='';u.hash='';u.pathname=u.pathname.replace(/\.html$/i,'');if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,'');return u.toString();}catch{return null;}}
function label(url){try{const p=new URL(url).pathname.split('/').filter(Boolean).pop()||'toolscout';return p.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}catch{return 'ToolScout';}}
export async function prioritizedDistributionFeed(request,env,format='json'){
  const [routing,sitemap]=await Promise.all([assetJson(request,env,'/data/search-commercial-routing.json',{priorities:[]}),env.ASSETS.fetch(new Request(new URL('/sitemap.xml',request.url)))]);
  const sprint=sprintActive()?SPRINT_PATHS.map(x=>cleanUrl('https://trytoolscout.org'+x)).filter(Boolean):[];
  const priority=(routing.priorities||[]).filter(x=>x?.page&&['guide','comparison','tool-profile'].includes(x.type)).sort((a,b)=>Number(b.priorityScore||0)-Number(a.priorityScore||0)).map(x=>cleanUrl(x.page)).filter(Boolean);
  let rest=[];
  if(sitemap.ok){const xml=await sitemap.text();rest=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>cleanUrl(m[1])).filter(Boolean).filter(u=>/(best-|\-vs-|alternatives|\/tools\/|compare)/i.test(u));}
  const sprintSet=new Set(sprint),prioritySet=new Set(priority),urls=[...new Set([...sprint,...priority,...rest])].slice(0,100);
  const items=urls.map(url=>({id:url,url,title:label(url),date_modified:new Date().toISOString(),toolscout_priority:sprintSet.has(url)?'human-acquisition-sprint':(prioritySet.has(url)?'gsc-observed':'catalog')}));
  if(format==='xml'){
    const body=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ToolScout Decision Feed</title><link>https://trytoolscout.org/</link><description>Independent software comparisons and decision resources from ToolScout. Pages with observed search demand are ordered first.</description>${items.map(i=>`<item><guid isPermaLink="true">${esc(i.url)}</guid><title>${esc(i.title)}</title><link>${esc(i.url)}</link><pubDate>${new Date(i.date_modified).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
    return new Response(body,{headers:XML_HEADERS});
  }
  return Response.json({version:'https://jsonfeed.org/version/1.1',title:'ToolScout Decision Feed',home_page_url:'https://trytoolscout.org/',feed_url:'https://trytoolscout.org/api/distribution/feed.json',description:'Independent ToolScout comparisons, best-of pages and software decision resources for syndication. Human Acquisition Sprint targets are ordered first while the sprint is active, followed by pages with observed search demand.',items},{headers:JSON_HEADERS});
}
