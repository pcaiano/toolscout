export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/click') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const tool = clean(body.tool, 80);
      const intent = clean(body.intent, 80) || 'general';
      const session = clean(body.session, 80);

      if (!tool) return json({ error: 'tool is required' }, 400);

      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO click_events (tool_slug, intent_slug, session_id, created_at)
           VALUES (?, ?, ?, datetime('now'))`
        ).bind(tool, intent, session || null).run();
      }

      return json({ ok: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true, database: Boolean(env.DB) });
    }

    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  }
};

function clean(value, max) {
  return String(value ?? '').trim().replace(/[<>]/g, '').slice(0, max);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
