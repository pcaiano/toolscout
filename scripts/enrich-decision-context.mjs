import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const contextPath = path.join(ROOT, 'data', 'decision-context.json');
if (!fs.existsSync(contextPath)) {
  console.log(JSON.stringify({ enriched: 0, skipped: 0, reason: 'no-decision-context' }));
  process.exit(0);
}

const contexts = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const clip = (value, max) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const sliced = text.slice(0, Math.max(0, max - 1));
  const boundary = sliced.lastIndexOf(' ');
  return `${sliced.slice(0, boundary > 40 ? boundary : sliced.length)}…`;
};

let enriched = 0;
let skipped = 0;

for (const [slug, context] of Object.entries(contexts)) {
  const file = path.join(ROOT, `${slug}.html`);
  if (!fs.existsSync(file)) {
    skipped++;
    continue;
  }

  let html = fs.readFileSync(file, 'utf8');
  const h1Match = html.match(/<h1>(.*?)<\/h1>/i);
  const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim() : '';
  const persona = String(context.persona || 'software buyers').trim();
  const job = String(context.jobToBeDone || 'choose the right tool for the job').trim();
  const constraints = Array.isArray(context.constraints) ? context.constraints.filter(Boolean) : [];
  const questions = Array.isArray(context.decisionQuestions) ? context.decisionQuestions : [];
  const selectionGuidance = Array.isArray(context.selectionGuidance) ? context.selectionGuidance.filter(Boolean) : [];

  if (title) {
    const seoTitle = clip(`${title}: Compare the Best Options | ToolScout`, 62);
    const constraintText = constraints.slice(0, 3).join(', ');
    const meta = clip(`${title} for ${persona}. Compare options for ${job}${constraintText ? `, with focus on ${constraintText}` : ''}.`, 158);
    const answer = clip(`${title} depends on the workflow. For ${persona}, start by matching tools to ${constraints.slice(0, 3).join(', ') || 'your practical constraints'} rather than choosing by popularity alone.`, 240);

    html = html.replace(/<title>.*?<\/title>/i, `<title>${esc(seoTitle)}</title>`);
    html = html.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${esc(meta)}">`);
    html = html.replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${esc(seoTitle)}">`);
    html = html.replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${esc(meta)}">`);
    html = html.replace(/<p class="lead">.*?<\/p>/i, `<p class="lead">${esc(answer)}</p>`);
  }

  const marker = `data-decision-context="${esc(slug)}"`;
  if (!html.includes(marker)) {
    const guidanceHtml = selectionGuidance.length ? `<h3>What to compare</h3>${selectionGuidance.map(item => `<p>${esc(item)}</p>`).join('')}` : '';
    const decisionSection = `<section class="section" ${marker}><h2>Who this guide is for</h2><p><strong>${esc(persona)}</strong> trying to ${esc(job)}.</p>${constraints.length ? `<h3>Decision constraints</h3><div class="features">${constraints.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}${guidanceHtml}${questions.length ? `<h3>Questions to answer before choosing</h3>${questions.map(question => `<details><summary>${esc(question)}</summary><p>Use this question to narrow the shortlist against your real workflow and constraints rather than choosing by popularity alone.</p></details>`).join('')}` : ''}</section>`;
    const insertionPoint = '<section class="grid">';
    if (html.includes(insertionPoint)) html = html.replace(insertionPoint, `${decisionSection}${insertionPoint}`);
  }

  fs.writeFileSync(file, html, 'utf8');
  enriched++;
}

console.log(JSON.stringify({ enriched, skipped, contexts: Object.keys(contexts).length }));
