function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function responseHeaders(variant, model = 'flux2') {
  return {
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=86400',
    'x-toolscout-renderer': 'flux2-editorial-v4',
    'x-toolscout-image-variant': variant,
    'x-toolscout-image-model': model,
    'x-toolscout-text-policy': 'no-generated-text'
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
  return `Create a premium square editorial campaign illustration for ToolScout, an independent software discovery platform.\n\nCENTRAL IDEA\n${idea}\n\nTOOLSCOUT ART DIRECTION\nPremium, restrained and authoritative with quiet charisma. Use a near-black charcoal and deep navy foundation, soft off-white and white, with controlled electric blue and cyan accents. Generous negative space, crisp geometry, subtle depth, refined realistic materials and sophisticated high-end B2B editorial art direction. The result must feel like one coherent ToolScout visual system rather than generic SaaS advertising.\n\nILLUSTRATION\nUse premium photorealistic CGI or high-end advertising photography to make the central idea immediately understandable. Prefer one strong visual metaphor involving software selection, filtering, workflow, comparison, focus, decision-making or reducing choice. Use realistic cinematic lighting, depth and polished commercial finish. Keep the composition simple and confident rather than busy.\n\nABSOLUTE TEXT RULE\nTHE IMAGE MUST CONTAIN NO WORDS, NO LETTERS, NO NUMBERS, NO LABELS, NO CAPTIONS, NO UI COPY, NO LOGOTYPES AND NO TYPOGRAPHY OF ANY KIND. Do not attempt to spell ToolScout. Brand recognition must come from the visual system, not generated text.\n\nAVOID\nNo invented claims, numbers, statistics, prices, awards, customer counts or performance metrics. No fake software logos, fake product UI, fake testimonials or fake data. No distorted hands, faces, icons or typography. No random abstract lines or blobs, cyberpunk neon, hologram overload, robots, stock-photo smiles, AI clichés, clip-art, Microsoft Paint aesthetics, low-detail infographics, watermarks or generic AI slop.\n\nFORMAT\n1024x1024. No border. No watermark. No text. Premium editorial campaign quality.`;
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const variant = safe(url.searchParams.get('variant') || 'discovery', 24).toLowerCase();

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'toolscout-social-image',
        renderer: 'flux2-editorial-v4',
        primary: '@cf/black-forest-labs/flux-2-klein-9b',
        fallback: '@cf/black-forest-labs/flux-2-klein-4b',
        textPolicy: 'no-generated-text',
        productionPath: 'flux-direct'
      });
    }

    if (url.pathname !== '/generate') return json({ error: 'not_found' }, 404);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers: responseHeaders(variant) });

    const creative = creativeFromUrl(url, variant);
    try {
      const generated = await generate(env, buildPrompt(creative));
      return new Response(generated.bytes, { status: 200, headers: responseHeaders(variant, generated.model) });
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
  }
};