function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

const FONT_URL = 'https://fonts.gstatic.com/s/inter/v13/UcCo3FwrK3iLTcviYwY.woff2';

function responseHeaders(variant, model = 'flux2') {
  return {
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    'x-toolscout-renderer': 'flux2-brand-composer-v9',
    'x-toolscout-image-variant': variant,
    'x-toolscout-image-model': model,
    'x-toolscout-brand-composer': 'cloudflare-images',
    'x-toolscout-text-policy': 'deterministic-brand-text-only'
  };
}

function safe(value, max = 240) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/[^\p{L}\p{N}\s.,:;!?()&+\-/'’]/gu, '').trim().slice(0, max);
}

function creativeFromUrl(url, variant) {
  return { variant, concept: safe(url.searchParams.get('concept') || variant, 32), scene: safe(url.searchParams.get('scene') || '', 420) };
}

function buildPrompt(c) {
  const idea = c.scene || c.concept;
  return `Create a premium square editorial campaign illustration for ToolScout, an independent software discovery platform.\n\nCENTRAL IDEA\n${idea}\n\nSTRICT TOOLSCOUT ART DIRECTION\nUse ToolScout's visual language: restrained, precise, independent and useful, with quiet charisma. Foundation colours are near-black charcoal #101828, soft off-white #F5F7FB and white, with restrained cool blue/cyan accents. Use generous negative space, crisp geometry, subtle depth, refined realistic materials and sophisticated B2B editorial art direction. The result must feel like one coherent ToolScout visual system rather than generic SaaS advertising.\n\nILLUSTRATION\nUse premium photorealistic CGI or high-end advertising photography to make the central idea immediately understandable. Prefer one strong visual metaphor involving software selection, filtering, workflow, comparison, focus, decision-making or reducing choice. Use realistic cinematic lighting, elegant composition and restrained detail. Keep important subject matter above the lower quarter so a brand panel can be applied afterwards.\n\nABSOLUTE TEXT RULE\nTHE GENERATED ILLUSTRATION MUST CONTAIN NO WORDS, NO LETTERS, NO NUMBERS, NO LABELS, NO CAPTIONS, NO UI COPY, NO LOGOTYPES AND NO TYPOGRAPHY OF ANY KIND. Do not attempt to spell ToolScout.\n\nAVOID\nNo invented claims, numbers, statistics, prices, awards or fake data. No fake software logos, fake product UI or testimonials. No random abstract lines/blobs, cyberpunk neon, hologram overload, robots, stock-photo smiles, malformed icons, clip-art, Microsoft Paint aesthetics, watermarks or generic AI slop.\n\nFORMAT\n1024x1024. No border. No watermark. No text. Premium editorial campaign quality.`;
}

function decodeBase64Image(image) {
  const binary = atob(image);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
  const attempts = ['@cf/black-forest-labs/flux-2-klein-9b', '@cf/black-forest-labs/flux-2-klein-4b'];
  const errors = [];
  for (const model of attempts) {
    try {
      const result = await runFlux(env, model, prompt);
      if (result && typeof result.image === 'string' && result.image.length > 100) return { bytes: decodeBase64Image(result.image), model };
      errors.push(`${model}: empty image response`);
    } catch (error) {
      const message = error?.message || String(error);
      errors.push(`${model}: ${message}`);
      if (message.includes('daily free allocation of 10,000 neurons')) break;
    }
  }
  throw new Error(errors.join(' | '));
}

function variantLabel(variant) {
  if (variant === 'comparison') return 'COMPARISON';
  if (variant === 'practical') return 'PRACTICAL';
  return 'DISCOVERY';
}

function brandOverlaySvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101828" stop-opacity="0"/><stop offset="0.22" stop-color="#101828" stop-opacity="0.72"/><stop offset="1" stop-color="#101828" stop-opacity="0.96"/></linearGradient></defs><rect x="0" y="700" width="1024" height="324" fill="url(#panel)"/><rect x="64" y="788" width="96" height="4" rx="2" fill="#2AAEFF"/><rect x="48" y="44" width="176" height="42" rx="21" fill="#101828" fill-opacity="0.78"/><g transform="translate(936 66)" stroke="#F5F7FB" stroke-width="3" fill="none" opacity="0.92"><circle cx="0" cy="0" r="22"/><circle cx="0" cy="0" r="5" fill="#2AAEFF" stroke="none"/><path d="M-32 0H-17M17 0H32M0-32V-17M0 17V32"/></g></svg>`;
}

function brandSmokeBaseSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101828"/><stop offset="1" stop-color="#18324D"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#bg)"/><circle cx="512" cy="420" r="176" fill="#F5F7FB" fill-opacity="0.08"/><circle cx="512" cy="420" r="84" fill="none" stroke="#2AAEFF" stroke-width="10"/></svg>`;
}

function textHandle(env, text, color, size) {
  return env.IMAGES.text(text, { font: { url: FONT_URL }, color, size });
}

async function composeBrandStream(env, baseStream, variant) {
  if (!env.IMAGES) throw new Error('Cloudflare Images binding is unavailable');
  const overlayStream = new Blob([brandOverlaySvg()], { type: 'image/svg+xml' }).stream();
  const pipeline = env.IMAGES.input(baseStream)
    .draw(env.IMAGES.input(overlayStream), { top: 0, left: 0 })
    .draw(textHandle(env, variantLabel(variant), '#F5F7FB', 16), { top: 56, left: 70 })
    .draw(textHandle(env, 'ToolScout', '#FFFFFF', 58), { bottom: 92, left: 64 })
    .draw(textHandle(env, 'FIND THE RIGHT TOOL. FASTER.', '#D0D5DD', 18), { bottom: 54, left: 66 });
  return (await pipeline.output({ format: 'image/jpeg', quality: 90 })).response();
}

async function composeBrand(env, bytes, variant) {
  return composeBrandStream(env, new Blob([bytes], { type: 'image/jpeg' }).stream(), variant);
}

async function brandSmoke(env) {
  return composeBrandStream(env, new Blob([brandSmokeBaseSvg()], { type: 'image/svg+xml' }).stream(), 'discovery');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const variant = safe(url.searchParams.get('variant') || 'discovery', 24).toLowerCase();

    if (url.pathname === '/health') return json({ ok: true, service: 'toolscout-social-image', renderer: 'flux2-brand-composer-v9', primary: '@cf/black-forest-labs/flux-2-klein-9b', fallback: '@cf/black-forest-labs/flux-2-klein-4b', textPolicy: 'deterministic-brand-text-only', brandComposer: 'cloudflare-images', font: 'Inter', cache: 'edge-cache-enabled' });

    if (url.pathname === '/brand-smoke') {
      try {
        const branded = await brandSmoke(env);
        return new Response(branded.body, { status: 200, headers: responseHeaders('discovery', 'brand-smoke-no-ai') });
      } catch (error) {
        return json({ error: 'brand_compose_failed', stage: 'brand-compose', detail: error?.message || String(error) }, 503);
      }
    }

    if (url.pathname !== '/generate') return json({ error: 'not_found' }, 404);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: responseHeaders(variant) });

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const creative = creativeFromUrl(url, variant);
    let generated;
    try {
      generated = await generate(env, buildPrompt(creative));
    } catch (error) {
      const detail = error?.message || String(error);
      const quotaExceeded = detail.includes('daily free allocation of 10,000 neurons');
      return json({ error: quotaExceeded ? 'workers_ai_daily_quota_exceeded' : 'flux_generation_failed', stage: 'flux-generation', retryAfterUtc: quotaExceeded ? '00:00 UTC next day' : null, detail }, quotaExceeded ? 429 : 503);
    }

    let branded;
    try {
      branded = await composeBrand(env, generated.bytes, variant);
    } catch (error) {
      return json({ error: 'brand_compose_failed', stage: 'brand-compose', model: generated.model, detail: error?.message || String(error) }, 503);
    }

    const response = new Response(branded.body, { status: 200, headers: responseHeaders(variant, generated.model) });
    await cache.put(cacheKey, response.clone());
    return response;
  }
};