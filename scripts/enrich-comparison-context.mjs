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

const pairContexts = new Map();
for (const [intentSlug, context] of Object.entries(contexts)) {
  if (!fs.existsSync(path.join(ROOT, `${intentSlug}.html`))) continue;
  for (const pair of context.comparisonPairs || []) {
    if (!pairContexts.has(pair)) pairContexts.set(pair, []);
    pairContexts.get(pair).push({ intentSlug, ...context });
  }
}

let enriched = 0;
let skipped = 0;

for (const [pair, relevant] of pairContexts.entries()) {
  const file = path.join(ROOT, `${pair}.html`);
  if (!fs.existsSync(file)) {
    skipped++;
    continue;
  }

  let html = fs.readFileSync(file, 'utf8');
  const marker = `data-comparison-context="${esc(pair)}"`;
  if (html.includes(marker)) {
    skipped++;
    continue;
  }

  const cards = relevant.map(context => {
    const questions = Array.isArray(context.decisionQuestions) ? context.decisionQuestions.slice(0, 2) : [];
    const constraints = Array.isArray(context.constraints) ? context.constraints.slice(0, 4) : [];
    return `<article class="decision" data-intent="${esc(context.intentSlug)}"><div class="meta">Decision context</div><h3>${esc(context.persona || 'Software buyers')}</h3><p>If your goal is to ${esc(context.jobToBeDone || 'choose the right tool for this workflow')}, compare these products against your actual operating constraints rather than overall popularity.</p>${constraints.length ? `<div class="chips">${constraints.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}${questions.length ? `<ul>${questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}<p><a href="/${esc(context.intentSlug)}.html">View the related buying guide →</a></p></article>`;
  }).join('');

  if (!cards) {
    skipped++;
    continue;
  }

  const section = `<section class="section" ${marker}><h2>When this comparison matters</h2><p class="common">The same two products can be a better or worse fit depending on the job, team and constraints. These contexts connect this head-to-head comparison to real buying decisions already covered by ToolScout.</p><div class="decisions">${cards}</div></section>`;
  const insertionPoint = '<section class="section"><h2>How this comparison works</h2>';
  if (!html.includes(insertionPoint)) {
    skipped++;
    continue;
  }

  html = html.replace(insertionPoint, `${section}${insertionPoint}`);
  fs.writeFileSync(file, html, 'utf8');
  enriched++;
}

console.log(JSON.stringify({ enriched, skipped, pairs: pairContexts.size }));
