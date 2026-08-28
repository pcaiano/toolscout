export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
    if (request.method === 'OPTIONS') return new Response(null,{headers:cors});
    if (url.pathname === '/api/health') return Response.json({ok:true,service:'toolscout-analytics'},{headers:cors});
    if (url.pathname === '/api/click' && request.method === 'POST') {
      try { const b=await request.json(); const tool=String(b.tool||'').slice(0,100),intent=String(b.intent||'general').slice(0,100),session=String(b.session||'').slice(0,100),source=String(b.source||'recommendation').slice(0,100); if(!tool||!session)return Response.json({error:'invalid_event'},{status:400,headers:cors}); await env.DB.prepare("INSERT INTO click_events (tool_slug,intent_slug,session_id,source,created_at) VALUES (?,?,?,?,datetime('now'))").bind(tool,intent,session,source).run(); return Response.json({ok:true},{headers:cors}); } catch { return Response.json({error:'invalid_request'},{status:400,headers:cors}); }
    }
    if (url.pathname === '/api/search' && request.method === 'POST') {
      try { const b=await request.json(); const intent=String(b.intent||'general').slice(0,100),session=String(b.session||'').slice(0,100),source=String(b.source||'search').slice(0,100),profile=JSON.stringify(b.profile||{}).slice(0,2000); if(!session)return Response.json({error:'invalid_event'},{status:400,headers:cors}); await env.DB.prepare("INSERT INTO search_events (intent_slug,profile_json,session_id,source,created_at) VALUES (?,?,?,?,datetime('now'))").bind(intent,profile,session,source,source).run(); return Response.json({ok:true},{headers:cors}); } catch { return Response.json({error:'invalid_request'},{status:400,headers:cors}); }
    }
    if (url.pathname === '/api/stats') {
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,''); if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:cors});
      const [byTool,byIntent,total,searches,opportunities]=await Promise.all([env.DB.prepare('SELECT tool_slug,COUNT(*) AS clicks FROM click_events GROUP BY tool_slug ORDER BY clicks DESC LIMIT 20').all(),env.DB.prepare('SELECT intent_slug,COUNT(*) AS clicks FROM click_events GROUP BY intent_slug ORDER BY clicks DESC LIMIT 20').all(),env.DB.prepare('SELECT COUNT(*) AS clicks,COUNT(DISTINCT session_id) AS sessions FROM click_events').first(),env.DB.prepare('SELECT intent_slug,COUNT(DISTINCT session_id) AS searches FROM search_events GROUP BY intent_slug ORDER BY searches DESC LIMIT 20').all(),env.DB.prepare('SELECT intent_slug,search_sessions,opportunity_score,status FROM seo_opportunities ORDER BY opportunity_score DESC LIMIT 20').all()]);
      return Response.json({total,byTool:byTool.results,byIntent:byIntent.results,searches:searches.results,opportunities:opportunities.results},{headers:cors});
    }
    if (url.pathname.startsWith('/go/')) {
      const tool=url.pathname.slice(4).toLowerCase().replace(/[^a-z0-9-]/g,'');
      try { const response=await env.ASSETS.fetch(new Request(new URL('/data/affiliate.json',request.url))); const config=await response.json(); const entry=config[tool]; if(entry?.enabled&&entry.url)return Response.redirect(entry.url,302); } catch {}
      return Response.redirect(new URL('/tools.html',request.url).toString(),302);
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found',{status:404});
  },
  async scheduled(event,env,ctx){ctx.waitUntil(Promise.all([
    env.DB.prepare("DELETE FROM click_events WHERE created_at < datetime('now','-180 days')").run(),
    env.DB.prepare("DELETE FROM search_events WHERE created_at < datetime('now','-180 days')").run(),
    env.DB.prepare("INSERT INTO seo_opportunities (intent_slug,search_sessions,commercial_score,catalog_score,duplication_penalty,opportunity_score,status,updated_at) SELECT intent_slug,COUNT(DISTINCT session_id),CASE WHEN intent_slug LIKE '%crm%' OR intent_slug LIKE '%seo%' OR intent_slug LIKE '%marketing%' OR intent_slug LIKE '%agency%' THEN 25 ELSE 10 END,CASE WHEN intent_slug != 'general' THEN 20 ELSE 0 END,0,MIN(100,COUNT(DISTINCT session_id)*5 + CASE WHEN intent_slug LIKE '%crm%' OR intent_slug LIKE '%seo%' OR intent_slug LIKE '%marketing%' OR intent_slug LIKE '%agency%' THEN 25 ELSE 10 END + CASE WHEN intent_slug != 'general' THEN 20 ELSE 0 END),'candidate',datetime('now')) FROM search_events WHERE created_at >= datetime('now','-30 days') GROUP BY intent_slug ON CONFLICT(intent_slug) DO UPDATE SET search_sessions=excluded.search_sessions,commercial_score=excluded.commercial_score,catalog_score=excluded.catalog_score,opportunity_score=excluded.opportunity_score,updated_at=datetime('now')").run()
  ]));}
};