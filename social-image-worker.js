const MODEL = '@cf/bytedance/stable-diffusion-xl-lightning';
const DAILY_GLOBAL_LIMIT = 24;
const DAILY_IP_LIMIT = 6;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function consumeQuota(env, ip) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_image_quota (
    quota_key TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  const day = new Date().toISOString().slice(0, 10);
  const keys = [`global:${day}`, `ip:${day}:${ip || 'unknown'}`];
  const limits = [DAILY_GLOBAL_LIMIT, DAILY_IP_LIMIT];

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const current = await env.DB.prepare('SELECT count FROM social_image_quota WHERE quota_key = ?').bind(key).first();
    if (Number(current?.count || 0) >= limits[i]) return false;
  }

  await env.DB.batch(keys.map((key) => env.DB.prepare(`INSERT INTO social_image_quota (quota_key, day, count, updated_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(quota_key) DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP`).bind(key, day)));
  return true;
}

function buildPrompt(source) {
  const clean = String(source || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  return [
    'Create a premium editorial visual for ToolScout, an independent software discovery platform.',
    'Visual direction: minimalist contemporary technology brand, dark charcoal and near-black base, restrained electric blue/cyan accents, subtle technical geometry, refined lighting, substantial negative space, premium B2B SaaS aesthetic.',
    'Avoid people, stock-photo clichés, fake app interfaces, screenshots, logos, trademarks, readable text, letters, watermarks, gradients that feel cheap, excessive neon, clutter or cyberpunk imagery.',
    'The image should feel calm, authoritative, modern and useful as a social-media companion to a professional software insight.',
    clean ? `Editorial concept to express visually: ${clean}` : 'Editorial concept: finding signal in software-market noise and narrowing many options to a focused shortlist.'
  ].join(' ');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'toolscout-social-image', model: MODEL });
    if (url.pathname !== '/generate') return json({ error: 'not_found' }, 404);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await consumeQuota(env, ip))) return json({ error: 'daily_quota_exceeded' }, 429);

    let body = {};
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const prompt = buildPrompt(body.prompt);
    const seed = Number.isInteger(body.seed) ? Math.abs(body.seed) % 2147483647 : Math.floor(Math.random() * 2147483647);

    try {
      const image = await env.AI.run(MODEL, {
        prompt,
        negative_prompt: 'text, letters, words, watermark, logo, people, faces, hands, screenshots, UI mockups, clutter, cyberpunk, low quality, blurry',
        width: 1024,
        height: 1024,
        num_steps: 4,
        guidance: 7.5,
        seed
      });
      return new Response(image, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'cache-control': 'no-store',
          'x-toolscout-image-seed': String(seed)
        }
      });
    } catch (error) {
      return json({ error: 'generation_failed', message: String(error?.message || error).slice(0, 500) }, 500);
    }
  }
};
