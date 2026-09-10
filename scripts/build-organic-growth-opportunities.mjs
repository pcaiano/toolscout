import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const growth = JSON.parse(fs.readFileSync('reports/growth-priority.json','utf8'));
const gapsPath = 'reports/competitive-gap-signals.json';
const gaps = fs.existsSync(gapsPath) ? JSON.parse(fs.readFileSync(gapsPath,'utf8')) : { gaps: [] };
const gsc = JSON.parse(fs.readFileSync('reports/gsc-signals.json','utf8'));
const trafficTruthPath = 'data/traffic-truth.json';
const trafficTruth = fs.existsSync(trafficTruthPath) ? JSON.parse(fs.readFileSync(trafficTruthPath,'utf8')) : null;

const threshold = config.thresholds || {};
const minImpressions = Number(threshold.minimumGscImpressionsForCtrAction || 20);
const rows = [];

function executionPlan(lane) {
  if (lane === 'seo-aeo-snippet') return ['sharpen-answer-first-copy','strengthen-query-title-alignment','strengthen-comparison-context','strengthen-internal-links','validate-aeo-geo','publish','measure'];
  if (lane === 'seo-striking-distance') return ['deepen-decision-context','strengthen-query-title-alignment','strengthen-internal-links','strengthen-entity-context','validate-aeo-geo','publish','measure'];
  if (lane === 'seo-authority-depth') return ['deepen-evidence-and-relevance','improve-query-intent-match','add-useful-comparison-context','strengthen-internal-links','validate-aeo-geo','publish','measure'];
  if (lane === 'commercial-intent') return ['improve-existing-decision-surface','strengthen-commercial-intent-context','validate-editorial-neutrality','publish','measure'];
  if (lane === 'editorial-safety') return ['hold-publication','research-catalog-coverage','revalidate-eligibility','recheck-automatically'];
  return ['measure','recheck-automatically'];
}

for (const item of growth.items || []) {
  const s = item.searchSignal;
  const meaningfulSample = Boolean(s?.meaningfulSample ?? (Number(s?.impressions || 0) >= minImpressions || Number(s?.clicks || 0) > 0));
  let lane = 'measure';
  let action = 'measure-and-recheck';
  let reason = 'No strong observed-search trigger yet. Continue automatic measurement.';

  if (item.action === 'catalog-gap') {
    lane = 'editorial-safety';
    action = 'hold-publication-and-research-catalog';
    reason = 'The intent lacks enough semantically eligible tools. Do not publish misleading recommendations; improve catalog coverage automatically first.';
  } else if (meaningfulSample && s?.position > 0 && s.position <= Number(threshold.firstPageMaxPosition || 10)) {
    lane = 'seo-aeo-snippet';
    action = 'optimize-existing';
    reason = s.clicks > 0
      ? 'Observed first-page search traffic: protect ranking and improve answer-first copy, query alignment, comparison context and internal links.'
      : 'Meaningful first-page visibility without clicks: repair query-to-title and snippet intent alignment automatically.';
  } else if (meaningfulSample && s?.position > 0 && s.position <= Number(threshold.strikingDistanceMaxPosition || 20)) {
    lane = 'seo-striking-distance';
    action = 'optimize-existing';
    reason = 'Meaningful striking-distance ranking: deepen decision context, improve query alignment and strengthen relevant internal links automatically.';
  } else if (meaningfulSample && s?.position > 20) {
    lane = 'seo-authority-depth';
    action = 'deepen-existing';
    reason = 'Meaningful search visibility with weak ranking: improve intent match, relevance, depth, evidence, comparisons and authority. Impressions are not traffic.';
  } else if (!s && item.priorityScore >= 75) {
    lane = 'commercial-intent';
    action = 'invest-existing';
    reason = 'High internal commercial/readiness score with no observed search sample yet. Improve the existing surface conservatively and measure the result.';
  }

  rows.push({
    intent: item.intent,
    priorityScore: item.priorityScore,
    lane,
    action,
    reason,
    autonomy: 'fully-autonomous',
    ownerActionRequired: false,
    executionPlan: executionPlan(lane),
    qualityGates: ['canonical-safety','non-duplication','strict-category-fit','semantic-tool-fit','editorial-neutrality','useful-decision-context','public-surface-validation'],
    monetizationReadiness: item.monetizationReadiness,
    searchSignal: s || null,
    topTools: item.topTools || []
  });
}

const competitorCandidates = (gaps.gaps || []).slice(0,100).map(gap => ({
  candidate: gap.slug,
  competitorMentions: gap.mentions,
  sources: gap.sources,
  action: 'auto-research-only',
  ownerActionRequired: false,
  publishGate: 'Require distinct user intent, catalog fit, non-duplication, semantic eligibility, useful decision context and commercial relevance before autonomous publication.',
  reason: 'Repeated competitor URL patterns are research signals, not proof that ToolScout should publish the same page.'
}));

