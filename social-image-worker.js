function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

const RENDERER = 'flux2-brand-composer-v15';
const FONT_URL = 'https://cdn.jsdelivr.net/npm/inter-font@3.19.0/ttf/Inter-VariableFont_slnt,wght.ttf';
const PANEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQkND4DwAB3AFQAV1mkgAAAABJRU5ErkJggg==';
const BLUE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPQWvf/PwAFtALX9zL7BgAAAABJRU5ErkJggg==';
const BASE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQMPL9DwAClAGXg6uDdgAAAABJRU5ErkJggg==';

function headersFor(variant, model = 'flux2') {
  return {
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    'x-toolscout-renderer': RENDERER,
    'x-toolscout-image-variant': variant,
    'x-toolscout-image-model': model,
    'x-toolscout-brand-composer': 'native-raster-text',
    'x-toolscout-text-policy': 'deterministic-brand-text-only'
  };
}

function safe(value, max = 240) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/[^\p{L}\p{N}\s.,:;!?()&+\-/'’]/gu, '').trim().slice(0, max);
}

function variantLabel(variant) {
  if (variant === 'comparison') return 'COMPARISON';
  if (variant === 'practical') return 'PRACTICAL';
  return 'DISCOVERY';
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildPrompt(scene, concept) {
  const idea = scene || concept || 'software selection by workflow fit';
  return `Create a premium square editorial campaign illustration for ToolScout, an independent software discovery platform.\n\nCENTRAL IDEA\n${idea}\n\nTOOLSCOUT ART DIRECTION\nRestrained, precise and useful with quiet charisma. Use near-black charcoal #101828, soft off-white #F5F7FB and white, with controlled cool blue/cyan accents. Generous negative space, crisp geometry, subtle depth, refined realistic materials and sophisticated B2B editorial art direction. The result must feel like one coherent ToolScout visual system, not generic SaaS advertising.\n\nILLUSTRATION\nUse premium photorealistic CGI or high-end advertising photography. Make one strong visual metaphor immediately understandable. Keep important subject matter above the lower quarter so a deterministic brand panel can be applied afterwards.\n\nABSOLUTE TEXT RULE\nNO WORDS, LETTERS, NUMBERS, LABELS, CAPTIONS, UI COPY, LOGOTYPES OR TYPOGRAPHY. Do not attempt to spell ToolScout.\n\nAVOID\nNo invented claims, fake software logos, fake UI, fake data, random abstract lines, cyberpunk neon, hologram overload, robots, stock-photo smiles, malformed icons, clip-art, Microsoft Paint aesthetics, watermarks or generic AI slop.\n\nFORMAT\n1024x1024. No border. No watermark. No text. Premium editorial campaign quality.`;
}

async function runFlux(env, model, prompt) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', '1024');
  form.append('height', '1024');
  form.append('guidance', '4');
  const serialized = new Response(form);
  return env.AI.run(model, { multipart: { body: serialized.body, contentType: serialized.headers.get('content-type') } });
}

async function generate(env, prompt) {
  const models = ['@cf/black-forest-labs/flux-2-klein-9b', '@cf/black-forest-labs/flux-2-klein-4b'];
  const errors = [];
  for (const model of models) {
    try {
      const result = await runFlux(env, model, prompt);
      if (result && typeof result.image === 'string' && result.image.length > 100) return { bytes: decodeBase64(result.image), model };
      errors.push(`${model}: empty image response`);
    } catch (error) {
      const message = error?.message || String(error);
      errors.push(`${model}: ${message}`);
      if (message.includes('daily free allocation of 10,000 neurons')) break;
    }
  }
  throw new Error(errors.join(' | '));
}

function rasterHandle(env, b64, width, height) {
  const stream = new Blob([decodeBase64(b64)], { type: 'image/png' }).stream();
  return env.IMAGES.input(stream).transform({ width, height, fit: 'squeeze' });
}

function textHandle(env, text, size, color) {
  return env.IMAGES.text(text, { font: { url: FONT_URL }, size, color });
}

function smokeBase(env) {
  const stream = new Blob([decodeBase64(BASE_B64)], { type: 'image/png' }).stream();
  return env.IMAGES.input(stream).transform({ width: 1024, height: 1024, fit: 'squeeze' });
}

async function composeRasterOnly(env) {
  const pipeline = smokeBase(env)
    .draw(rasterHandle(env, PANEL_B64, 1024, 300), { bottom: 0, left: 0, opacity: 0.92 })
    .draw(rasterHandle(env, PANEL_B64, 205, 44), { top: 42, left: 46, opacity: 0.84 })
    .draw(rasterHandle(env, BLUE_B64, 96, 4), { bottom: 232, left: 64 });
  return (await pipeline.output({ format: 'image/jpeg', quality: 90 })).response();
}

