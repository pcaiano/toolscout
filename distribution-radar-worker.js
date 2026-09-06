import base from './distribution-engine-worker.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const XML_HEADERS={'Content-Type':'application/rss+xml; charset=UTF-8','Cache-Control':'public, max-age=900'};
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
const escXml=s=>String(s??'').replace(/[<>&"']/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[m]));

async function assetJson(request,env,path,fallback){try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback;}catch{return fallback;}}

function scoreOpportunity(x){
  const costPenalty=Math.min(20,Math.max(0,Number(x.cost)||0)/10);
  const effort=clamp(x.effort??x.effort_cost??40);
  const weighted=
    clamp(x.audience_fit)*0.20+
    clamp(x.authority)*0.15+
    clamp(x.traffic_potential)*0.20+
    clamp(x.backlink_value)*0.10+
    clamp(x.acceptance_probability)*0.15+
    clamp(x.automation_potential)*0.15+
    (100-effort)*0.05-costPenalty;
  return Math.max(0,Math.min(100,Number(weighted.toFixed(1))));
}

function deriveConfigured(item){
  const priority=String(item.priority||'medium');
  const type=String(item.type||'');
  const status=String(item.status||'research_required');
  const audience=/newsletter|ai_directory|software_directory|launch|community|syndication/i.test(type)?78:65;
  const authority=/product-hunt|alternativeto|saashub|sourceforge|g2|capterra/i.test(item.slug)?82:62;
  const traffic=/newsletter|launch|community/i.test(type)?74:58;
  const backlink=/directory|editorial|newsletter|syndication/i.test(type)?72:48;
  const acceptance=['live','scheduled','submitted','pending_review'].includes(status)?85:(status==='ready_to_submit'?70:48);
  const automation=item.requires_signup?45:72;
  const effort=item.requires_signup?48:28;
  return {...item,audience_fit:audience,authority,traffic_potential:traffic,backlink_value:backlink,acceptance_probability:acceptance,automation_potential:automation,effort,distribution_score:priority==='high'?Math.max(78,scoreOpportunity({audience_fit:audience,authority,traffic_potential:traffic,backlink_value:backlink,acceptance_probability:acceptance,automation_potential:automation,effort})):scoreOpportunity({audience_fit:audience,authority,traffic_potential:traffic,backlink_value:backlink,acceptance_probability:acceptance,automation_potential:automation,effort})};
}

async function refreshRadar(request,env){
  const [seedData,workflowData,existingRows]=await Promise.all([
    assetJson(request,env,'/data/distribution-radar-seeds.json',{sources:[]}),
    assetJson(request,env,'/data/distribution-workflow.json',{items:[]}),
    env.DB.prepare('SELECT surface_slug,status FROM distribution_opportunities').all()
  ]);
  const existing=new Map((existingRows.results||[]).map(x=>[String(x.surface_slug),String(x.status||'candidate')]));
  const candidates=[...(workflowData.items||[]).map(deriveConfigured),...(seedData.sources||[]).map(x=>({...x,distribution_score:scoreOpportunity(x),status:x.status||'candidate'}))];
  let discovered=0,updated=0,humanRequired=0;
  for(const x of candidates){
    const slug=String(x.slug||'').slice(0,120);if(!slug)continue;
    const prior=existing.get(slug);
    const status=prior||x.status||'candidate';
    const human=Boolean(x.human_required)||['human_action_required','needs_info'].includes(status);
    if(human)humanRequired++;
    if(prior)updated++;else discovered++;
    await env.DB.prepare(`INSERT INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,human_required,last_checked_at,next_action,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET surface_name=excluded.surface_name,surface_type=excluded.surface_type,audience_fit=excluded.audience_fit,authority=excluded.authority,traffic_potential=excluded.traffic_potential,backlink_value=excluded.backlink_value,acceptance_probability=excluded.acceptance_probability,automation_potential=excluded.automation_potential,effort_cost=excluded.effort_cost,distribution_score=excluded.distribution_score,action_url=excluded.action_url,human_required=excluded.human_required,last_checked_at=datetime('now'),next_action=excluded.next_action,updated_at=datetime('now')`)
      .bind(slug,String(x.name||slug).slice(0,200),String(x.type||'unknown').slice(0,80),clamp(x.audience_fit),clamp(x.authority),clamp(x.traffic_potential),clamp(x.backlink_value),clamp(x.acceptance_probability),clamp(x.automation_potential),clamp(x.effort??x.effort_cost),Number(x.distribution_score??scoreOpportunity(x)),status,String(x.action_url||x.url||'').slice(0,2000)||null,human?1:0,String(x.next_action||'').slice(0,2000)||null).run();
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,detail,observed_at,created_at) VALUES(?,?,?,?,datetime('now'),datetime('now'))`).bind(`radar_${crypto.randomUUID()}`,'radar_refresh','completed',`Opportunity Radar refreshed: ${candidates.length} candidates, ${discovered} newly discovered, ${updated} rescored, ${humanRequired} human-required.`).run();
  return {ok:true,candidates:candidates.length,discovered,updated,humanRequired};
}

async function syndicationPages(request,env){
  try{
    const r=await env.ASSETS.fetch(new Request(new URL('/sitemap.xml',request.url)));if(!r.ok)return [];
    const xml=await r.text();
    const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim()).filter(u=>/^https:\/\/trytoolscout\.org\//i.test(u));
    return urls.filter(u=>/(best-|\-vs-|alternatives|tools\.html|compare)/i.test(u)).slice(0,100).map(u=>{
      const path=new URL(u).pathname.split('/').filter(Boolean).pop()||'toolscout';
      const slug=path.replace(/\.html$/i,'');
      const title=slug.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      return {id:u,url:u,title,date_modified:new Date().toISOString()};
    });
  }catch{return [];}
}

async function jsonFeed(request,env){
  const items=await syndicationPages(request,env);
  return Response.json({version:'https://jsonfeed.org/version/1.1',title:'ToolScout Decision Feed',home_page_url:'https://trytoolscout.org/',feed_url:'https://trytoolscout.org/api/distribution/feed.json',description:'Independent ToolScout comparisons, best-of pages and software decision resources for syndication.',items},{headers:{...JSON_HEADERS,'Cache-Control':'public, max-age=900'}});
}

async function rssFeed(request,env){
  const items=await syndicationPages(request,env);
  const body=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ToolScout Decision Feed</title><link>https://trytoolscout.org/</link><description>Independent software comparisons and decision resources from ToolScout.</description>${items.map(i=>`<item><guid isPermaLink="true">${escXml(i.url)}</guid><title>${escXml(i.title)}</title><link>${escXml(i.url)}</link><pubDate>${new Date(i.date_modified).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  return new Response(body,{headers:XML_HEADERS});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/feed.json'&&request.method==='GET')return jsonFeed(request,env);
    if(url.pathname==='/api/distribution/feed.xml'&&request.method==='GET')return rssFeed(request,env);
    if(url.pathname==='/api/distribution/radar/refresh'&&request.method==='POST'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      try{return Response.json(await refreshRadar(request,env),{headers:JSON_HEADERS});}catch(e){return Response.json({error:'radar_refresh_failed',message:String(e?.message||e)},{status:500,headers:JSON_HEADERS});}
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    if(base.scheduled)await base.scheduled(event,env,ctx);
    ctx.waitUntil(refreshRadar(new Request('https://trytoolscout.org/'),env).catch(()=>{}));
  }
};
