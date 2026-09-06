import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const growth = JSON.parse(fs.readFileSync('reports/growth-priority.json','utf8'));
const gapsPath = 'reports/competitive-gap-signals.json';
const gaps = fs.existsSync(gapsPath) ? JSON.parse(fs.readFileSync(gapsPath,'utf8')) : { gaps: [] };
const gsc = JSON.parse(fs.readFileSync('reports/gsc-signals.json','utf8'));

const threshold = config.thresholds || {};
const rows = [];

for (const item of growth.items || []) {
  const s = item.searchSignal;
  let lane = 'develop-authority';
  let action = 'watch';
  let reason = 'No strong observed-search trigger yet.';

  if (s?.impressions > 0 && s.position > 0 && s.position <= Number(threshold.firstPageMaxPosition || 10)) {
    lane = 'seo-aeo-snippet';
    action = 'optimize-existing';
    reason = 'Observed first-page visibility: protect ranking, sharpen answer-first snippet, comparison context and internal links.';
  } else if (s?.impressions > 0 && s.position <= Number(threshold.strikingDistanceMaxPosition || 20)) {
    lane = 'seo-striking-distance';
    action = 'optimize-existing';
    reason = 'Observed striking-distance ranking: deepen decision context and strengthen relevant internal links.';
  } else if (s?.impressions >= Number(threshold.minimumGscImpressionsForCtrAction || 20) && s.position > 20) {
    lane = 'seo-authority-depth';
    action = 'deepen-existing';
    reason = 'Meaningful search demand with weak ranking: improve relevance, depth, evidence, comparisons and authority rather than creating a new URL.';
  } else if (item.priorityScore >= 75) {
    lane = 'commercial-intent';
    action = 'invest-existing';
    reason = 'High internal commercial/readiness score; improve the existing decision surface before expanding URL count.';
  }

  rows.push({
    intent: item.intent,
    priorityScore: item.priorityScore,
    lane,
    action,
    reason,
    monetizationReadiness: item.monetizationReadiness,
    searchSignal: s || null,
    topTools: item.topTools || []
  });
}

const competitorCandidates = (gaps.gaps || []).slice(0,100).map(gap => ({
  candidate: gap.slug,
  competitorMentions: gap.mentions,
  sources: gap.sources,
  action: 'research-only',
  publishGate: 'Do not auto-publish. Require evidence of distinct user intent, catalog fit, non-duplication/canonical safety, useful decision context and commercial relevance.',
  reason: 'Repeated competitor URL pattern suggests a possible coverage gap, not proof of search demand or editorial value.'
}));

rows.sort((a,b) => b.priorityScore - a.priorityScore);
const firstPage = rows.filter(x => x.lane === 'seo-aeo-snippet').length;
const striking = rows.filter(x => x.lane === 'seo-striking-distance').length;
const authority = rows.filter(x => x.lane === 'seo-authority-depth').length;

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/organic-growth-opportunities.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  engine: 'ToolScout Organic Growth Engine v1',
  objective: 'Combine SEO demand, AEO/GEO answer readiness, commercial intent, affiliate readiness and competitor gap signals without allowing affiliate economics or competitor behavior to determine editorial winners.',
  dailyDecisionRules: [
    'Prefer optimizing existing URLs with observed demand over creating new URLs.',
    'Treat first-page and striking-distance pages as answer/snippet/internal-link opportunities.',
    'Treat high-impression low-rank pages as relevance/authority/depth problems, not CTR problems.',
    'Use competitor scans only to surface research candidates; never copy content and never auto-publish from competitor evidence alone.',
    'Affiliate readiness can prioritize commercial work but cannot change editorial ranking of tools.',
    'AEO/GEO requires answer-first copy, explicit decision context, structured entities, comparisons, freshness and crawlable canonical pages.'
  ],
  summary: {
    observedGscIntents: (gsc.items || []).filter(x => Number(x.impressions || 0) > 0).length,
    firstPageOpportunities: firstPage,
    strikingDistanceOpportunities: striking,
    authorityDepthOpportunities: authority,
    competitorResearchCandidates: competitorCandidates.length
  },
  opportunities: rows,
  competitorResearchCandidates: competitorCandidates
}, null, 2) + '\n');

console.log(JSON.stringify({ firstPage, striking, authority, competitorCandidates: competitorCandidates.length, top: rows.slice(0,10) }, null, 2));
