import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const intents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'intents.json'), 'utf8'));
const tools = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tools.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'organic-growth-engine.json'), 'utf8'));
const gates = config.editorialGates || {};
const MIN_TOOLS = Number(gates.minimumEligibleToolsPerGuide || 2);
const MAX_TOOLS = Number(gates.maximumRankedToolsPerGuide || 3);
const MIN_RELEVANCE = Number(gates.minimumLexicalRelevance || 0.75);
const toolBySlug = new Map(tools.map(tool => [tool.slug, tool]));
const consolidationsPath = path.join(ROOT, 'data', 'seo-consolidations.json');
const consolidations = fs.existsSync(consolidationsPath) ? JSON.parse(fs.readFileSync(consolidationsPath, 'utf8')) : {};
const failures = [];
const seenCanonicals = new Set();
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['best','tool','tools','software','for','with','and','the','a','an','to','of','platform','platforms']);
const lexicalRelevance = (tool, intent) => {
  const text = normalize([tool?.name, tool?.category, tool?.description, ...(tool?.features || []), ...(tool?.bestFor || [])].join(' '));
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
  const eligible = tools.filter(tool => normalize(tool.category) === normalize(intent.category) && lexicalRelevance(tool, intent) >= MIN_RELEVANCE);
  if (eligible.length < MIN_TOOLS) {
    failures.push(`${filename}: only ${eligible.length} semantically eligible ${intent.category} tools; minimum is ${MIN_TOOLS}`);
    continue;
  }
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

  const selected = [...html.matchAll(/href=["']\/tools\/([a-z0-9-]+)\.html["']/gi)].map(match => match[1]).filter((slug, index, all) => all.indexOf(slug) === index).slice(0, MAX_TOOLS);
  const expected = Math.min(MAX_TOOLS, eligible.length);
  if (selected.length !== expected) failures.push(`${filename}: expected ${expected} ranked eligible tools but found ${selected.length}`);
  for (const slug of selected) {
    const tool = toolBySlug.get(slug);
    if (!tool) {
      failures.push(`${filename}: ranked tool ${slug} missing from catalog`);
      continue;
    }
    const categoryMatch = normalize(tool.category) === normalize(intent.category);
    const relevance = lexicalRelevance(tool, intent);
    if (!categoryMatch) failures.push(`${filename}: ${slug} is outside required category ${intent.category}`);
    if (relevance < MIN_RELEVANCE) failures.push(`${filename}: ${slug} relevance ${relevance.toFixed(2)} is below ${MIN_RELEVANCE} for ${intent.slug}`);
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

console.log(`SEO validation passed: ${intents.length} catalog intents checked with strict category and semantic eligibility.`);
