import fs from 'node:fs';

const reportPath = 'reports/gsc-indexing.json';
const outputPath = 'reports/seo-indexing-gate.json';
const barrierStatuses = new Set(['canonical-alternate','crawled-not-indexed','discovered-not-indexed','blocked','redirected','error']);

const indexing = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  : { items: [] };

const items = (indexing.items || []).map(item => ({
  url: item.url,
  status: item.status || 'unknown',
  blocksEditorialOptimization: barrierStatuses.has(item.status),
  coverageState: item.coverageState || null,
  lastCrawlTime: item.lastCrawlTime || null
}));

const blocked = items.filter(item => item.blocksEditorialOptimization);
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceGeneratedAt: indexing.generatedAt || null,
  blockedCount: blocked.length,
  items
}, null, 2) + '\n');

console.log(JSON.stringify({ blockedCount: blocked.length, tracked: items.length }));
