import fs from 'node:fs';

const intents = JSON.parse(fs.readFileSync('data/intents.json','utf8'));
const tools = JSON.parse(fs.readFileSync('data/tools.json','utf8'));
const affiliate = JSON.parse(fs.readFileSync('data/affiliate.json','utf8'));
const pipeline = JSON.parse(fs.readFileSync('data/affiliate-pipeline.json','utf8'));
const organicConfig = JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const MIN_GSC_IMPRESSIONS = Number(organicConfig?.thresholds?.minimumGscImpressionsForCtrAction || 20);
const MIN_TOOLS = Number(organicConfig?.editorialGates?.minimumEligibleToolsPerGuide || 2);
const MAX_TOOLS = Number(organicConfig?.editorialGates?.maximumRankedToolsPerGuide || 3);
const MIN_RELEVANCE = Number(organicConfig?.editorialGates?.minimumLexicalRelevance || 0.75);
const gscPath = 'reports/gsc-signals.json';
const gscFilePresent = fs.existsSync(gscPath);
const gsc = gscFilePresent ? JSON.parse(fs.readFileSync(gscPath,'utf8')) : { items: [] };
const gscByIntent = new Map((gsc.items || []).map(x => [String(x.intent), x]));

const pipelineBySlug = new Map((pipeline.verified_programs || []).map(x => [String(x.slug), x]));
const commercialPattern = /crm|seo|marketing|agency|automation|lead|sales|email|project|funnel|productivity|form/i;
const categoryPriority = {crm:10, seo:10, marketing:9, automation:9, business:8, forms:7};
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const STOP = new Set(['best','tool','tools','software','for','with','and','the','a','an','to','of','platform','platforms']);
const intentWords = intent => String(intent?.slug || '').replace(/^best-/,'').replace(/-/g,' ');

function lexicalRelevance(tool, intent) {
  const text = normalize([tool?.name, tool?.category, tool?.description, ...(tool?.features || []), ...(tool?.bestFor || [])].join(' '));
  const phrases = [...(intent.keywords || []), intentWords(intent), intent.title || ''].map(normalize).filter(Boolean);
  let score = 0;
  for (const phrase of phrases) if (phrase.includes(' ') && text.includes(phrase)) score += 3;
  const tokens = new Set(phrases.flatMap(x => x.split(' ')).filter(x => x.length >= 3 && !STOP.has(x)));
  const words = new Set(text.split(' '));
  for (const token of tokens) if (words.has(token)) score += 0.75;
  return score;
}

function eligibleTools(intent) {
  return tools.filter(tool => normalize(tool.category) === normalize(intent.category) && lexicalRelevance(tool, intent) >= MIN_RELEVANCE);
}

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
  if (!impressions) return { score: 0, opportunity: 'unobserved', meaningfulSample: false };

  const meaningfulSample = impressions >= MIN_GSC_IMPRESSIONS || clicks > 0;
  const demand = Math.min(30, Math.log10(impressions + 1) * 9);
  const traffic = Math.min(10, Math.log10(clicks + 1) * 5);
  let rankOpportunity = 2;
  if (position > 0 && position <= 3) rankOpportunity = 8;
  else if (position <= 10) rankOpportunity = 20;
  else if (position <= 20) rankOpportunity = 18;
  else if (position <= 40) rankOpportunity = 12;
  else if (position <= 70) rankOpportunity = 6;

  let ctrOpportunity = 0;
  if (meaningfulSample && position > 0 && position <= 10 && ctr < 1) ctrOpportunity = 6;
  else if (meaningfulSample && position > 0 && position <= 20 && ctr < 2) ctrOpportunity = 3;

  const samplePenalty = meaningfulSample ? 0 : Math.min(15, rankOpportunity * 0.75);
  const score = Math.min(60, Math.max(0, Math.round(demand + traffic + rankOpportunity + ctrOpportunity - samplePenalty)));
  let opportunity = 'develop';
  if (!meaningfulSample) opportunity = 'insufficient-sample';
  else if (position > 0 && position <= 3) opportunity = 'defend-winner';
  else if (position <= 10) opportunity = clicks > 0 ? 'first-page-growth' : 'first-page-no-clicks';
  else if (position <= 20) opportunity = 'striking-distance';
  else if (position <= 50) opportunity = 'authority-gap';
  else opportunity = 'relevance-gap';
  return { score, opportunity, meaningfulSample };
}

