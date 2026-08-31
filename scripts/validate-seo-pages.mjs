import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const intents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'intents.json'), 'utf8'));
const consolidationsPath = path.join(ROOT, 'data', 'seo-consolidations.json');
const consolidations = fs.existsSync(consolidationsPath) ? JSON.parse(fs.readFileSync(consolidationsPath, 'utf8')) : {};
const failures = [];
const seenCanonicals = new Set();

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

console.log(`SEO validation passed: ${intents.length} catalog intents checked.`);
