import fs from 'node:fs';

const intents = JSON.parse(fs.readFileSync('data/intents.json','utf8'));
const profiles = JSON.parse(fs.readFileSync('data/intent-profiles.json','utf8'));
const tools = JSON.parse(fs.readFileSync('data/tools.json','utf8'));
const affiliate = JSON.parse(fs.readFileSync('data/affiliate.json','utf8'));
const pipeline = JSON.parse(fs.readFileSync('data/affiliate-pipeline.json','utf8'));

const pipelineBySlug = new Map((pipeline.verified_programs || []).map(x => [String(x.slug), x]));
const commercialPattern = /crm|seo|marketing|agency|automation|lead|sales|email|project|funnel|productivity|form/i;
const categoryPriority = {crm:10, seo:10, marketing:9, automation:9, business:8, forms:7};

function scoreTool(tool, intent) {
  const weights = intent.weights || {};
  const scores = tool.scores || {};
  let total = 0;
  let weight = 0;
  for (const [key, raw] of Object.entries(weights)) {
    const w = Number(raw) || 0;
    if (!w) continue;
    let value = 0;
    if (key === 'category') value = String(tool.category || '').toLowerCase() === String(intent.category || '').toLowerCase() ? 10 : 0;
    else if (key === 'freePlan') value = tool.freePlan ? 10 : 0;
    else if (key === 'ease' || key === 'simplicity') value = Number(scores.ease || 0);
    else if (key === 'price') value = Number(scores.price || 0);
    else value = Number(scores[key] || 0);
    total += value * w;
    weight += w;
  }
  return weight ? total / weight : 0;
}

function affiliateReadiness(slug) {
  const live = affiliate[slug];
  if (live?.enabled && live.url) return 25;
  const state = pipelineBySlug.get(slug)?.status;
  if (state === 'program_exists') return 15;
  if (state === 'paused_for_new_affiliates') return 2;
  if (state === 'no_affiliate_program') return 0;
  return 5;
}

const rows = intents.map(intent => {
  const ranked = tools
    .map(tool => ({ tool, fit: scoreTool(tool, intent) }))
    .sort((a,b) => b.fit - a.fit);
  const top = ranked.slice(0,3);
  const catalogDepth = Math.min(20, top.length * 5);
  const topFit = top.length ? top.reduce((sum,x) => sum + x.fit, 0) / top.length : 0;
  const commercial = commercialPattern.test(intent.slug) ? 20 : 8;
  const category = categoryPriority[intent.category] || 4;
  const affiliateTools = ranked.slice(0,5).filter(x => affiliateReadiness(x.tool.slug) >= 15).length;
  const affiliateSignal = Math.min(15, affiliateTools * 5);
  const score = Math.min(100, Math.round(commercial + category + catalogDepth + Math.min(20, topFit * 2) + affiliateSignal));
  const readiness = affiliateTools > 0 ? 'monetizable' : 'needs-affiliate-activation';
  return {
    intent: intent.slug,
    title: intent.title,
    category: intent.category,
    priorityScore: score,
    topFit: Number(topFit.toFixed(2)),
    catalogDepth,
    commercialSignal: commercial,
    affiliateSignal,
    monetizationReadiness: readiness,
    topTools: top.map(x => x.tool.slug),
    action: score >= 75 ? 'invest-now' : score >= 60 ? 'build-next' : 'watch'
  };
});

rows.sort((a,b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title));
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/growth-priority.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  methodology: 'Heuristic planning score using commercial intent, catalog depth, current tool fit and verified affiliate readiness. It does not claim search-volume data.',
  count: rows.length,
  items: rows
}, null, 2) + '\n');
console.log(JSON.stringify({ generated: rows.length, top: rows.slice(0,10) }, null, 2));
