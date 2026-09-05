function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

const FONT_SOURCE = 'https://cdn.jsdelivr.net/gh/google/fonts@master/ofl/basic/Basic-Regular.ttf';
const BRAND_FONT = { url: FONT_SOURCE };

function responseHeaders(variant, model = 'flux2') {
  return {
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=86400',
    'x-toolscout-renderer': 'flux2-brand-composer-v15',
    'x-toolscout-image-variant': variant,
    'x-toolscout-image-model': model,
    'x-toolscout-brand-composer': 'cloudflare-images-materialized-text'
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
  return `Create a premium square editorial campaign illustration for ToolScout, an independent software discovery platform.\n\nCENTRAL IDEA\n${idea}\n\nSTRICT TOOLSCOUT ART DIRECTION\nUse the visual language of ToolScout's product: restrained, precise, independent and useful. Contemporary editorial design with quiet charisma. Foundation colours are near-black charcoal #101828, soft off-white #F5F7FB and white, with restrained cool blue and cyan accents. Generous negative space, crisp geometry, subtle depth, refined materials, sophisticated B2B technology art direction. The visual must feel like one coherent brand system, not generic SaaS advertising. Reserve a clean dark negative-space area at the bottom and upper-left for deterministic brand typography added after generation.\n\nILLUSTRATION\nUse premium photorealistic CGI or high-end advertising photography to make the central idea immediately understandable. Prefer a single strong metaphor involving software selection, filtering, workflow, comparison, focus, decision-making or reducing choice. Realistic lighting and materials, elegant composition, restrained detail. Keep important subject matter away from the lower 18% and upper-left corner.\n\nABSOLUTE TEXT RULE\nTHE GENERATED ILLUSTRATION MUST CONTAIN NO WORDS, NO LETTERS, NO NUMBERS, NO LABELS, NO CAPTIONS, NO UI COPY, NO LOGOTYPES AND NO TYPOGRAPHY OF ANY KIND. Do not attempt to spell ToolScout.\n\nAVOID\nNo random abstract lines or blobs. No cyberpunk neon, hologram overload, robots, stock-photo smiles, fake software interfaces, fake logos, fake charts, fake data, malformed icons, clip-art, Microsoft Paint aesthetics, distorted anatomy, illegible glyphs, watermarks or generic AI slop.\n\nFORMAT\n1024x1024. No border. No watermark. No text. Premium editorial campaign quality.`;
}

function decodeBase64Image(image) {
  const binary = atob(image);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pngStream(bytes) {
  return new Blob([bytes], { type: 'image/png' }).stream();
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

async function rasterText(env, content, size, color) {
  const rendered = (await env.IMAGES
    .text(content, { font: BRAND_FONT, color, size })
    .output({ format: 'image/png' })).response();
  return new Uint8Array(await rendered.arrayBuffer());
}

async function composeBrand(env, bytes, variant) {
  if (!env.IMAGES) throw new Error('Cloudflare Images binding is unavailable');
  const [label, brand, tagline] = await Promise.all([
    rasterText(env, variantLabel(variant), 18, '#F5F7FB'),
    rasterText(env, 'ToolScout', 62, '#FFFFFF'),
    rasterText(env, 'FIND THE RIGHT TOOL. FASTER.', 19, '#D0D5DD')
  ]);
  const baseStream = new Blob([bytes], { type: 'image/jpeg' }).stream();
  return (await env.IMAGES
    .input(baseStream)
    .draw(env.IMAGES.input(pngStream(label)), { top: 54, left: 64 })
    .draw(env.IMAGES.input(pngStream(brand)), { bottom: 86, left: 64 })
    .draw(env.IMAGES.input(pngStream(tagline)), { bottom: 48, left: 66 })
    .output({ format: 'image/jpeg', quality: 90 })).response();
}

async function composeSmoke(env, variant) {
  if (!env.IMAGES) throw new Error('Cloudflare Images binding is unavailable');
  const [base, label] = await Promise.all([
    rasterText(env, 'ToolScout', 62, '#FFFFFF'),
    rasterText(env, variantLabel(variant), 18, '#F5F7FB')
  ]);
  return (await env.IMAGES
    .input(pngStream(base))
    .draw(env.IMAGES.input(pngStream(label)), { top: 0, left: 0 })
    .output({ format: 'image/jpeg', quality: 90 })).response();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const variant = safe(url.searchParams.get('variant') || 'discovery', 24).toLowerCase();

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'toolscout-social-image',
        renderer: 'flux2-brand-composer-v15',
        primary: '@cf/black-forest-labs/flux-2-klein-9b',
        fallback: '@cf/black-forest-labs/flux-2-klein-4b',
        textPolicy: 'no-generated-text',
        brandComposer: 'cloudflare-images-materialized-text',
        brandFontHost: 'cdn.jsdelivr.net'
      });
    }

    if (url.pathname === '/compose-smoke') {
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers: responseHeaders(variant, 'brand-smoke') });
      try {
        const branded = await composeSmoke(env, variant);
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

    try {
      const branded = await composeBrand(env, generated.bytes, variant);
      return new Response(branded.body, { status: 200, headers: responseHeaders(variant, generated.model) });
    } catch (error) {
      return json({ error: 'brand_compose_failed', stage: 'brand-compose', model: generated.model, detail: error?.message || String(error) }, 503);
    }
  }
};