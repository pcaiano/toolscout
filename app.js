const SITE_BASE = '.';
const WORKER_ORIGIN = 'https://toolscout.luxurybuyerintelligence.workers.dev';
const state = { tools: [], intents: [], step: 0, answers: {}, ready: false };
const normalize = (value) => String(value || '').toLowerCase();
const tokenize = (value) => normalize(value).split(/[^a-z0-9]+/).filter((x) => x.length > 2);
const asset = (path) => `${SITE_BASE}${path}`;
const api = (path) => `${WORKER_ORIGIN}${path}`;
const affiliate = (toolSlug) => `${WORKER_ORIGIN}/go/${encodeURIComponent(toolSlug)}`;

const questions = [
  { id: 'goal', title: 'What are you mainly trying to do?', choices: [['crm','Manage customers and sales'],['marketing','Marketing and automation'],['seo','Improve SEO and search visibility'],['forms','Collect information with forms']] },
  { id: 'budget', title: 'What is your monthly budget?', choices: [['free','Free only'],['low','Under $25/month'],['mid','$25–100/month'],['high','$100+/month']] },
  { id: 'team', title: 'Who will use the tool?', choices: [['solo','Just me'],['small','2–5 people'],['team','6–20 people'],['large','20+ people']] },
  { id: 'priority', title: 'What matters most?', choices: [['ease','Easy to use'],['automation','Automation'],['integrations','Integrations'],['features','Advanced features']] }
];

