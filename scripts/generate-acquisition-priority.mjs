import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://trytoolscout.org';
const readJson = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); }
  catch { return fallback; }
};

const opportunities = readJson('reports/growth-priority.json', {});
const queue = readJson('reports/distribution-queue.json', {});
const topics = readJson('data/acquisition-content.json', { topics: [] }).topics || [];
const items = Array.isArray(opportunities) ? opportunities : (opportunities.items || opportunities.opportunities || []);
const q = Array.isArray(queue) ? queue : (queue.items || []);
const topicMap = new Map(topics.map(x => [String(x.intent || x.slug || ''), x]));

const score = x => Number(x.opportunity_score ?? x.priorityScore ?? x.score ?? 0);
const demand = x => Number(x.search_sessions ?? x.searches ?? x.demand ?? 0);

const ranked = items.map(x => {
  const slug = String(x.intent_slug || x.intent || x.slug || '');
  const topic = topicMap.get(slug);
  const dist = q.find(y => String(y.intent_slug || y.intent || y.slug || '') === slug);
  const page = fs.existsSync(path.join(ROOT, `${slug}.html`)) ||
    fs.existsSync(path.join(ROOT, 'blog', `${topic?.slug || slug}.html`));
  const opportunity = score(x);
  const observedDemand = demand(x);
  const distributionReady = Boolean(dist);
  const contentReady = Boolean(topic || page);
  const action = !page ? 'publish' : !distributionReady ? 'prepare-distribution' : 'distribute';
  const actionScore = Math.min(100,
    opportunity +
    (observedDemand > 0 ? 10 : 0) +
    (distributionReady ? 5 : 0) +
    (contentReady ? 5 : 0)
  );

  return {
    intent_slug: slug,
    action,
    action_score: Number(actionScore.toFixed(1)),
    opportunity_score: opportunity,
    observed_demand: observedDemand,
    demand_source: observedDemand > 0 ? 'source-report' : 'none',
    page_ready: page,
    content_ready: contentReady,
    distribution_ready: distributionReady,
    url: `${BASE}/${slug}.html`
  };
}).filter(x => x.intent_slug)
  .sort((a, b) => b.action_score - a.action_score)
  .slice(0, 20);

const next = ranked[0] || null;
const report = {
  generated_at: new Date().toISOString(),
  next_action: next,
  actions: ranked,
  method: 'priority score + observed demand when available + content/page readiness + distribution readiness',
  note: 'Priority score is heuristic planning data. observed_demand is only populated when supplied by the source report; no search volume is inferred.'
};

fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'reports', 'acquisition-priority.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify({ next_action: next?.intent_slug || null, count: ranked.length }));
