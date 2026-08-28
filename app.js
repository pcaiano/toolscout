const state = { tools: [], intents: [] };
const normalize = (value) => String(value || '').toLowerCase();
const tokenize = (value) => normalize(value).split(/[^a-z0-9]+/).filter((x) => x.length > 2);

async function boot() {
  const [toolsResponse, intentsResponse] = await Promise.all([
    fetch('/data/tools.json', { cache: 'no-store' }),
    fetch('/data/intents.json', { cache: 'no-store' })
  ]);
  if (!toolsResponse.ok || !intentsResponse.ok) throw new Error('Database unavailable');
  state.tools = await toolsResponse.json();
  state.intents = await intentsResponse.json();
}

function detectIntent(query) {
  const q = normalize(query);
  let best = null;
  let bestScore = 0;
  for (const intent of state.intents) {
    let score = 0;
    for (const keyword of intent.keywords || []) if (q.includes(normalize(keyword))) score += 2;
    if (intent.slug.includes('free') && /free|budget|cheap|affordable/.test(q)) score += 5;
    if (intent.slug.includes('crm') && /crm|sales|customer/.test(q)) score += 4;
    if (intent.slug.includes('agency') && /agency|agencies|client/.test(q)) score += 4;
    if (intent.slug.includes('seo') && /seo|keywords|organic|search/.test(q)) score += 4;
    if (score > bestScore) { best = intent; bestScore = score; }
  }
  return best;
}

function scoreTool(tool, query, intent) {
  const q = normalize(query);
  const words = tokenize(query);
  const haystack = [tool.name, tool.category, tool.description, ...(tool.features || []), ...(tool.bestFor || [])].map(normalize).join(' ');
  let score = 40;
  for (const word of words) {
    if (haystack.includes(word)) score += 3;
    if (normalize(tool.category).includes(word)) score += 3;
  }
  if (/free|budget|cheap|affordable/.test(q) && tool.freePlan) score += 7;
  if (intent) {
    if (intent.category === tool.category) score += 18;
    const w = intent.weights || {};
    if (w.freePlan && tool.freePlan) score += w.freePlan;
    if (w.price && /free|affordable|budget|low cost/i.test(tool.pricing || '')) score += w.price;
    if (w.automation && haystack.includes('automation')) score += w.automation;
    if (w.integrations && haystack.includes('integrations')) score += w.integrations;
    if (w.features) score += Math.min(w.features, (tool.features || []).length * 2);
  }
  return Math.min(99, score);
}

function trackClick(tool, intent) {
  const event = { tool: tool.slug, intent: intent?.slug || 'general', timestamp: new Date().toISOString() };
  const clicks = JSON.parse(localStorage.getItem('toolscout_clicks') || '[]');
  clicks.push(event);
  localStorage.setItem('toolscout_clicks', JSON.stringify(clicks.slice(-500)));
}

function renderResults(query) {
  const intent = detectIntent(query);
  const results = state.tools.map((tool) => ({ ...tool, score: scoreTool(tool, query, intent) }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  const out = document.getElementById('results');
  out.innerHTML = results.map((tool, i) => {
    const cta = tool.affiliateUrl || tool.sourceUrl;
    return `<article class="result">
      <span class="score">${tool.score}/100</span>
      <h3>${i === 0 ? 'Best match · ' : ''}${tool.name}</h3>
      <div class="meta">${tool.pricing} · ${tool.category}</div>
      <p>${tool.description}</p>
      <div class="chips">${(tool.features || []).slice(0, 5).map((x) => `<span class="chip">${x}</span>`).join('')}</div>
      <div class="actions" style="margin-top:16px"><span class="hint">${intent ? `Matched for: ${intent.title}` : 'Matched to your request'}</span><a class="btn" href="${cta}" target="_blank" rel="nofollow sponsored noopener" data-tool="${tool.slug}">See tool</a></div>
    </article>`;
  }).join('');
  out.querySelectorAll('[data-tool]').forEach((link) => link.addEventListener('click', () => trackClick(results.find(t => t.slug === link.dataset.tool), intent)));
}

document.getElementById('go').addEventListener('click', () => {
  const query = document.getElementById('need').value.trim();
  if (query) renderResults(query);
});
document.getElementById('need').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') document.getElementById('go').click();
});

boot().catch(() => {
  document.getElementById('results').innerHTML = '<div class="result">ToolScout is temporarily unable to load its database.</div>';
});
