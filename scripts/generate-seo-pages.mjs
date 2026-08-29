import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://toolscout.luxurybuyerintelligence.workers.dev';
const intentsPath = path.join(ROOT, 'data', 'intents.json');
const toolsPath = path.join(ROOT, 'data', 'tools.json');

const intents = JSON.parse(fs.readFileSync(intentsPath, 'utf8'));
const tools = JSON.parse(fs.readFileSync(toolsPath, 'utf8'));

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const slugWords = slug => String(slug || '')
  .replace(/^best-/, '')
  .replace(/-/g, ' ')
  .trim();

const titleFromIntent = item => item.title || slugWords(item.slug).replace(/\b\w/g, c => c.toUpperCase());

const scoreTool = (tool, intent) => {
  const scores = tool.scores || {};
  const weights = intent.weights || {};
  let total = 0;
  let weight = 0;
  for (const [key, rawWeight] of Object.entries(weights)) {
    const w = Number(rawWeight) || 0;
    if (!w) continue;
    let value = 0;
    if (key === 'freePlan') value = tool.freePlan ? 10 : 0;
    else if (key === 'simplicity') value = Number(scores.ease || 0);
    else if (key === 'price') value = Number(scores.price || 0);
    else value = Number(scores[key] || 0);
    total += value * w;
    weight += w;
  }
  return weight ? total / weight : 0;
};

const topTools = intent => [...tools]
  .map(tool => ({ tool, score: scoreTool(tool, intent) }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 3)
  .map(({ tool }) => tool);

const render = intent => {
  const title = titleFromIntent(intent);
  const desc = intent.description || `Tool recommendations for ${title.toLowerCase()}.`;
  const cards = topTools(intent).map(tool => `
    <article class="card">
      <div class="meta">${esc(tool.category || 'Software')}</div>
      <h2>${esc(tool.name)}</h2>
      <p>${esc(tool.description)}</p>
      <div class="proof">${esc(tool.pricing || 'Pricing varies')}${tool.freePlan ? ' · Free plan' : ''}</div>
      <a href="/go/${encodeURIComponent(tool.slug)}" rel="nofollow sponsored">Explore ${esc(tool.name)} →</a>
    </article>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} — ToolScout</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${BASE}/${encodeURIComponent(intent.slug)}.html">
  <meta name="robots" content="index,follow">
  <style>
    body{font-family:Inter,system-ui,-apple-system,sans-serif;margin:0;background:#f6f7f9;color:#111827}
    .wrap{max-width:920px;margin:auto;padding:28px 22px 72px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}
    .hero{padding:72px 0 28px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}
    h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:14px 0 18px}.lead{font-size:19px;line-height:1.6;color:#667085}
    .grid{display:grid;gap:14px}.card{background:#fff;border:1px solid #e4e7ec;border-radius:20px;padding:22px}.meta{font-size:11px;text-transform:uppercase;color:#667085;letter-spacing:.08em;font-weight:800}.card h2{margin:8px 0;font-size:25px}.card p{font-size:16px;line-height:1.55;color:#667085}.proof{font-size:13px;color:#475467;margin:12px 0}.card a{display:inline-block;background:#111827;color:#fff;padding:11px 15px;border-radius:10px;text-decoration:none;font-weight:750}.footer{margin-top:44px;padding-top:24px;border-top:1px solid #e4e7ec;color:#667085;font-size:15px}
  </style>
</head>
<body>
  <div class="wrap">
    <a class="brand" href="/">ToolScout</a>
    <main class="hero">
      <div class="eyebrow">ToolScout guide</div>
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(desc)}</p>
    </main>
    <section class="grid">${cards}</section>
    <div class="footer">Tell ToolScout what you are trying to accomplish and get a recommendation based on your needs.</div>
  </div>
</body>
</html>
`;
};

let created = 0;
let skipped = 0;
for (const intent of intents) {
  if (!intent?.slug) continue;
  const target = path.join(ROOT, `${intent.slug}.html`);
  if (fs.existsSync(target)) {
    skipped += 1;
    continue;
  }
  fs.writeFileSync(target, render(intent), 'utf8');
  created += 1;
}

console.log(JSON.stringify({ created, skipped, intents: intents.length }));
