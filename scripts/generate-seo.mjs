import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const intents = JSON.parse(fs.readFileSync(path.join(root, 'seo-intents.json'), 'utf8'));
const tools = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tools.json'), 'utf8'));
const affiliate = JSON.parse(fs.readFileSync(path.join(root, 'data', 'affiliate.json'), 'utf8'));

const esc = (v='') => String(v).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const scoreForPage = (tool, page) => {
  const s = tool.scores || {};
  let score = 0;
  if (tool.category === page.category) score += 40;
  if (page.slug.includes('agency')) score += (s.agency || 0) * 3;
  if (page.slug.includes('small-business')) score += (s.ease || 0) + (s.price || 0);
  if (page.slug.includes('startup')) score += (s.ease || 0) + (s.price || 0) + (s.integrations || 0);
  if (page.slug.includes('free')) score += tool.freePlan ? 25 : 0;
  if (page.slug.includes('automation')) score += (s.automation || 0) * 3;
  if (page.slug.includes('email')) score += (s.marketing || 0) * 3;
  if (page.slug.includes('lead-generation')) score += (s.sales || 0) * 2 + (s.marketing || 0);
  if (page.slug.includes('seo')) score += (s.seo || 0) * 3 + (s.research || 0);
  if (page.slug.includes('project-management')) score += (s.ease || 0) + (s.integrations || 0);
  return score;
};

const shell = (page, cards) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)} — ToolScout</title><meta name="description" content="${esc(page.description)}"><link rel="canonical" href="https://trytoolscout.org/${esc(page.slug)}.html"><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f5f7fb;color:#101828}.wrap{max-width:920px;margin:auto;padding:30px 22px 80px}.brand{font-weight:850;font-size:23px;text-decoration:none;color:#101828}.hero{padding:70px 0 35px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:#667085}.hero h1{font-size:clamp(40px,7vw,66px);line-height:1;letter-spacing:-.06em;margin:14px 0 18px}.hero p,.card p{font-size:18px;line-height:1.6;color:#667085}.card{background:#fff;border:1px solid #e4e8ee;border-radius:20px;padding:22px;margin:14px 0}.top{display:flex;justify-content:space-between;gap:20px}.name{font-size:24px;font-weight:800}.cat{font-size:11px;text-transform:uppercase;color:#667085}.features{font-size:13px;color:#475467;margin:12px 0}.cta{display:inline-block;background:#101828;color:#fff;text-decoration:none;padding:11px 15px;border-radius:11px;font-weight:750}.section{margin-top:42px}.section p{font-size:16px;color:#667085;line-height:1.6}</style></head><body><div class="wrap"><a class="brand" href="./">ToolScout</a><main class="hero"><div class="eyebrow">Software guide</div><h1>${esc(page.title)}</h1><p>${esc(page.description)}</p></main>${cards}<section class="section"><h2>Choose the workflow first</h2><p>ToolScout starts with the job you need to solve, then narrows the software options around your context. Use the recommendation engine to refine the shortlist.</p><a class="cta" href="./">Find my tools →</a></section></div></body></html>`;

for (const page of intents.pages) {
  const candidates = tools.filter(t => t.category === page.category || (page.category === 'marketing' && t.category === 'marketing'))
    .map(t => ({ t, score: scoreForPage(t, page) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);
  const cards = candidates.map(({t}) => {
    const dest = `${affiliate[t.slug]?.enabled && affiliate[t.slug]?.url ? `/go/${t.slug}` : `/go/${t.slug}?source=${encodeURIComponent(page.slug)}`}`;
    return `<article class="card"><div class="top"><div><div class="cat">${esc(t.category)}</div><div class="name">${esc(t.name)}</div></div></div><p>${esc(t.description)}</p><div class="features">${(t.features||[]).slice(0,5).map(esc).join(' · ')}</div><a class="cta" href="${dest}">Explore ${esc(t.name)} →</a></article>`;
  }).join('');
  fs.writeFileSync(path.join(root, `${page.slug}.html`), shell(page, cards));
}
console.log(`Generated ${intents.pages.length} SEO pages.`);
