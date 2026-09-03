import fs from 'node:fs';

const intents = JSON.parse(fs.readFileSync('data/intents.json','utf8'));
const profiles = JSON.parse(fs.readFileSync('data/intent-profiles.json','utf8'));
const tools = JSON.parse(fs.readFileSync('data/tools.json','utf8'));
const affiliate = JSON.parse(fs.readFileSync('data/affiliate.json','utf8'));
const pipeline = JSON.parse(fs.readFileSync('data/affiliate-pipeline.json','utf8'));
const gscPath = 'reports/gsc-signals.json';
const gscFilePresent = fs.existsSync(gscPath);
const gsc = gscFilePresent ? JSON.parse(fs.readFileSync(gscPath,'utf8')) : { items: [] };
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

function searchOpportunity(observed) {
  const impressions = Number(observed?.impressions || 0);
  const clicks = Number(observed?.clicks || 0);
  const position = Number(observed?.position || 0);
  const ctr = Number(observed?.ctr || 0);
  if (!impressions) return { score: 0, opportunity: 'unobserved' };

  const demand = Math.min(28, Math.log10(impressions + 1) * 9);
  const traffic = Math.min(8, Math.log10(clicks + 1) * 4);
  let rankOpportunity = 2;
  if (position > 0 && position <= 3) rankOpportunity = 6;
  else if (position <= 10) rankOpportunity = 14;
  else if (position <= 20) rankOpportunity = 18;
  else if (position <= 40) rankOpportunity = 12;
  else if (position <= 70) rankOpportunity = 7;

  const ctrOpportunity = impressions >= 20 && ctr < 2 ? 6 : impressions >= 20 && ctr < 5 ? 3 : 0;
  const score = Math.min(60, Math.round(demand + traffic + rankOpportunity + ctrOpportunity));
  const opportunity = position > 3 && position <= 20
    ? 'striking-distance'
    : impressions >= 20 && ctr < 2
      ? 'ctr-upside'
      : position > 20 && position <= 40
        ? 'page-two-upside'
        : position > 0 && position <= 3
          ? 'defend-winner'
          : 'develop';
  return { score, opportunity };
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
  const ctr = Number(observed?.ctr || 0);
  const search = searchOpportunity(observed);
  const heuristicScore = Math.min(100, Math.round(commercial + category + catalogDepth + Math.min(20, topFit * 2) + affiliateSignal));
  const score = impressions > 0
    ? Math.min(100, Math.round(search.score + heuristicScore * 0.4))
    : heuristicScore;
  const readiness = affiliateTools > 0 ? 'monetizable' : 'needs-affiliate-activation';
  const action = impressions > 0 && search.opportunity === 'striking-distance'
    ? 'optimize-now'
    : score >= 75 ? 'invest-now' : score >= 60 ? 'build-next' : 'watch';
  return {
    intent: intent.slug,
    title: intent.title,
    category: intent.category,
    priorityScore: score,
    topFit: Number(topFit.toFixed(2)),
    catalogDepth,
    commercialSignal: commercial,
    affiliateSignal,
    searchSignal: impressions > 0 ? { source: 'gsc', impressions, clicks, ctr, position, opportunity: search.opportunity, opportunityScore: search.score } : null,
    signalBasis: impressions > 0 ? 'observed-gsc-majority' : 'heuristic-only',
    monetizationReadiness: readiness,
    topTools: top.map(x => x.tool.slug),
    action
  };
});

rows.sort((a,b) => {
  const actionRank = { 'optimize-now': 4, 'invest-now': 3, 'build-next': 2, watch: 1 };
  const aObserved = a.searchSignal ? 1 : 0;
  const bObserved = b.searchSignal ? 1 : 0;
  return bObserved - aObserved || (actionRank[b.action] || 0) - (actionRank[a.action] || 0) || b.priorityScore - a.priorityScore || a.title.localeCompare(b.title);
});

const gscAvailable = gscByIntent.size > 0;
const gscStatus = gscAvailable ? 'signals-imported' : gscFilePresent ? 'imported-no-matching-intents' : 'not-imported';
const gscReason = gscAvailable
  ? 'Google Search Console page signals are present and drive growth prioritization, including striking-distance and CTR opportunities.'
  : gscFilePresent
    ? 'A Google Search Console export was imported, but it contains no matching best-* intent pages.'
    : 'No reports/gsc-signals.json file exists. This describes ToolScout ingestion state only; it does not mean the site is unverified, unindexed, or invisible to Google.';

const methodology = 'Observed Google Search Console signals rank ahead of heuristic-only opportunities. For observed intents, search demand and ranking opportunity contribute 60 points and commercial/catalog/affiliate readiness contributes 40% of its heuristic score. Positions 4-20 are treated as striking-distance opportunities; low-CTR pages with meaningful impressions receive an optimization bonus.';
const payload = {
  methodology,
  gsc: {
    available: gscAvailable,
    ingestionStatus: gscStatus,
    intentsWithSignals: gscByIntent.size,
    source: gsc.source || null,
    reason: gscReason,
    importCommand: 'node scripts/import-gsc-signals.mjs <gsc-pages.csv>'
  },
  count: rows.length,
  items: rows
};
const outputPath='reports/growth-priority.json';
let generatedAt=new Date().toISOString();
if(fs.existsSync(outputPath)){
  try{
    const previous=JSON.parse(fs.readFileSync(outputPath,'utf8'));
    const previousPayload={methodology:previous?.methodology,gsc:previous?.gsc,count:previous?.count,items:previous?.items||[]};
    if(JSON.stringify(previousPayload)===JSON.stringify(payload)&&previous?.generatedAt) generatedAt=previous.generatedAt;
  }catch{}
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({generatedAt,...payload}, null, 2) + '\n');
console.log(JSON.stringify({ generated: rows.length, gsc: { available: gscAvailable, ingestionStatus: gscStatus, intentsWithSignals: gscByIntent.size }, top: rows.slice(0,10) }, null, 2));
