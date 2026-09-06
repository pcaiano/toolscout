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

let enriched = 0;
let skipped = 0;

for (const [slug, context] of Object.entries(contexts)) {
  const file = path.join(ROOT, `${slug}.html`);
  if (!fs.existsSync(file)) {
    skipped++;
    continue;
  }

  let html = fs.readFileSync(file, 'utf8');
  const marker = `data-decision-context="${esc(slug)}"`;
  if (html.includes(marker)) {
    skipped++;
    continue;
  }

  const constraints = Array.isArray(context.constraints) ? context.constraints : [];
  const questions = Array.isArray(context.decisionQuestions) ? context.decisionQuestions : [];
  const decisionSection = `<section class="section" ${marker}><h2>Who this guide is for</h2><p><strong>${esc(context.persona || 'Software buyers')}</strong> trying to ${esc(context.jobToBeDone || 'choose the right tool for the job')}.</p>${constraints.length ? `<h3>Decision constraints</h3><div class="features">${constraints.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : ''}${questions.length ? `<h3>Questions to answer before choosing</h3>${questions.map(question => `<details><summary>${esc(question)}</summary><p>Use this question to narrow the shortlist against your real workflow and constraints rather than choosing by popularity alone.</p></details>`).join('')}` : ''}</section>`;

  const insertionPoint = '<section class="grid">';
  if (!html.includes(insertionPoint)) {
    skipped++;
    continue;
  }

  html = html.replace(insertionPoint, `${decisionSection}${insertionPoint}`);
  fs.writeFileSync(file, html, 'utf8');
  enriched++;
}

console.log(JSON.stringify({ enriched, skipped, contexts: Object.keys(contexts).length }));
