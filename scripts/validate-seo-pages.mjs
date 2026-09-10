import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const intents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'intents.json'), 'utf8'));
const tools = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tools.json'), 'utf8'));
const toolBySlug = new Map(tools.map(tool => [tool.slug, tool]));
const consolidationsPath = path.join(ROOT, 'data', 'seo-consolidations.json');
const consolidations = fs.existsSync(consolidationsPath) ? JSON.parse(fs.readFileSync(consolidationsPath, 'utf8')) : {};
const failures = [];
const seenCanonicals = new Set();
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['best','tool','tools','software','for','with','and','the','a','an','to','of','platform','platforms']);
const lexicalRelevance = (tool, intent) => {
  const text = normalize([tool?.name, tool?.description, ...(tool?.features || []), ...(tool?.bestFor || [])].join(' '));
  const phrases = [...(intent.keywords || []), String(intent.slug || '').replace(/^best-/, '').replace(/-/g, ' '), intent.title || ''].map(normalize).filter(Boolean);
  let score = 0;
  for (const phrase of phrases) if (phrase.includes(' ') && text.includes(phrase)) score += 3;
  const tokens = new Set(phrases.flatMap(x => x.split(' ')).filter(x => x.length >= 3 && !STOP.has(x)));
  const words = new Set(text.split(' '));
  for (const token of tokens) if (words.has(token)) score += 0.75;
  return score;
};

for (const intent of intents) {
  if (!intent?.slug) continue;
  const filename = `${intent.slug}.html`;
  const file = path.join(ROOT, filename);
  if (!fs.existsSync(file)) {
    failures.push(`${filename}: missing`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  if (!/<title>[^<]+<\/title>/i.test(html)) failures.push(`${filename}: missing title`);
  if (!/<meta[^>]+name=["']description["'][^>]*>/i.test(html)) failures.push(`${filename}: missing meta description`);
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  if (!canonical) failures.push(`${filename}: missing canonical`);
  else if (seenCanonicals.has(canonical)) failures.push(`${filename}: duplicate canonical ${canonical}`);
  else seenCanonicals.add(canonical);

  const selected = [...html.matchAll(/href=["']\/tools\/([a-z0-9-]+)\.html["']/gi)].map(match => match[1]).filter((slug, index, all) => all.indexOf(slug) === index).slice(0, 3);
  if (selected.length < 3) failures.push(`${filename}: fewer than three ranked tool profiles`);
  const exactCategory = tools.filter(tool => normalize(tool.category) === normalize(intent.category));
  for (const slug of selected) {
    const tool = toolBySlug.get(slug);
    if (!tool) {
      failures.push(`${filename}: ranked tool ${slug} missing from catalog`);
      continue;
    }
    const categoryMatch = normalize(tool.category) === normalize(intent.category);
    if (exactCategory.length >= 3 && !categoryMatch) failures.push(`${filename}: ${slug} is outside required category ${intent.category}`);
    if (!categoryMatch && lexicalRelevance(tool, intent) < 1) failures.push(`${filename}: ${slug} lacks semantic relevance to ${intent.slug}`);
  }

  if (/[—–]/.test(html)) failures.push(`${filename}: forbidden long dash character in public copy`);
}

const intentSlugs = new Set(intents.map(intent => intent?.slug).filter(Boolean));
for (const [source,target] of Object.entries(consolidations)) {
  if (source === target) failures.push(`${source}: consolidation cannot target itself`);
  if (!intentSlugs.has(target)) failures.push(`${source}: consolidation target ${target} is not a curated intent`);
  if (consolidations[target]) failures.push(`${source}: consolidation chain through ${target} is not allowed`);
  if (fs.existsSync(path.join(ROOT, `${source}.html`))) failures.push(`${source}.html: consolidated page must not remain published`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`SEO validation passed: ${intents.length} catalog intents checked for structure and semantic relevance.`);