function getSessionId() {
  try {
    const key = 'toolscout_session';
    let id = localStorage.getItem(key);
    if (!id) {
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}
const sessionId = getSessionId();

function logoUrl(tool) {
  try {
    const host = new URL(tool.sourceUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return '';
  }
}

function initials(name) {
  return String(name || 'T').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}

function toolLogo(tool, large = false) {
  const url = logoUrl(tool);
  const size = large ? 56 : 46;
  return `<div class="tool-logo${large ? ' large' : ''}">${url ? `<img src="${url}" alt="${tool.name} logo" width="${size}" height="${size}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : ''}<span class="logo-fallback" ${url ? 'style="display:none"' : ''}>${initials(tool.name)}</span></div>`;
}

function fitReasons(tool, query, intent, profile = {}) {
  const q = normalize(query);
  const haystack = [tool.category, tool.description, ...(tool.features || []), ...(tool.bestFor || [])].map(normalize).join(' ');
  const reasons = [];
  if (intent && intent.category === tool.category) reasons.push(`Strong ${tool.category} fit`);
  if (profile.budget === 'free' && tool.freePlan) reasons.push('Free plan available');
  if (profile.priority === 'automation' && haystack.includes('automation')) reasons.push('Automation is a strength');
  if (profile.priority === 'integrations' && haystack.includes('integrations')) reasons.push('Good integration coverage');
  if (profile.team && haystack.includes(profile.team === 'solo' ? 'solopreneurs' : profile.team === 'small' ? 'small businesses' : 'teams')) reasons.push('Fits your team size');
  if (!reasons.length && q) {
    const words = tokenize(q);
    const matched = words.find(w => haystack.includes(w));
    if (matched) reasons.push(`Matches your ${matched} needs`);
  }
  if (!reasons.length && tool.bestFor?.length) reasons.push(`Best for ${tool.bestFor[0]}`);
  return reasons.slice(0, 3);
}

async function boot() {
  const [toolsResponse, intentsResponse] = await Promise.all([
    fetch(asset('/data/tools.json'), { cache: 'no-store' }),
    fetch(asset('/data/intents.json'), { cache: 'no-store' })
  ]);
  if (!toolsResponse.ok || !intentsResponse.ok) throw new Error('Database unavailable');
  state.tools = await toolsResponse.json();
  state.intents = await intentsResponse.json();
  state.ready = true;
  const go = document.getElementById('go');
  if (go) go.disabled = false;
}

function detectIntent(query) {
  const q = normalize(query); let best = null, bestScore = 0;
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

function scoreTool(tool, query, intent, profile = {}) {
  const q = normalize(query), words = tokenize(query);
  const haystack = [tool.name, tool.category, tool.description, ...(tool.features || []), ...(tool.bestFor || [])].map(normalize).join(' ');
  let score = 40;
  for (const word of words) {
    if (haystack.includes(word)) score += 3;
    if (normalize(tool.category).includes(word)) score += 3;
  }
  if (/free|budget|cheap|affordable/.test(q) && tool.freePlan) score += 7;
  if (intent && intent.category === tool.category) score += 18;
  if (intent) {
    const w = intent.weights || {};
    if (w.freePlan && tool.freePlan) score += w.freePlan;
    if (w.price && /free|affordable|budget|low cost/i.test(tool.pricing || '')) score += w.price;
    if (w.automation && haystack.includes('automation')) score += w.automation;
    if (w.integrations && haystack.includes('integrations')) score += w.integrations;
    if (w.features) score += Math.min(w.features, (tool.features || []).length * 2);
  }
  if (profile.goal && normalize(tool.category) === profile.goal) score += 18;
  if (profile.budget === 'free' && tool.freePlan) score += 15;
  if (profile.budget === 'low' && /free|low|affordable|under/i.test(tool.pricing || '')) score += 6;
  if (profile.priority === 'automation' && haystack.includes('automation')) score += 10;
  if (profile.priority === 'integrations' && haystack.includes('integrations')) score += 10;
  if (profile.priority === 'features') score += Math.min(8, (tool.features || []).length);
  return Math.round(Math.min(99, score));
}

async function postEvent(path, payload) {
  try { await fetch(api(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }); } catch {}
}
async function trackSearch(intent, profile = {}) { postEvent('/api/search', { intent: intent?.slug || 'general', session: sessionId, profile, source: 'recommendation' }); }
async function trackClick(tool, intent, profile = {}) { if (tool) postEvent('/api/click', { tool: tool.slug, intent: intent?.slug || 'general', session: sessionId, profile, source: 'recommendation' }); }

function renderResults(query, profile = {}) {
  if (!state.ready) return;
  const intent = detectIntent(query);
  trackSearch(intent, profile);
  const results = state.tools.map(tool => ({ ...tool, score: scoreTool(tool, query, intent, profile) })).sort((a, b) => b.score - a.score).slice(0, 3);
  const out = document.getElementById('results');
  if (!results.length) {
    out.innerHTML = '<div class="empty-state"><strong>No close matches yet.</strong><span>Try describing the job, budget or team in a little more detail.</span></div>';
    return;
  }
  out.innerHTML = `<div class="profile-card"><div><span class="eyebrow">Your fit profile</span><h2>We found a few strong matches.</h2></div><div class="chips">${profile.goal ? `<span class="chip">${profile.goal}</span>` : ''}${profile.budget ? `<span class="chip">${profile.budget}</span>` : ''}${profile.team ? `<span class="chip">${profile.team}</span>` : ''}${profile.priority ? `<span class="chip">${profile.priority}</span>` : ''}</div></div>` + results.map((tool, i) => {
    const cta = affiliate(tool.slug);
    const reasons = fitReasons(tool, query, intent, profile);
    return `<article class="result-card ${i === 0 ? 'featured' : ''}"><div class="result-top"><div class="brand-row">${toolLogo(tool)}<div><div class="meta">${tool.category}</div><h3>${tool.name}</h3></div></div><div class="match-score"><span>Match</span><strong>${tool.score}%</strong></div></div><div class="tool-proof"><span>${tool.pricing}</span>${tool.freePlan ? '<span>Free plan</span>' : ''}</div><p>${tool.description}</p><div class="reason-grid">${reasons.map(reason => `<div class="reason"><span>✓</span>${reason}</div>`).join('')}</div><div class="chips">${(tool.features || []).slice(0, 5).map(x => `<span class="chip">${x}</span>`).join('')}</div><div class="result-bottom"><span class="fit-note">${i === 0 ? 'Top recommendation' : intent ? `Also worth considering for ${intent.title}` : 'Strong alternative'}</span><a class="btn" href="${cta}" target="_blank" rel="nofollow sponsored noopener" data-tool="${tool.slug}">Explore ${tool.name} <span>→</span></a></div></article>`;
  }).join('');
  out.querySelectorAll('[data-tool]').forEach(link => link.addEventListener('click', () => trackClick(results.find(t => t.slug === link.dataset.tool), intent, profile)));
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showQuestion() {
  const q = questions[state.step];
  document.getElementById('guided').style.display = 'block';
  document.getElementById('progress').textContent = `Question ${state.step + 1} of ${questions.length}`;
  document.getElementById('question').textContent = q.title;
  document.getElementById('choices').innerHTML = q.choices.map(([value, label]) => `<button type="button" class="choice ${state.answers[q.id] === value ? 'selected' : ''}" data-value="${value}">${label}</button>`).join('');
  document.getElementById('back').style.visibility = state.step ? 'visible' : 'hidden';
  document.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
    state.answers[q.id] = btn.dataset.value;
    if (state.step < questions.length - 1) { state.step++; showQuestion(); }
    else { document.getElementById('guided').style.display = 'none'; renderResults('guided recommendation', { ...state.answers }); }
  }));
}

function init() {
  const guidedStart = document.getElementById('guidedStart');
  const back = document.getElementById('back');
  const go = document.getElementById('go');
  const need = document.getElementById('need');
  if (!guidedStart || !back || !go || !need) return;
  go.disabled = true;
  guidedStart.addEventListener('click', () => { if (!state.ready) return; state.step = 0; state.answers = {}; document.getElementById('results').innerHTML = ''; showQuestion(); });
  back.addEventListener('click', () => { if (state.step > 0) { state.step--; showQuestion(); } });
  go.addEventListener('click', () => { const query = need.value.trim(); if (!query) { need.focus(); return; } renderResults(query); });
  need.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go.click(); } });
  need.addEventListener('input', () => { go.disabled = !need.value.trim() || !state.ready; });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  boot().catch(() => {
    const out = document.getElementById('results');
    if (out) out.innerHTML = '<div class="empty-state"><strong>ToolScout is temporarily unable to load its database.</strong><span>Please try again in a moment.</span></div>';
  });
});
