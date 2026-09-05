function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

const RENDERER = 'flux2-brand-composer-v12';

function headersFor(variant, model = 'flux2') {
  return {
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    'x-toolscout-renderer': RENDERER,
    'x-toolscout-image-variant': variant,
    'x-toolscout-image-model': model,
    'x-toolscout-brand-composer': 'two-stage-raster-overlay',
    'x-toolscout-text-policy': 'deterministic-brand-text-only'
  };
}

function safe(value, max = 240) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,:;!?()&+\-/'’]/gu, '')
    .trim()
    .slice(0, max);
}

function variantLabel(variant) {
  if (variant === 'comparison') return 'COMPARISON';
  if (variant === 'practical') return 'PRACTICAL';
  return 'DISCOVERY';
}

function buildPrompt(scene, concept) {
  const idea = scene || concept || 'software selection by workflow fit';
  return `Create a premium square editorial campaign illustration for ToolScout, an independent software discovery platform.\n\nCENTRAL IDEA\n${idea}\n\nTOOLSCOUT ART DIRECTION\nRestrained, precise and useful with quiet charisma. Use near-black charcoal #101828, soft off-white #F5F7FB and white, with controlled cool blue/cyan accents. Generous negative space, crisp geometry, subtle depth, refined realistic materials and sophisticated B2B editorial art direction. The result must feel like one coherent ToolScout visual system, not generic SaaS advertising.\n\nILLUSTRATION\nUse premium photorealistic CGI or high-end advertising photography. Make one strong visual metaphor immediately understandable. Keep important subject matter above the lower quarter so a deterministic brand panel can be applied afterwards.\n\nABSOLUTE TEXT RULE\nNO WORDS, LETTERS, NUMBERS, LABELS, CAPTIONS, UI COPY, LOGOTYPES OR TYPOGRAPHY. Do not attempt to spell ToolScout.\n\nAVOID\nNo invented claims, fake software logos, fake UI, fake data, random abstract lines, cyberpunk neon, hologram overload, robots, stock-photo smiles, malformed icons, clip-art, Microsoft Paint aesthetics, watermarks or generic AI slop.\n\nFORMAT\n1024x1024. No border. No watermark. No text. Premium editorial campaign quality.`;
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
  return env.AI.run(model, {
    multipart: {
      body: serialized.body,
      contentType: serialized.headers.get('content-type')
    }
  });
}

async function generate(env, prompt) {
  const models = [
    '@cf/black-forest-labs/flux-2-klein-9b',
    '@cf/black-forest-labs/flux-2-klein-4b'
  ];
  const errors = [];
  for (const model of models) {
    try {
      const result = await runFlux(env, model, prompt);
      if (result && typeof result.image === 'string' && result.image.length > 100) {
        return { bytes: decodeBase64Image(result.image), model };
      }
      errors.push(`${model}: empty image response`);
    } catch (error) {
      const message = error?.message || String(error);
      errors.push(`${model}: ${message}`);
      if (message.includes('daily free allocation of 10,000 neurons')) break;
    }
  }
  throw new Error(errors.join(' | '));
}

function brandSvg(variant) {
  const label = variantLabel(variant);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#101828" stop-opacity="0"/>
        <stop offset="0.22" stop-color="#101828" stop-opacity="0.72"/>
        <stop offset="1" stop-color="#101828" stop-opacity="0.96"/>
      </linearGradient>
    </defs>
    <rect x="0" y="700" width="1024" height="324" fill="url(#panel)"/>
    <rect x="64" y="788" width="96" height="4" rx="2" fill="#2AAEFF"/>
    <rect x="48" y="44" width="190" height="42" rx="21" fill="#101828" fill-opacity="0.82"/>
    <text x="70" y="70" fill="#F5F7FB" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="1.5">${label}</text>
    <text x="64" y="910" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700">ToolScout</text>
    <text x="66" y="950" fill="#D0D5DD" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="500" letter-spacing="1">FIND THE RIGHT TOOL. FASTER.</text>
    <g transform="translate(936 66)" stroke="#F5F7FB" stroke-width="3" fill="none" opacity="0.94">
      <circle cx="0" cy="0" r="22"/>
      <circle cx="0" cy="0" r="5" fill="#2AAEFF" stroke="none"/>
      <path d="M-32 0H-17M17 0H32M0-32V-17M0 17V32"/>
    </g>
  </svg>`;
}

function smokeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101828"/><stop offset="1" stop-color="#24445F"/></linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <circle cx="512" cy="400" r="180" fill="#F5F7FB" fill-opacity="0.08"/>
    <circle cx="512" cy="400" r="84" fill="none" stroke="#2AAEFF" stroke-width="10"/>
  </svg>`;
}

async function rasterizeSvg(env, svg) {
  if (!env.IMAGES) throw new Error('Cloudflare Images binding is unavailable');
  const input = new Blob([svg], { type: 'image/svg+xml' }).stream();
  const response = (await env.IMAGES.input(input).output({ format: 'image/png' })).response();
  if (!response.ok) throw new Error(`SVG rasterization failed with ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function composeBrand(env, baseBytes, baseType, variant) {
  const overlayPng = await rasterizeSvg(env, brandSvg(variant));
  const baseStream = new Blob([baseBytes], { type: baseType }).stream();
  const overlayStream = new Blob([overlayPng], { type: 'image/png' }).stream();
  const response = (await env.IMAGES
    .input(baseStream)
    .draw(env.IMAGES.input(overlayStream), { top: 0, left: 0 })
    .output({ format: 'image/jpeg', quality: 90 })).response();
  if (!response.ok) throw new Error(`Brand composition failed with ${response.status}`);
  return response;
}

async function brandSmoke(env) {
  const basePng = await rasterizeSvg(env, smokeSvg());
  return composeBrand(env, basePng, 'image/png', 'discovery');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const variant = safe(url.searchParams.get('variant') || 'discovery', 24).toLowerCase();

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'toolscout-social-image',
        renderer: RENDERER,
        primary: '@cf/black-forest-labs/flux-2-klein-9b',
        fallback: '@cf/black-forest-labs/flux-2-klein-4b',
        brandComposer: 'two-stage-raster-overlay',
        textPolicy: 'deterministic-brand-text-only',
        cache: 'edge-cache-enabled'
      });
    }

    if (url.pathname === '/brand-smoke') {
      try {
        const branded = await brandSmoke(env);
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
      return json({
        error: quotaExceeded ? 'workers_ai_daily_quota_exceeded' : 'flux_generation_failed',
        stage: 'flux-generation',
        retryAfterUtc: quotaExceeded ? '00:00 UTC next day' : null,
        detail
      }, quotaExceeded ? 429 : 503);
    }

    let branded;
    try {
      branded = await composeBrand(env, generated.bytes, 'image/jpeg', variant);
    } catch (error) {
      return json({
        error: 'brand_compose_failed',
        stage: 'brand-compose',
        model: generated.model,
        detail: error?.message || String(error)
      }, 503);
    }

    const response = new Response(branded.body, {
      status: 200,
      headers: headersFor(variant, generated.model)
    });
    await cache.put(cacheKey, response.clone());
    return response;
  }
};
