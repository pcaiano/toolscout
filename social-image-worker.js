function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function responseHeaders(variant, model = 'flux2') {
  return {
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=86400',
    'x-toolscout-renderer': 'flux2-brand-composer-v7',
    'x-toolscout-image-variant': variant,
    'x-toolscout-image-model': model,
    'x-toolscout-brand-composer': 'cloudflare-images'
  };
}

function safe(value, max = 240) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/[^\p{L}\p{N}\s.,:;!?()&+\-/'’]/gu, '').trim().slice(0, max);
}

function creativeFromUrl(url, variant) {
  return {
    variant,
    concept: safe(url.searchParams.get('concept') || variant, 32),
    scene: safe(url.searchParams.get('scene') || '', 420)
  };
}

function buildPrompt(c) {
  const idea = c.scene || c.concept;
  return `Create a premium square editorial campaign illustration for ToolScout, an independent software discovery platform.\n\nCENTRAL IDEA\n${idea}\n\nSTRICT TOOLSCOUT ART DIRECTION\nUse the visual language of ToolScout's product: restrained, precise, independent and useful. Contemporary editorial design with quiet charisma. Foundation colours are near-black charcoal #101828, soft off-white #F5F7FB and white, with restrained cool blue and cyan accents. Generous negative space, crisp geometry, subtle depth, refined materials, sophisticated B2B technology art direction. The visual must feel like one coherent brand system, not generic SaaS advertising.\n\nILLUSTRATION\nUse premium photorealistic CGI or high-end advertising photography to make the central idea immediately understandable. Prefer a single strong metaphor involving software selection, filtering, workflow, comparison, focus, decision-making or reducing choice. Realistic lighting and materials, elegant composition, restrained detail. Keep important subject matter above the lower quarter of the image so a brand panel can be applied there afterwards.\n\nABSOLUTE TEXT RULE\nTHE GENERATED ILLUSTRATION MUST CONTAIN NO WORDS, NO LETTERS, NO NUMBERS, NO LABELS, NO CAPTIONS, NO UI COPY, NO LOGOTYPES AND NO TYPOGRAPHY OF ANY KIND. Leave clean negative space so ToolScout typography can be added separately by a deterministic brand compositor. Do not attempt to spell ToolScout.\n\nAVOID\nNo random abstract lines or blobs. No cyberpunk neon, hologram overload, robots, stock-photo smiles, fake software interfaces, fake logos, fake charts, fake data, malformed icons, clip-art, Microsoft Paint aesthetics, distorted anatomy, illegible glyphs, watermarks or generic AI slop.\n\nFORMAT\n1024x1024. No border. No watermark. No text. Premium editorial campaign quality.`;
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
  const attempts = ['@cf/black-forest-labs/flux-2-klein-9b', '@cf/black-forest-labs/flux-2-klein-4b'];
  const errors = [];
  for (const model of attempts) {
    try {
      const result = await runFlux(env, model, prompt);
      if (result && typeof result.image === 'string' && result.image.length > 100) {
        return { bytes: decodeBase64Image(result.image), model };
      }
      errors.push(`${model}: empty image response`);
    } catch (error) {
      errors.push(`${model}: ${error?.message || String(error)}`);
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
    <rect x="48" y="44" width="176" height="42" rx="21" fill="#101828" fill-opacity="0.78"/>
    <g transform="translate(936 66)" stroke="#F5F7FB" stroke-width="3" fill="none" opacity="0.92">
      <circle cx="0" cy="0" r="22"/>
      <circle cx="0" cy="0" r="5" fill="#2AAEFF" stroke="none"/>
      <path d="M-32 0H-17M17 0H32M0-32V-17M0 17V32"/>
    </g>
  </svg>`;
}

function smokeBaseSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#101828"/>
        <stop offset="1" stop-color="#243B53"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <circle cx="512" cy="400" r="170" fill="#2AAEFF" fill-opacity="0.18"/>
    <circle cx="512" cy="400" r="92" fill="none" stroke="#F5F7FB" stroke-opacity="0.28" stroke-width="2"/>
  </svg>`;
}

async function composeBrand(env, bytes, variant, mimeType = 'image/jpeg') {
  if (!env.IMAGES) throw new Error('Cloudflare Images binding is unavailable');

  const baseStream = new Blob([bytes], { type: mimeType }).stream();
  const overlayStream = new Blob([brandOverlaySvg()], { type: 'image/svg+xml' }).stream();

  const pipeline = env.IMAGES
    .input(baseStream)
    .draw(env.IMAGES.input(overlayStream), { top: 0, left: 0 })
    .draw(env.IMAGES.text(variantLabel(variant), { color: '#F5F7FB', size: 16 }), { top: 56, left: 70 })
    .draw(env.IMAGES.text('ToolScout', { color: '#FFFFFF', size: 58 }), { bottom: 92, left: 64 })
    .draw(env.IMAGES.text('FIND THE RIGHT TOOL. FASTER.', { color: '#D0D5DD', size: 18 }), { bottom: 54, left: 66 });

  return (await pipeline.output({ format: 'image/jpeg', quality: 90 })).response();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const variant = safe(url.searchParams.get('variant') || 'discovery', 24).toLowerCase();

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'toolscout-social-image',
        renderer: 'flux2-brand-composer-v7',
        primary: '@cf/black-forest-labs/flux-2-klein-9b',
        fallback: '@cf/black-forest-labs/flux-2-klein-4b',
        textPolicy: 'no-generated-text',
        brandComposer: 'cloudflare-images'
      });
    }

    if (url.pathname === '/compose-smoke') {
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers: responseHeaders(variant, 'brand-smoke') });
      try {
        const branded = await composeBrand(env, new TextEncoder().encode(smokeBaseSvg()), variant, 'image/svg+xml');
        return new Response(branded.body, { status: 200, headers: responseHeaders(variant, 'brand-smoke') });
      } catch (error) {
        return json({ error: 'brand_compose_failed', stage: 'brand-compose-smoke', detail: error?.message || String(error) }, 503);
      }
    }

    if (url.pathname !== '/generate') return json({ error: 'not_found' }, 404);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: responseHeaders(variant) });

    const creative = creativeFromUrl(url, variant);
    let generated;
    try {
      generated = await generate(env, buildPrompt(creative));
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
      branded = await composeBrand(env, generated.bytes, variant);
    } catch (error) {
      return json({ error: 'brand_compose_failed', stage: 'brand-compose', model: generated.model, detail: error?.message || String(error) }, 503);
    }

    return new Response(branded.body, { status: 200, headers: responseHeaders(variant, generated.model) });
  }
};