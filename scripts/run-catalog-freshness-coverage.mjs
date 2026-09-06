import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const intentsPath = 'data/intents.json';
const configPath = 'data/catalog-engine.json';
const original = await fs.readFile(intentsPath, 'utf8');

try {
  const intents = JSON.parse(original);
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const known = new Set(intents.map(x => x.category).filter(Boolean));
  const allowed = config.admission?.allowedCatalogCategories || config.coverage?.priorityCategories || [];

  for (const category of allowed) {
    if (known.has(category)) continue;
    intents.push({
      slug: `catalog-taxonomy-${category}`,
      title: `Catalog taxonomy: ${category}`,
      description: 'Internal catalog taxonomy compatibility record. Not an SEO publishing target.',
      category,
      weights: {},
      keywords: []
    });
  }

  await fs.writeFile(intentsPath, JSON.stringify(intents, null, 2) + '\n');

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/catalog-freshness-coverage-engine.mjs'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await fs.writeFile(intentsPath, original);
}
