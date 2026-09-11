import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntentState } from './seo-intent-loader.mjs';

const ROOT = process.cwd();
const { intents, consolidations } = loadSeoIntentState(ROOT);
const canonical = new Set(intents.map(item => item.slug).filter(Boolean));
const holdsPath = path.join(ROOT, 'reports', 'seo-publication-holds.json');
const holds = fs.existsSync(holdsPath)
  ? JSON.parse(fs.readFileSync(holdsPath, 'utf8'))
  : { items: [] };
const held = new Set((holds.items || []).map(item => item.intent).filter(Boolean));

const removed = [];
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isFile() || !/^best-[a-z0-9-]+\.html$/i.test(entry.name)) continue;
  const slug = entry.name.replace(/\.html$/i, '');
  const isCanonical = canonical.has(slug);
  const isHeld = held.has(slug);
  const isConsolidatedSource = Object.prototype.hasOwnProperty.call(consolidations, slug);
  if (isCanonical && !isHeld && !isConsolidatedSource) continue;
  fs.unlinkSync(path.join(ROOT, entry.name));
  removed.push({ slug, reason: !isCanonical ? 'outside-canonical-registry' : isHeld ? 'publication-held' : 'consolidated-source' });
}

const report = {
  generatedAt: new Date().toISOString(),
  rule: 'Root SEO guides are public only when they belong to the canonical registry, are not held and are not consolidation sources.',
  removed
};
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports', 'pruned-seo-guides.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, removedCount: removed.length, removed }));
