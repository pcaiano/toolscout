const state = { tools: [] };

const normalize = (value) => String(value || '').toLowerCase();
const tokenize = (value) => normalize(value).split(/[^a-z0-9]+/).filter((x) => x.length > 2);

function scoreTool(tool, query) {
  const q = normalize(query);
  const words = tokenize(query);
  let score = 0;
  const haystack = [tool.name, tool.category, tool.description, ...(tool.features || []), ...(tool.bestFor || [])].map(normalize).join(' ');

  for (const word of words) {
    if (haystack.includes(word)) score += 2;
    if (normalize(tool.category).includes(word)) score += 3;
  }

  if (/free|budget|cheap|affordable/.test(q) && tool.freePlan) score += 5;
  if (/crm|sales/.test(q) && normalize(tool.category) === 'crm') score += 5;
  if (/form|forms|lead collection/.test(q) && normalize(tool.category) === 'forms') score += 5;
  if (/marketing|funnel|email/.test(q) && normalize(tool.category) === 'marketing') score += 4;
  return score;
}

function renderResults(query) {
  const results = state.tools.map((tool) => ({ ...tool, score: scoreTool(tool, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const max = Math.max(1, results[0]?.score || 1);
  const out = document.getElementById('results');
  out.innerHTML = results.map((tool, i) => {
    const rating = Math.round(72 + (tool.score / max) * 26);
    const affiliate = tool.affiliateUrl
      ? `<a class="btn" href="${tool.affiliateUrl}" target="_blank" rel="nofollow sponsored noopener">Explore ${tool.name}</a>`
      : `<a class="btn secondary" href="${tool.sourceUrl}" target="_blank" rel="noopener">View source</a>`;
    return `<article class="result">
      <span class="score">${Math.min(98, rating)}/100</span>
      <h3>${i === 0 ? 'Best match · ' : ''}${tool.name}</h3>
      <div class="meta">${tool.pricing} · ${tool.category}</div>
      <p>${tool.description}</p>
      <div class="chips">${(tool.features || []).slice(0, 5).map((x) => `<span class="chip">${x}</span>`).join('')}</div>
      <div style="margin-top:16px">${affiliate}</div>
    </article>`;
  }).join('');
}

async function boot() {
  try {
    const response = await fetch('/data/tools.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Database unavailable');
    state.tools = await response.json();
  } catch (error) {
    document.getElementById('results').innerHTML = '<div class="result">ToolScout is temporarily unable to load its tool database.</div>';
  }
}

document.getElementById('go').addEventListener('click', () => {
  const query = document.getElementById('need').value.trim();
  if (query) renderResults(query);
});

document.getElementById('need').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') document.getElementById('go').click();
});

boot();
