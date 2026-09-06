import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const growth = JSON.parse(fs.readFileSync('reports/growth-priority.json','utf8'));
const gapsPath = 'reports/competitive-gap-signals.json';
const gaps = fs.existsSync(gapsPath) ? JSON.parse(fs.readFileSync(gapsPath,'utf8')) : { gaps: [] };
const gsc = JSON.parse(fs.readFileSync('reports/gsc-signals.json','utf8'));

const threshold = config.thresholds || {};
const rows = [];

function executionPlan(lane) {
  if (lane === 'seo-aeo-snippet') return ['sharpen-answer-first-copy','strengthen-comparison-context','strengthen-internal-links','validate-aeo-geo'];
  if (lane === 'seo-striking-distance') return ['deepen-decision-context','strengthen-internal-links','strengthen-entity-context','validate-aeo-geo'];
  if (lane === 'seo-authority-depth') return ['deepen-evidence-and-relevance','add-useful-comparison-context','strengthen-internal-links','validate-aeo-geo'];
  if (lane === 'commercial-intent') return ['improve-existing-decision-surface','strengthen-commercial-intent-context','validate-editorial-neutrality'];
  return ['measure'];
}

for (const item of growth.items || []) {
  const s = item.searchSignal;
  let lane = 'develop-authority';
  let action = 'watch';
  let reason = 'No strong observed-search trigger yet.';

  if (s?.impressions > 0 && s.position > 0 && s.position <= Number(threshold.firstPageMaxPosition || 10)) {
    lane = 'seo-aeo-snippet'; action = 'optimize-existing';
    reason = 'Observed first-page visibility: protect ranking, sharpen answer-first snippet, comparison context and internal links.';
  } else if (s?.impressions > 0 && s.position <= Number(threshold.strikingDistanceMaxPosition || 20)) {
    lane = 'seo-striking-distance'; action = 'optimize-existing';
    reason = 'Observed striking-distance ranking: deepen decision context and strengthen relevant internal links.';
  } else if (s?.impressions >= Number(threshold.minimumGscImpressionsForCtrAction || 20) && s.position > 20) {
    lane = 'seo-authority-depth'; action = 'deepen-existing';
    reason = 'Meaningful search demand with weak ranking: improve relevance, depth, evidence, comparisons and authority rather than creating a new URL.';
  } else if (item.priorityScore >= 75) {
    lane = 'commercial-intent'; action = 'invest-existing';
    reason = 'High internal commercial/readiness score; improve the existing decision surface before expanding URL count.';
  }

  rows.push({
    intent: item.intent, priorityScore: item.priorityScore, lane, action, reason,
    autonomy: action === 'watch' ? 'measure-only' : 'auto-execute-through-seo-aeo-geo-pipeline',
    executionPlan: executionPlan(lane),
    qualityGates: ['canonical-safety','non-duplication','editorial-neutrality','useful-decision-context','public-surface-validation'],
    monetizationReadiness: item.monetizationReadiness, searchSignal: s || null, topTools: item.topTools || []
  });
}

const competitorCandidates = (gaps.gaps || []).slice(0,100).map(gap => ({
  candidate: gap.slug, competitorMentions: gap.mentions, sources: gap.sources, action: 'research-only',
  autonomy: 'auto-research-but-no-auto-publish-from-competitor-evidence-alone',
  publishGate: 'Require evidence of distinct user intent, catalog fit, non-duplication/canonical safety, useful decision context and commercial relevance.',
  reason: 'Repeated competitor URL pattern suggests a possible coverage gap, not proof of search demand or editorial value.'
}));

rows.sort((a,b) => b.priorityScore - a.priorityScore);
const actionable = rows.filter(x => x.action !== 'watch');
const firstPage = rows.filter(x => x.lane === 'seo-aeo-snippet').length;
const striking = rows.filter(x => x.lane === 'seo-striking-distance').length;
const authority = rows.filter(x => x.lane === 'seo-authority-depth').length;

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/organic-growth-opportunities.json', JSON.stringify({
  generatedAt: new Date().toISOString(), engine: 'ToolScout Search & Answer Opportunity Engine v2',
  objective: 'Convert observed search and answer-engine signals into autonomous SEO/AEO/GEO actions that improve qualified traffic, decision quality and monetization potential while preserving editorial neutrality.',
  autonomyDirective: 'Automate safe growth actions by default. The Command Center is an observability surface, not a work queue. Escalate only blocked, ambiguous, destructive or policy-sensitive decisions.',
  dailyDecisionRules: [
    'Prefer autonomous execution over owner work orders whenever quality gates can make the action safe.',
    'Prefer optimizing existing URLs with observed demand over creating new URLs.',
    'Treat first-page and striking-distance pages as answer/snippet/internal-link opportunities.',
    'Treat high-impression low-rank pages as relevance/authority/depth problems, not CTR problems.',
    'Use competitor scans only to surface research candidates; never copy content and never auto-publish from competitor evidence alone.',
    'Affiliate readiness may prioritize commercial work but cannot change editorial ranking of tools.',
    'AEO/GEO requires answer-first copy, explicit decision context, structured entities, comparisons, freshness and crawlable canonical pages.',
    'Measure every autonomous intervention so future prioritization can learn from outcomes.'
  ],
  summary: { observedGscIntents: (gsc.items || []).filter(x => Number(x.impressions || 0) > 0).length, actionableOpportunities: actionable.length, firstPageOpportunities: firstPage, strikingDistanceOpportunities: striking, authorityDepthOpportunities: authority, competitorResearchCandidates: competitorCandidates.length },
  opportunities: rows, autonomousActionQueue: actionable.map(x => ({ intent:x.intent, priorityScore:x.priorityScore, lane:x.lane, executionPlan:x.executionPlan, qualityGates:x.qualityGates })), competitorResearchCandidates: competitorCandidates
}, null, 2) + '\n');

console.log(JSON.stringify({ actionable: actionable.length, firstPage, striking, authority, competitorCandidates: competitorCandidates.length, top: rows.slice(0,10) }, null, 2));
