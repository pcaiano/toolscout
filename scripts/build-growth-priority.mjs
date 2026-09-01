import fs from 'node:fs';

const intents = JSON.parse(fs.readFileSync('data/intents.json','utf8'));
const profiles = JSON.parse(fs.readFileSync('data/intent-profiles.json','utf8'));
const tools = JSON.parse(fs.readFileSync('data/tools.json','utf8'));
const affiliate = JSON.parse(fs.readFileSync('data/affiliate.json','utf8'));
const pipeline = JSON.parse(fs.readFileSync('data/affiliate-pipeline.json','utf8'));
const gscPath = 'reports/gsc-signals.json';
const gsc = fs.existsSync(gscPath) ? JSON.parse(fs.readFileSync(gscPath,'utf8')) : { items: [] };
const gscByIntent = new Map((gsc.items || []).map(x => [String(x.intent), x]));

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
  const observed = gscByIntent.get(intent.slug);
  const impressions = Number(observed?.impressions || 0);
  const clicks = Number(observed?.clicks || 0);
  const position = Number(observed?.position || 0);
  const realSearchSignal = impressions > 0
    ? Math.min(50, 20 + Math.log10(impressions + 1) * 10 + clicks * 2 + (position > 0 && position <= 20 ? 8 : 0))
    : 0;
  const heuristicScore = Math.min(100, Math.round(commercial + category + catalogDepth + Math.min(20, topFit * 2) + affiliateSignal));
  // Once Google has observed an intent, search evidence is the majority of its score.
  const score = impressions > 0
    ? Math.min(100, Math.round(realSearchSignal + heuristicScore * 0.5))
    : heuristicScore;
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
    searchSignal: impressions > 0 ? { source: 'gsc', impressions, clicks, ctr: Number(observed.ctr || 0), position } : null,
    signalBasis: impressions > 0 ? 'observed-gsc-majority' : 'heuristic-only',
    monetizationReadiness: readiness,
    topTools: top.map(x => x.tool.slug),
    action: score >= 75 ? 'invest-now' : score >= 60 ? 'build-next' : 'watch'
  };
});

rows.sort((a,b) => {
  const aObserved = a.searchSignal ? 1 : 0;
  const bObserved = b.searchSignal ? 1 : 0;
  return bObserved - aObserved || b.priorityScore - a.priorityScore || a.title.localeCompare(b.title);
});
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/growth-priority.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  methodology: 'Observed Google Search Console signals rank ahead of heuristic-only opportunities. For observed intents, GSC contributes the majority of the score; otherwise the score uses commercial intent, catalog depth, fit and affiliate readiness.',
  gsc: { available: gscByIntent.size > 0, intentsWithSignals: gscByIntent.size, source: gsc.source || null },
  count: rows.length,
  items: rows
}, null, 2) + '\n');
console.log(JSON.stringify({ generated: rows.length, top: rows.slice(0,10) }, null, 2));
