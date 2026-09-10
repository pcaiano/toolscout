import fs from 'node:fs';
import path from 'node:path';

export function loadSeoIntentState(root = process.cwd()) {
  const baseIntents = JSON.parse(fs.readFileSync(path.join(root, 'data', 'intents.json'), 'utf8'));
  const longtailPath = path.join(root, 'data', 'seo-longtail.json');
  const consolidationsPath = path.join(root, 'data', 'seo-consolidations.json');
  const longtailSeeds = fs.existsSync(longtailPath)
    ? (JSON.parse(fs.readFileSync(longtailPath, 'utf8')).intents || [])
    : [];
  const consolidations = fs.existsSync(consolidationsPath)
    ? JSON.parse(fs.readFileSync(consolidationsPath, 'utf8'))
    : {};
  const baseBySlug = new Map(baseIntents.map(item => [item.slug, item]));
  const longtailIntents = longtailSeeds
    .map(seed => {
      const parent = baseBySlug.get(seed.parent);
      const keywords = [...new Set([
        ...(parent?.keywords || []),
        ...(seed.keywords || []),
        ...((seed.title || '').toLowerCase().split(/\s+/).filter(Boolean))
      ])];
      return {
        ...parent,
        ...seed,
        description: seed.description || parent?.description,
        weights: seed.weights || parent?.weights,
        keywords
      };
    })
    .filter(item => item?.slug && !consolidations[item.slug]);
  const intents = [
    ...baseIntents,
    ...longtailIntents.filter(item => !baseBySlug.has(item.slug))
  ];
  return { baseIntents, longtailSeeds, longtailIntents, consolidations, intents };
}

export function loadSeoIntents(root = process.cwd()) {
  return loadSeoIntentState(root).intents;
}
