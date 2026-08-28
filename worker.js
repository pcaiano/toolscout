export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'toolscout-analytics' }, { headers: cors });
    }

    if (url.pathname === '/api/click' && request.method === 'POST') {
      try {
        const body = await request.json();
        const tool = String(body.tool || '').slice(0, 100);
        const intent = String(body.intent || 'general').slice(0, 100);
        const session = String(body.session || '').slice(0, 100);
        const source = String(body.source || 'recommendation').slice(0, 100);
        if (!tool || !session) return Response.json({ error: 'invalid_event' }, { status: 400, headers: cors });
        await env.DB.prepare('INSERT INTO click_events (tool_slug, intent_slug, session_id, source, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))').bind(tool, intent, session, source).run();
        return Response.json({ ok: true }, { headers: cors });
      } catch {
        return Response.json({ error: 'invalid_request' }, { status: 400, headers: cors });
      }
    }

    if (url.pathname === '/api/stats') {
      const byTool = await env.DB.prepare('SELECT tool_slug, COUNT(*) AS clicks FROM click_events GROUP BY tool_slug ORDER BY clicks DESC LIMIT 20').all();
      const byIntent = await env.DB.prepare('SELECT intent_slug, COUNT(*) AS clicks FROM click_events GROUP BY intent_slug ORDER BY clicks DESC LIMIT 20').all();
      const total = await env.DB.prepare('SELECT COUNT(*) AS clicks, COUNT(DISTINCT session_id) AS sessions FROM click_events').first();
      return Response.json({ total, byTool: byTool.results, byIntent: byIntent.results }, { headers: cors });
    }

    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(env.DB.prepare("DELETE FROM click_events WHERE created_at < datetime('now','-180 days')").run());
  }
};
