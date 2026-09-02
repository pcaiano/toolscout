export const round = value => Number(Number(value || 0).toFixed(1));
export const percent = (numerator, denominator) => denominator > 0 ? round((numerator / denominator) * 100) : null;

export function opportunityScore({ humanSessions = 0, outboundRate = 0, monetizedOutbound = 0, outboundClicks = 0 }) {
  const traffic = Math.min(Number(humanSessions), 25) / 25 * 30;
  const propensity = Math.min(Number(outboundRate || 0), 50) / 50 * 40;
  const coverage = Number(outboundClicks) > 0 ? Number(monetizedOutbound) / Number(outboundClicks) * 30 : 0;
  return round(traffic + propensity + coverage);
}

export function gapScore({ unmonetizedOutbound = 0, humanSessions = 0, outboundRate = 0 }) {
  return round(Number(unmonetizedOutbound) * 10 + Math.min(Number(humanSessions), 25) * 2 + Math.min(Number(outboundRate || 0), 50));
}

export function summarizeCommercialClicks(clicks, sessionRows = {}, overallHumanSessions = 0) {
  const maps = { page: new Map(), intent: new Map(), tool: new Map() };
  const totals = { outboundClicks: 0, monetizedOutbound: 0, unmonetizedOutbound: 0, monetizationUnknown: 0, recommendationAssisted: 0, directOutbound: 0 };
  const add = (dimension, key, row) => {
    if (!key) return;
    const current = maps[dimension].get(key) || { key, outboundClicks: 0, monetizedOutbound: 0, unmonetizedOutbound: 0, monetizationUnknown: 0, sessions: new Set() };
    current.outboundClicks += 1;
    current.sessions.add(row.session_id);
    if (Number(row.affiliate_active_at_click) === 1) current.monetizedOutbound += 1;
    else if (row.affiliate_active_at_click === 0 || row.affiliate_active_at_click === '0') current.unmonetizedOutbound += 1;
    else current.monetizationUnknown += 1;
    maps[dimension].set(key, current);
  };
  for (const row of clicks || []) {
    totals.outboundClicks += 1;
    if (Number(row.affiliate_active_at_click) === 1) totals.monetizedOutbound += 1;
    else if (row.affiliate_active_at_click === 0 || row.affiliate_active_at_click === '0') totals.unmonetizedOutbound += 1;
    else totals.monetizationUnknown += 1;
    if (Number(row.recommendation_assisted) === 1) totals.recommendationAssisted += 1;
    else totals.directOutbound += 1;
    add('page', row.page_slug, row);
    add('intent', row.attributed_intent, row);
    add('tool', row.tool_slug, row);
  }
  const finish = (dimension, map) => [...map.values()].map(item => {
    const knownSessions = dimension === 'tool'
      ? Number(overallHumanSessions)
      : Number(sessionRows[dimension]?.[item.key] || 0);
    const outboundRate = percent(item.outboundClicks, knownSessions);
    return { [`${dimension}_slug`]: item.key, humanSessions: knownSessions, outboundSessions: item.sessions.size, outboundClicks: item.outboundClicks, outboundRate, monetizedOutbound: item.monetizedOutbound, unmonetizedOutbound: item.unmonetizedOutbound, monetizationUnknown: item.monetizationUnknown };
  }).sort((a, b) => b.outboundClicks - a.outboundClicks);
  return { totals, rankings: { page: finish('page', maps.page), intent: finish('intent', maps.intent), tool: finish('tool', maps.tool) } };
}

export function buildCommercialPriorities(summary) {
  const toolRows = summary.rankings.tool || [];
  const revenueGaps = toolRows.filter(row => row.unmonetizedOutbound > 0).map(row => ({ ...row, score: gapScore(row) })).sort((a, b) => b.score - a.score);
  const dimensions = ['page', 'intent', 'tool'];
  const revenueOpportunities = dimensions.flatMap(dimension => (summary.rankings[dimension] || []).filter(row => row.humanSessions > 0 && row.outboundClicks > 0).map(row => ({ dimension, slug: row[`${dimension}_slug`], ...row, score: opportunityScore(row) }))).sort((a, b) => b.score - a.score);
  return { revenueGaps, revenueOpportunities };
}
