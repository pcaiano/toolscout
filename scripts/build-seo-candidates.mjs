import fs from 'node:fs';

const intents = JSON.parse(fs.readFileSync('data/intents.json','utf8'));
const tools = JSON.parse(fs.readFileSync('data/tools.json','utf8'));

const candidates = intents.map(intent => {
  const matching = tools.filter(t => t.category === intent.category);
  const commercial = /crm|seo|marketing|agency/i.test(intent.slug) ? 25 : 10;
  const catalog = intent.slug !== 'general' && matching.length ? 20 : 0;
  const score = Math.min(100, commercial + catalog);
  return {
    intent: intent.slug,
    title: intent.title,
    matchingTools: matching.map(t => t.slug),
    score,
    status: score >= 40 ? 'candidate' : 'watch'
  };
});

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/seo-candidates.json', JSON.stringify({generatedAt:new Date().toISOString(),candidates},null,2)+'\n');
console.log(`Generated ${candidates.length} SEO candidates.`);