const actionRank = {'optimize-existing':5,'deepen-existing':5,'invest-existing':4,'hold-publication-and-research-catalog':3,'measure-and-recheck':1};
rows.sort((a,b) => (actionRank[b.action]||0)-(actionRank[a.action]||0) || b.priorityScore-a.priorityScore || Number(b.searchSignal?.impressions||0)-Number(a.searchSignal?.impressions||0));
const actionable = rows.filter(x => x.action !== 'measure-and-recheck');
const firstPage = rows.filter(x => x.lane === 'seo-aeo-snippet').length;
const striking = rows.filter(x => x.lane === 'seo-striking-distance').length;
const authority = rows.filter(x => x.lane === 'seo-authority-depth').length;
const siteTotals = gsc.siteTotals || {
  clicks: (gsc.items || []).reduce((n,x) => n + Number(x.clicks || 0), 0),
  impressions: (gsc.items || []).reduce((n,x) => n + Number(x.impressions || 0), 0)
};
const organicClicks = Number(siteTotals.clicks || 0), organicImpressions = Number(siteTotals.impressions || 0);
let organicAcquisitionStatus = 'no-observed-search-visibility';
if (organicClicks >= 10) organicAcquisitionStatus = 'observed-search-acquisition';
else if (organicClicks > 0) organicAcquisitionStatus = 'early-search-acquisition';
else if (organicImpressions >= 500) organicAcquisitionStatus = 'visibility-without-traffic';
else if (organicImpressions > 0) organicAcquisitionStatus = 'early-visibility-without-traffic';

const pages = Array.isArray(gsc.pages) ? gsc.pages : [];
const pageOpportunities = pages
  .filter(x => Number(x.impressions || 0) > 0)
  .map(x => ({
    page: x.page,
    pathname: x.pathname,
    type: x.type,
    clicks: Number(x.clicks || 0),
    impressions: Number(x.impressions || 0),
    ctr: Number(x.ctr || 0),
    position: Number(x.position || 0),
    topQueries: (x.topQueries || []).slice(0,5),
    meaningfulSample: Number(x.impressions || 0) >= minImpressions || Number(x.clicks || 0) > 0,
    opportunityScore: Number((Number(x.impressions || 0) * (x.clicks > 0 ? 1.2 : 1) / Math.max(1, Number(x.position || 100))).toFixed(3)),
    outcome: x.clicks > 0 ? 'traffic-observed' : 'visibility-only'
  }))
  .sort((a,b) => Number(b.meaningfulSample)-Number(a.meaningfulSample) || b.opportunityScore-a.opportunityScore || b.impressions-a.impressions)
  .slice(0,50);

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/organic-growth-opportunities.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  engine: 'ToolScout Search and Answer Opportunity Engine v4',
  objective: 'Autonomously improve qualified SEO, AEO and GEO performance using observed search data while blocking misleading editorial output.',
  acquisitionTruth: {
    status: organicAcquisitionStatus,
    searchClicks: organicClicks,
    searchImpressions: organicImpressions,
    ctr: organicImpressions ? Number((organicClicks / organicImpressions * 100).toFixed(4)) : 0,
    gscStartDate: gsc.startDate || null,
    gscEndDate: gsc.endDate || null,
    gscDataState: gsc.dataState || 'legacy-partial',
    trafficTruthStatus: trafficTruth?.status || 'unavailable',
    rule: 'Impressions are visibility, not traffic. SEO acquisition is validated by Search Console clicks and then by browser-confirmed onsite behavior.'
  },
  autonomyDirective: 'The engine owns observation, prioritization, optimization, validation, publication, measurement and rechecking. The owner is not required to edit content.',
  dailyDecisionRules: [
    'Use real Search Console data for search decisions and browser-confirmed onsite data for traffic outcomes.',
    'Never use impressions alone to validate traffic growth or business projections.',
    `Require at least ${minImpressions} impressions in the measurement window for automatic CTR or ranking conclusions unless a click is already observed.`,
    'Never fill a recommendation list with a wrong-category or semantically weak tool.',
    'Prefer fewer correct recommendations to a fuller but misleading list.',
    'Prefer optimizing existing URLs with meaningful observed demand over creating new URLs.',
    'Treat high-impression low-rank pages as relevance, authority and depth problems.',
    'Use competitor scans for research and opportunity discovery, never as a reason to copy or publish unsupported content.',
    'Measure every autonomous intervention and re-evaluate it from fresh Search Console data.'
  ],
  summary: {
    observedGscIntents: (gsc.items || []).filter(x => Number(x.impressions || 0) > 0).length,
    observedGscPages: pages.filter(x => Number(x.impressions || 0) > 0).length,
    searchClicks: organicClicks,
    searchImpressions: organicImpressions,
    organicAcquisitionStatus,
    actionableOpportunities: actionable.length,
    firstPageOpportunities: firstPage,
    strikingDistanceOpportunities: striking,
    authorityDepthOpportunities: authority,
    competitorResearchCandidates: competitorCandidates.length
  },
  opportunities: rows,
  pageOpportunities,
  autonomousActionQueue: rows.map(x => ({
    intent:x.intent,
    priorityScore:x.priorityScore,
    lane:x.lane,
    action:x.action,
    ownerActionRequired:false,
    executionPlan:x.executionPlan,
    qualityGates:x.qualityGates
  })),
  competitorResearchCandidates: competitorCandidates
}, null, 2) + '\n');

console.log(JSON.stringify({ organicAcquisitionStatus, searchClicks: organicClicks, searchImpressions: organicImpressions, actionable: actionable.length, firstPage, striking, authority, competitorCandidates: competitorCandidates.length, top: rows.slice(0,10) }, null, 2));