async function composeTextOnly(env) {
  const pipeline = smokeBase(env)
    .draw(textHandle(env, 'DISCOVERY', 16, '#F5F7FB'), { top: 55, left: 68 })
    .draw(textHandle(env, 'ToolScout', 58, '#FFFFFF'), { bottom: 86, left: 64 })
    .draw(textHandle(env, 'FIND THE RIGHT TOOL. FASTER.', 18, '#D0D5DD'), { bottom: 48, left: 66 });
  return (await pipeline.output({ format: 'image/jpeg', quality: 90 })).response();
}

async function composeBrand(env, baseStream, variant, smoke = false) {
  if (!env.IMAGES) throw new Error('Cloudflare Images binding is unavailable');
  let base = env.IMAGES.input(baseStream);
  if (smoke) base = base.transform({ width: 1024, height: 1024, fit: 'squeeze' });
  const pipeline = base
    .draw(rasterHandle(env, PANEL_B64, 1024, 300), { bottom: 0, left: 0, opacity: 0.92 })
    .draw(rasterHandle(env, PANEL_B64, 205, 44), { top: 42, left: 46, opacity: 0.84 })
    .draw(rasterHandle(env, BLUE_B64, 96, 4), { bottom: 232, left: 64 })
    .draw(textHandle(env, variantLabel(variant), 16, '#F5F7FB'), { top: 55, left: 68 })
    .draw(textHandle(env, 'ToolScout', 58, '#FFFFFF'), { bottom: 86, left: 64 })
    .draw(textHandle(env, 'FIND THE RIGHT TOOL. FASTER.', 18, '#D0D5DD'), { bottom: 48, left: 66 });
  return (await pipeline.output({ format: 'image/jpeg', quality: 90 })).response();
}

async function runSmoke(fn, env, label) {
  try {
    const result = await fn(env);
    return new Response(result.body, { status: 200, headers: headersFor('discovery', label) });
  } catch (error) {
    return json({ error: 'brand_compose_failed', stage: label, detail: error?.message || String(error) }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const variant = safe(url.searchParams.get('variant') || 'discovery', 24).toLowerCase();

    if (url.pathname === '/health') return json({ ok: true, service: 'toolscout-social-image', renderer: RENDERER, brandComposer: 'native-raster-text', diagnostics: ['brand-smoke-raster','brand-smoke-text'], cache: 'edge-cache-enabled' });
    if (url.pathname === '/brand-smoke-raster') return runSmoke(composeRasterOnly, env, 'raster-only');
    if (url.pathname === '/brand-smoke-text') return runSmoke(composeTextOnly, env, 'text-only');
    if (url.pathname === '/brand-smoke') {
      const base = new Blob([decodeBase64(BASE_B64)], { type: 'image/png' }).stream();
      try {
        const branded = await composeBrand(env, base, 'discovery', true);
        return new Response(branded.body, { status: 200, headers: headersFor('discovery', 'brand-smoke-no-ai') });
      } catch (error) {
        return json({ error: 'brand_compose_failed', stage: 'brand-compose', detail: error?.message || String(error) }, 503);
      }
    }

    if (url.pathname !== '/generate') return json({ error: 'not_found' }, 404);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: headersFor(variant) });

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const scene = safe(url.searchParams.get('scene') || '', 420);
    const concept = safe(url.searchParams.get('concept') || variant, 64);
    let generated;
    try {
      generated = await generate(env, buildPrompt(scene, concept));
    } catch (error) {
      const detail = error?.message || String(error);
      const quotaExceeded = detail.includes('daily free allocation of 10,000 neurons');
      return json({ error: quotaExceeded ? 'workers_ai_daily_quota_exceeded' : 'flux_generation_failed', stage: 'flux-generation', retryAfterUtc: quotaExceeded ? '00:00 UTC next day' : null, detail }, quotaExceeded ? 429 : 503);
    }

    try {
      const base = new Blob([generated.bytes], { type: 'image/jpeg' }).stream();
      const branded = await composeBrand(env, base, variant, false);
      const response = new Response(branded.body, { status: 200, headers: headersFor(variant, generated.model) });
      await cache.put(cacheKey, response.clone());
      return response;
    } catch (error) {
      return json({ error: 'brand_compose_failed', stage: 'brand-compose', model: generated.model, detail: error?.message || String(error) }, 503);
    }
  }
};
