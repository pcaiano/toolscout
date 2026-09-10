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
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

function scoreTool(tool, intent) {
  const weights = intent.weights || {};
  const scores = tool.scores || {};
  let total = 0;
  let weight = 0;
  for (const [key, raw] of Object.entries(weights)) {
    const w = Number(raw) || 0;
    if (!w) continue;
    let value = 0;
    if (key === 'category') value = normalize(tool.category) === normalize(intent.category) ? 10 : 0;
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

  const demand = Math.min(30, Math.log10(impressions + 1) * 9);
  const traffic = Math.min(10, Math.log10(clicks + 1) * 5);
  let rankOpportunity = 2;
  if (position > 0 && position <= 3) rankOpportunity = 8;
  else if (position <= 10) rankOpportunity = 20;
  else if (position <= 20) rankOpportunity = 18;
  else if (position <= 40) rankOpportunity = 12;
  else if (position <= 70) rankOpportunity = 6;

  let ctrOpportunity = 0;
  if (position > 0 && position <= 10 && impressions >= 50 && ctr < 1) ctrOpportunity = 6;
  else if (position > 0 && position <= 20 && impressions >= 50 && ctr < 2) ctrOpportunity = 3;

  const score = Math.min(60, Math.round(demand + traffic + rankOpportunity + ctrOpportunity));
  let opportunity = 'develop';
  if (position > 0 && position <= 3) opportunity = 'defend-winner';
  else if (position <= 10) opportunity = clicks > 0 ? 'first-page-growth' : 'first-page-no-clicks';
  else if (position <= 20) opportunity = 'striking-distance';
  else if (position <= 50) opportunity = 'authority-gap';
  else opportunity = 'relevance-gap';
  return { score, opportunity };
}

const rows = intents.map(intent => {
  const exactCategory = tools.filter(tool => normalize(tool.category) === normalize(intent.category));
  const pool = exactCategory.length >= 3 ? exactCategory : tools;
  const ranked = pool
    .map(tool => ({ tool, fit: scoreTool(tool, intent) }))
    .sort((a,b) => b.fit - a.fit || a.tool.name.localeCompare(b.tool.name));
  const top = ranked.slice(0,3);
  const catalogDepth = Math.min(20, ranked.length * 2);
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
  let action = score >= 75 ? 'invest-now' : score >= 60 ? 'build-next' : 'watch';
  if (impressions > 0 && ['first-page-growth','first-page-no-clicks','striking-distance'].includes(search.opportunity)) action = 'optimize-now';
  else if (impressions >= 20 && ['authority-gap','relevance-gap'].includes(search.opportunity)) action = 'repair-existing';
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
  const actionRank = { 'optimize-now': 5, 'repair-existing': 4, 'invest-now': 3, 'build-next': 2, watch: 1 };
  const aObserved = a.searchSignal ? 1 : 0;
  const bObserved = b.searchSignal ? 1 : 0;
  return bObserved - aObserved || (actionRank[b.action] || 0) - (actionRank[a.action] || 0) || b.priorityScore - a.priorityScore || a.title.localeCompare(b.title);
});

const gscAvailable = gscByIntent.size > 0;
const gscStatus = gscAvailable ? 'signals-imported' : gscFilePresent ? 'imported-no-matching-intents' : 'not-imported';
const gscReason = gscAvailable
  ? 'Google Search Console page signals are present and drive growth prioritization. CTR optimization is limited to pages already near page one; weak rankings are treated as relevance or authority problems.'
  : gscFilePresent
    ? 'A Google Search Console export was imported, but it contains no matching best-* intent pages.'
    : 'No reports/gsc-signals.json file exists. This describes ToolScout ingestion state only; it does not mean the site is unverified, unindexed, or invisible to Google.';

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/growth-priority.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  methodology: 'Observed Google Search Console signals rank ahead of heuristic-only opportunities. Search impressions represent visibility, not traffic. CTR work is reserved for first-page or striking-distance pages; positions beyond page two are treated as relevance or authority gaps. Tool candidates are category-gated whenever the catalog has at least three exact-category options.',
  gsc: {
    available: gscAvailable,
    ingestionStatus: gscStatus,
    intentsWithSignals: gscByIntent.size,
    source: gsc.source || null,
    dataState: gsc.dataState || null,
    siteTotals: gsc.siteTotals || null,
    reason: gscReason,
    importCommand: 'node scripts/import-gsc-signals.mjs <gsc-pages.csv>'
  },
  count: rows.length,
  items: rows
}, null, 2) + '\n');
console.log(JSON.stringify({ generated: rows.length, gsc: { available: gscAvailable, ingestionStatus: gscStatus, intentsWithSignals: gscByIntent.size, siteTotals:gsc.siteTotals||null }, top: rows.slice(0,10) }, null, 2));