const rows = intents.map(intent => {
  const eligible = eligibleTools(intent);
  const ranked = eligible
    .map(tool => ({ tool, fit: scoreTool(tool, intent), relevance: lexicalRelevance(tool, intent) }))
    .sort((a,b) => (b.fit + b.relevance * 1.35) - (a.fit + a.relevance * 1.35) || b.relevance - a.relevance || b.fit - a.fit || a.tool.name.localeCompare(b.tool.name));
  const top = ranked.slice(0, MAX_TOOLS);
  const catalogGap = eligible.length < MIN_TOOLS;
  const catalogDepth = Math.min(20, eligible.length * 2);
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
  const score = impressions > 0 ? Math.min(100, Math.round(search.score + heuristicScore * 0.4)) : heuristicScore;
  const readiness = affiliateTools > 0 ? 'monetizable' : 'needs-affiliate-activation';
  let action = catalogGap ? 'catalog-gap' : score >= 75 ? 'invest-now' : score >= 60 ? 'build-next' : 'watch';
  if (!catalogGap && search.meaningfulSample && ['first-page-growth','first-page-no-clicks','striking-distance'].includes(search.opportunity)) action = 'optimize-now';
  else if (!catalogGap && search.meaningfulSample && ['authority-gap','relevance-gap'].includes(search.opportunity)) action = 'repair-existing';
  return {
    intent: intent.slug,
    title: intent.title,
    category: intent.category,
    priorityScore: score,
    topFit: Number(topFit.toFixed(2)),
    eligibleToolCount: eligible.length,
    minimumEligibleTools: MIN_TOOLS,
    catalogDepth,
    commercialSignal: commercial,
    affiliateSignal,
    searchSignal: impressions > 0 ? { source: 'gsc', impressions, clicks, ctr, position, opportunity: search.opportunity, opportunityScore: search.score, meaningfulSample: search.meaningfulSample } : null,
    signalBasis: impressions > 0 ? (search.meaningfulSample ? 'observed-gsc-majority' : 'observed-gsc-insufficient-sample') : 'heuristic-only',
    monetizationReadiness: readiness,
    topTools: top.map(x => x.tool.slug),
    editorialEligibility: catalogGap ? 'blocked-insufficient-semantic-coverage' : 'eligible',
    action
  };
});

rows.sort((a,b) => {
  const actionRank = { 'optimize-now': 6, 'repair-existing': 6, 'invest-now': 4, 'build-next': 3, 'catalog-gap': 2, watch: 1 };
  const ar = actionRank[a.action] || 0, br = actionRank[b.action] || 0;
  const ai = Number(a.searchSignal?.impressions || 0), bi = Number(b.searchSignal?.impressions || 0);
  return br - ar || b.priorityScore - a.priorityScore || bi - ai || a.title.localeCompare(b.title);
});

const gscAvailable = gscByIntent.size > 0;
const gscStatus = gscAvailable ? 'signals-imported' : gscFilePresent ? 'imported-no-matching-intents' : 'not-imported';
const gscReason = gscAvailable
  ? `Google Search Console page signals drive growth prioritization. Automatic search interventions require at least ${MIN_GSC_IMPRESSIONS} impressions in the measurement window unless clicks are already observed. Weak rankings are treated as relevance or authority problems. Editorial candidates are restricted to exact-category tools with minimum semantic relevance.`
  : gscFilePresent
    ? 'A Google Search Console export was imported, but it contains no matching best-* intent pages.'
    : 'No reports/gsc-signals.json file exists. This describes ToolScout ingestion state only; it does not mean the site is unverified, unindexed, or invisible to Google.';

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/growth-priority.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  methodology: `Observed Google Search Console signals rank growth work. Search impressions represent visibility, not traffic. Search-triggered automatic optimization requires at least ${MIN_GSC_IMPRESSIONS} impressions unless a click is observed. CTR work is reserved for meaningful first-page or striking-distance samples. Positions beyond page two are treated as relevance or authority gaps. Ranked tools must match the exact intent category and score at least ${MIN_RELEVANCE} for semantic relevance. Intents with fewer than ${MIN_TOOLS} eligible tools are blocked from misleading publication.`,
  gsc: {
    available: gscAvailable,
    ingestionStatus: gscStatus,
    intentsWithSignals: gscByIntent.size,
    minimumImpressionsForAutomaticAction: MIN_GSC_IMPRESSIONS,
    source: gsc.source || null,
    dataState: gsc.dataState || null,
    siteTotals: gsc.siteTotals || null,
    reason: gscReason,
    importCommand: 'node scripts/import-gsc-signals.mjs <gsc-pages.csv>'
  },
  editorialGates: { minimumEligibleToolsPerGuide: MIN_TOOLS, maximumRankedToolsPerGuide: MAX_TOOLS, minimumLexicalRelevance: MIN_RELEVANCE, exactCategoryRequired: true },
  count: rows.length,
  items: rows
}, null, 2) + '\n');
console.log(JSON.stringify({ generated: rows.length, blockedCatalogGaps: rows.filter(x=>x.action==='catalog-gap').length, gsc: { available: gscAvailable, ingestionStatus: gscStatus, intentsWithSignals: gscByIntent.size, minimumImpressionsForAutomaticAction: MIN_GSC_IMPRESSIONS, siteTotals:gsc.siteTotals||null }, top: rows.slice(0,10) }, null, 2));
