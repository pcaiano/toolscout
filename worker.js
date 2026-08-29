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
      try { const b=await request.json(); const intent=String(b.intent||'general').slice(0,100),session=String(b.session||'').slice(0,100),source=String(b.source||'search').slice(0,100),profile=JSON.stringify(b.profile||{}).slice(0,2000); if(!session)return Response.json({error:'invalid_event'},{status:400,headers:cors}); await env.DB.prepare("INSERT INTO search_events (intent_slug,profile_json,session_id,source,created_at) VALUES (?,?,?,?,datetime('now'))").bind(intent,profile,session,source).run(); return Response.json({ok:true},{headers:cors}); } catch { return Response.json({error:'invalid_request'},{status:400,headers:cors}); }
    }
    if (url.pathname === '/api/opportunities/refresh' && request.method === 'POST') {
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:cors});
      try {
        const catalog=await (await env.ASSETS.fetch(new Request(new URL('/data/intents.json',request.url)))).json();
        const rows=await env.DB.prepare("SELECT intent_slug,COUNT(DISTINCT session_id) AS search_sessions FROM search_events WHERE created_at >= datetime('now','-30 days') GROUP BY intent_slug").all();
        const demandMap=new Map((rows.results||[]).map(r=>[String(r.intent_slug),Number(r.search_sessions||0)]));
        const opportunities=[];
        for(const item of catalog||[]) {
          const intent=String(item.slug||'').slice(0,100); if(!intent)continue;
          const sessions=demandMap.get(intent)||0;
          let pageExists=false; try { pageExists=(await env.ASSETS.fetch(new Request(new URL('/'+intent+'.html',request.url)))).ok; } catch {}
          const demand=Math.min(50,sessions*5), commercial=/(crm|seo|marketing|agency|agencies|automation|lead|sales|email|project)/i.test(intent)?25:10, catalogFit=20, duplication=0, score=Math.max(0,Math.min(100,demand+commercial+catalogFit)), status=pageExists?'published':(score>=50?'ready':'candidate');
          await env.DB.prepare("INSERT INTO seo_opportunities (intent_slug,search_sessions,commercial_score,catalog_score,duplication_penalty,opportunity_score,status,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(intent_slug) DO UPDATE SET search_sessions=excluded.search_sessions,commercial_score=excluded.commercial_score,catalog_score=excluded.catalog_score,duplication_penalty=excluded.duplication_penalty,opportunity_score=excluded.opportunity_score,status=excluded.status,updated_at=datetime('now')").bind(intent,sessions,commercial,catalogFit,duplication,score,status).run();
          opportunities.push({intent_slug:intent,search_sessions:sessions,opportunity_score:score,status});
        }
        return Response.json({ok:true,refreshed:opportunities.length,opportunities},{headers:cors});
      } catch(e) { return Response.json({error:'refresh_failed',message:String(e?.message||e)},{status:500,headers:cors}); }
    }
    if (url.pathname === '/api/stats') {
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,''); if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:cors});
      const [byTool,byIntent,total,searches,opportunities]=await Promise.all([env.DB.prepare('SELECT tool_slug,COUNT(*) AS clicks FROM click_events GROUP BY tool_slug ORDER BY clicks DESC LIMIT 20').all(),env.DB.prepare('SELECT intent_slug,COUNT(*) AS clicks FROM click_events GROUP BY intent_slug ORDER BY clicks DESC LIMIT 20').all(),env.DB.prepare('SELECT COUNT(*) AS clicks,COUNT(DISTINCT session_id) AS sessions FROM click_events').first(),env.DB.prepare('SELECT intent_slug,COUNT(DISTINCT session_id) AS searches FROM search_events GROUP BY intent_slug ORDER BY searches DESC LIMIT 20').all(),env.DB.prepare('SELECT intent_slug,search_sessions,commercial_score,catalog_score,duplication_penalty,opportunity_score,status FROM seo_opportunities ORDER BY opportunity_score DESC LIMIT 20').all()]);
      return Response.json({total,byTool,byIntent,searches,opportunities},{headers:cors});
    }
    if (url.pathname === '/sitemap.xml' && request.method === 'GET') {
      try { const response=await env.ASSETS.fetch(new Request(new URL('/sitemap.xml',request.url))); if(response.ok){const headers=new Headers(response.headers);headers.set('Content-Type','application/xml; charset=UTF-8');headers.set('Cache-Control','public, max-age=3600');headers.delete('Content-Encoding');return new Response(response.body,{status:response.status,headers});} } catch {}
      return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://toolscout.luxurybuyerintelligence.workers.dev/</loc></url></urlset>',{status:200,headers:{'Content-Type':'application/xml; charset=UTF-8','Cache-Control':'public, max-age=3600'}});
    }
    if (url.pathname === '/robots.txt' && request.method === 'GET') {
      try { const response=await env.ASSETS.fetch(new Request(new URL('/robots.txt',request.url))); if(response.ok){const headers=new Headers(response.headers);headers.set('Content-Type','text/plain; charset=UTF-8');headers.set('Cache-Control','public, max-age=3600');headers.delete('Content-Encoding');return new Response(response.body,{status:response.status,headers});} } catch {}
      return new Response('User-agent: *\nAllow: /\nSitemap: https://toolscout.luxurybuyerintelligence.workers.dev/sitemap.xml\n',{status:200,headers:{'Content-Type':'text/plain; charset=UTF-8'}});
    }
    if (url.pathname.startsWith('/go/')) {
      const tool=url.pathname.slice(4).toLowerCase().replace(/[^a-z0-9-]/g,'');
      try {
        const config=await (await env.ASSETS.fetch(new Request(new URL('/data/affiliate.json',request.url)))).json(); const entry=config[tool];
        const referrer=request.headers.get('Referer')||request.headers.get('Referrer')||'';
        let seoIntent='general'; try { const refUrl=new URL(referrer); const page=refUrl.pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/i,'')||''; if(page&&page!=='seo')seoIntent=page.slice(0,100); } catch {}
        const source=seoIntent!=='general'?'seo-page':'affiliate-redirect';
        const cookie=request.headers.get('Cookie')||''; const match=cookie.match(/(?:^|;\s*)toolscout_session=([^;]+)/); const session=match?.[1]||crypto.randomUUID();
        if(entry?.enabled&&entry.url){ await env.DB.prepare("INSERT INTO click_events (tool_slug,intent_slug,session_id,source,created_at) VALUES (?,?,?,?,datetime('now'))").bind(tool,seoIntent,session,source).run(); const headers=new Headers(); headers.set('Location',entry.url); if(!match)headers.append('Set-Cookie',`toolscout_session=${session}; Max-Age=15552000; Path=/; SameSite=Lax`); return new Response(null,{status:302,headers}); }
        if(entry?.publicUrl){ await env.DB.prepare("INSERT INTO click_events (tool_slug,intent_slug,session_id,source,created_at) VALUES (?,?,?,?,datetime('now'))").bind(tool,seoIntent,session,source).run(); const headers=new Headers(); headers.set('Location',entry.publicUrl); if(!match)headers.append('Set-Cookie',`toolscout_session=${session}; Max-Age=15552000; Path=/; SameSite=Lax`); return new Response(null,{status:302,headers}); }
      } catch {}
      return Response.redirect(new URL('/tools.html',request.url).toString(),302);
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found',{status:404});
  },
  async scheduled(event,env,ctx){
    const run=async()=>{
      await env.DB.prepare("DELETE FROM click_events WHERE created_at < datetime('now','-180 days')").run();
      await env.DB.prepare("DELETE FROM search_events WHERE created_at < datetime('now','-180 days')").run();
      const catalog=await (await env.ASSETS.fetch(new Request(new URL('/data/intents.json','https://toolscout.luxurybuyerintelligence.workers.dev')))).json();
      const rows=await env.DB.prepare("SELECT intent_slug,COUNT(DISTINCT session_id) AS search_sessions FROM search_events WHERE created_at >= datetime('now','-30 days') GROUP BY intent_slug").all();
      const demandMap=new Map((rows.results||[]).map(r=>[String(r.intent_slug),Number(r.search_sessions||0)]));
      for(const item of catalog||[]) {
        const intent=String(item.slug||'').slice(0,100); if(!intent)continue;
        const sessions=demandMap.get(intent)||0;
        let pageExists=false; try { pageExists=(await env.ASSETS.fetch(new Request(new URL('/'+intent+'.html','https://toolscout.luxurybuyerintelligence.workers.dev')))).ok; } catch {}
        const demand=Math.min(50,sessions*5), commercial=/(crm|seo|marketing|agency|agencies|automation|lead|sales|email|project)/i.test(intent)?25:10, catalogFit=20, duplication=0, score=Math.max(0,Math.min(100,demand+commercial+catalogFit)), status=pageExists?'published':(score>=50?'ready':'candidate');
        await env.DB.prepare("INSERT INTO seo_opportunities (intent_slug,search_sessions,commercial_score,catalog_score,duplication_penalty,opportunity_score,status,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(intent_slug) DO UPDATE SET search_sessions=excluded.search_sessions,commercial_score=excluded.commercial_score,catalog_score=excluded.catalog_score,duplication_penalty=excluded.duplication_penalty,opportunity_score=excluded.opportunity_score,status=excluded.status,updated_at=datetime('now')").bind(intent,sessions,commercial,catalogFit,duplication,score,status).run();
      }
    };
    ctx.waitUntil(run());
  }
};
