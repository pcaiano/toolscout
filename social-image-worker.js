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
    const current = await env.DB.prepare('SELECT count FROM social_image_quota WHERE quota_key = ?').bind(keys[i]).first();
    if (Number(current?.count || 0) >= limits[i]) return false;
  }

  await env.DB.batch(keys.map((key) => env.DB.prepare(`INSERT INTO social_image_quota (quota_key, day, count, updated_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(quota_key) DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP`).bind(key, day)));
  return true;
}

function variantConcept(variant) {
  const concepts = {
    discovery: 'Finding signal in software-market noise: many scattered options resolving into a small, focused path and clear shortlist.',
    comparison: 'A disciplined software comparison: two structured systems side by side, emphasizing trade-offs, fit and clarity rather than a winner-takes-all contest.',
    practical: 'A practical software workflow: a small set of precise modular building blocks connecting cleanly into an efficient working system.'
  };
  return concepts[variant] || concepts.discovery;
}

function buildPrompt(source, variant) {
  const clean = String(source || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  return [
    'Create a premium editorial visual for ToolScout, an independent software discovery platform.',
    'Visual direction: minimalist contemporary technology brand, dark charcoal and near-black base, restrained electric blue and cyan accents, subtle technical geometry, refined lighting, substantial negative space, premium B2B SaaS aesthetic.',
    'Avoid people, stock-photo clichés, fake app interfaces, screenshots, logos, trademarks, readable text, letters, watermarks, cheap gradients, excessive neon, clutter or cyberpunk imagery.',
    'The image should feel calm, authoritative, modern and useful as a social-media companion to a professional software insight.',
    `Core composition: ${variantConcept(variant)}`,
    clean ? `Additional editorial context: ${clean}` : ''
  ].filter(Boolean).join(' ');
}

function stableSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 2147483647;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'toolscout-social-image', model: MODEL });
    if (url.pathname !== '/generate') return json({ error: 'not_found' }, 404);
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await consumeQuota(env, ip))) return json({ error: 'daily_quota_exceeded' }, 429);

    let body = {};
    if (request.method === 'POST') {
      try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    }

    const variant = String(body.variant || url.searchParams.get('variant') || 'discovery').toLowerCase();
    const source = body.prompt || url.searchParams.get('prompt') || '';
    const explicitSeed = Number(body.seed ?? url.searchParams.get('seed'));
    const day = new Date().toISOString().slice(0, 10);
    const seed = Number.isInteger(explicitSeed) && explicitSeed >= 0
      ? explicitSeed % 2147483647
      : stableSeed(`${day}:${variant}`);
    const prompt = buildPrompt(source, variant);

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
          'content-type': 'image/jpeg',
          'cache-control': 'public, max-age=3600',
          'x-toolscout-image-seed': String(seed),
          'x-toolscout-image-variant': variant
        }
      });
    } catch (error) {
      return json({ error: 'generation_failed', message: String(error?.message || error).slice(0, 500) }, 500);
    }
  }
};
