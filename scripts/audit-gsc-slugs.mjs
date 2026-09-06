import fs from 'node:fs';

// Classify observed Search Console slugs without inventing redirects.
const signals = JSON.parse(fs.readFileSync('reports/gsc-signals.json', 'utf8'));
const intents = JSON.parse(fs.readFileSync('data/intents.json', 'utf8'));
const consolidations = JSON.parse(fs.readFileSync('data/seo-consolidations.json', 'utf8'));

const canonical = new Set(intents.map(item => item.slug));
const rows = (signals.items || []).map(item => {
  const slug = item.intent;
  if (canonical.has(slug)) {
    return { slug, status: 'canonical', target: slug, impressions: item.impressions, clicks: item.clicks, position: item.position };
  }
  if (Object.prototype.hasOwnProperty.call(consolidations, slug)) {
    return { slug, status: 'redirected', target: consolidations[slug], impressions: item.impressions, clicks: item.clicks, position: item.position };
  }
  return { slug, status: 'orphan', target: null, impressions: item.impressions, clicks: item.clicks, position: item.position };
});

const summary = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, { canonical: 0, redirected: 0, orphan: 0 });

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/gsc-slug-audit.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceGeneratedAt: signals.generatedAt || null,
  summary,
  rows
}, null, 2) + '\n');

const orphanRows = rows.filter(row => row.status === 'orphan');
if (orphanRows.length) {
  console.warn(`GSC slug audit warning: ${orphanRows.length} orphan slug(s): ${orphanRows.map(x => x.slug).join(', ')}`);
} else {
  console.log('GSC slug audit passed with no orphan slugs.');
}

console.log(JSON.stringify({ summary, orphans: orphanRows.map(x => x.slug) }));
