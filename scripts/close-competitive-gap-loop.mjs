import fs from 'node:fs/promises';

const readJson = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
};
const now = new Date().toISOString();
const config = await readJson('data/organic-growth-engine.json', {});
const catalogConfig = await readJson('data/catalog-engine.json', {});
const gaps = await readJson('reports/competitive-gap-signals.json', { gaps: [] });
const tools = await readJson('data/tools.json', []);
const previousProfiles = await readJson('data/competitive-gap-profiles.json', []);
const previousState = await readJson('reports/competitive-gap-state.json', { candidates: {} });
const gsc = await readJson('reports/gsc-signals.json', { pages: [] });

const minSignals = Number(catalogConfig.discovery?.minimumIndependentMarketSignals || 2);
const maxNewProfiles = Number(catalogConfig.discovery?.maxCompetitiveGapProfilesPerCycle || 3);
const minimumCapabilities = Number(catalogConfig.discovery?.minimumVerifiedCapabilitiesForGapProfile || 2);
const timeoutMs = 12000;
const GENERIC_ENTITY_SUFFIXES = new Set(['ai','app','apps','software','tool','tools','platform','platforms','online']);
const SOCIAL_HOSTS = ['facebook.com','instagram.com','linkedin.com','twitter.com','x.com','youtube.com','youtu.be','tiktok.com','reddit.com','pinterest.com'];
const competitorHosts = new Set((config.competitors || []).map(x => {
  try { return new URL(x.baseUrl).hostname.toLowerCase().replace(/^www\./,''); } catch { return ''; }
}).filter(Boolean));

function slugify(value) {
  return String(value || '').toLowerCase().replace(/\.(html?|php)$/,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function entityKey(value) {
  const parts = slugify(value).split('-').filter(Boolean);
  while (parts.length > 1 && GENERIC_ENTITY_SUFFIXES.has(parts.at(-1))) parts.pop();
  return parts.join('-');
}

function compact(value) {
  return entityKey(value).replace(/-/g,'');
}

function humanName(slug) {
  const acronyms = new Map([['ai','AI'],['seo','SEO'],['crm','CRM'],['api','API'],['gpt','GPT']]);
  return slugify(slug).split('-').filter(Boolean).map(x => acronyms.get(x) || x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
}

function hostKey(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    return host.split('.').join('');
  } catch {
    return '';
  }
}

function isCompetitorHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./,'');
  return [...competitorHosts].some(x => host === x || host.endsWith(`.${x}`));
}

function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./,'');
  return SOCIAL_HOSTS.some(x => host === x || host.endsWith(`.${x}`));
}

const existingEntityKeys = new Set();
for (const tool of tools) {
  for (const value of [tool?.slug, tool?.name]) {
    const key = compact(value);
    if (key) existingEntityKeys.add(key);
  }
  const host = hostKey(tool?.sourceUrl);
  if (host) existingEntityKeys.add(host.replace(/com$|io$|ai$|co$|net$|org$/,''));
}

function toolAlreadyCovered(slug) {
  const key = compact(slug);
  if (!key) return false;
  if (existingEntityKeys.has(key)) return true;
  return [...existingEntityKeys].some(x => x.length >= 5 && key.length >= 5 && (x === key || x.includes(key) || key.includes(x)));
}

function stripHtml(value) {
  return String(value || '').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
}

function meta(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re1 = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i');
  return (String(html).match(re1)?.[1] || String(html).match(re2)?.[1] || '').replace(/\s+/g,' ').trim();
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'ToolScoutCompetitiveGapBot/1.0 (+https://trytoolscout.org)' }
    });
    if (!res.ok) return { status: 'error', httpStatus: res.status, finalUrl: res.url || url, html: '' };
    const html = await res.text();
    return { status: 'ok', httpStatus: res.status, finalUrl: res.url || url, html };
  } catch (error) {
    return { status: 'error', httpStatus: null, finalUrl: url, html: '', error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(re)) {
    try {
      const url = new URL(match[1].trim(), baseUrl);
      if (!/^https?:$/.test(url.protocol)) continue;
      out.push({ url: url.toString(), label: stripHtml(match[2]).slice(0,160) });
    } catch {}
  }
  return out;
}

function sourceScore(url, label, slug) {
  let parsed;
  try { parsed = new URL(url); } catch { return -100; }
  if (isCompetitorHost(parsed.hostname) || isBlockedHost(parsed.hostname)) return -100;
  const entity = entityKey(slug);
  const entityCompact = entity.replace(/-/g,'');
  const host = parsed.hostname.toLowerCase().replace(/^www\./,'').replace(/[^a-z0-9]/g,'');
  const path = parsed.pathname.toLowerCase().replace(/[^a-z0-9]/g,'');
  const labelText = slugify(label).replace(/-/g,' ');
  let score = 0;
  if (entityCompact.length >= 4 && host.includes(entityCompact)) score += 9;
  const tokens = entity.split('-').filter(x => x.length >= 3 && !GENERIC_ENTITY_SUFFIXES.has(x));
  for (const token of tokens) {
    if (host.includes(token)) score += 3;
    else if (path.includes(token)) score += 1;
  }
  if (/\bofficial\b/i.test(labelText)) score += 4;
  if (/\bwebsite\b|\bhomepage\b|\bvisit\b|\bopen\b/i.test(labelText)) score += 2;
  return score;
}

async function discoverOfficialSource(gap) {
  const byUrl = new Map();
  for (const exampleUrl of (gap.exampleUrls || []).slice(0, 3)) {
    const page = await fetchHtml(exampleUrl);
    if (page.status !== 'ok') continue;
    const links = extractLinks(page.html, page.finalUrl);
    const direct = links.filter(link => {
      try {
        const u = new URL(link.url);
        return !isCompetitorHost(u.hostname) && !isBlockedHost(u.hostname);
      } catch { return false; }
    });
    for (const link of direct.slice(0, 80)) {
      const score = sourceScore(link.url, link.label, gap.slug);
      if (score < 4) continue;
      const key = (() => { try { return new URL(link.url).origin; } catch { return link.url; } })();
      const row = byUrl.get(key) || { url: link.url, score: 0, sourcePages: new Set(), evidence: [] };
      row.score = Math.max(row.score, score);
      row.sourcePages.add(exampleUrl);
      if (row.evidence.length < 3) row.evidence.push({ competitorUrl: exampleUrl, link: link.url, label: link.label });
      byUrl.set(key, row);
    }

    const redirectLinks = links.filter(link => {
      try {
        const u = new URL(link.url);
        return isCompetitorHost(u.hostname) && /\bofficial\b|\bwebsite\b|\bhomepage\b|\bvisit\b|\bopen\b/i.test(link.label);
      } catch { return false; }
    }).slice(0, 5);

    for (const link of redirectLinks) {
      const redirected = await fetchHtml(link.url);
      if (redirected.status !== 'ok') continue;
      let target;
      try { target = new URL(redirected.finalUrl); } catch { continue; }
      if (isCompetitorHost(target.hostname) || isBlockedHost(target.hostname)) continue;
      const score = sourceScore(target.toString(), link.label, gap.slug) + 2;
      if (score < 4) continue;
      const key = target.origin;
      const row = byUrl.get(key) || { url: target.toString(), score: 0, sourcePages: new Set(), evidence: [] };
      row.score = Math.max(row.score, score);
      row.sourcePages.add(exampleUrl);
      if (row.evidence.length < 3) row.evidence.push({ competitorUrl: exampleUrl, link: link.url, resolved: target.toString(), label: link.label });
      byUrl.set(key, row);
    }
  }

  const ranked = [...byUrl.values()].map(row => ({
    url: row.url,
    score: row.score,
    votes: row.sourcePages.size,
    evidence: row.evidence
  })).sort((a,b) => (b.votes * 10 + b.score) - (a.votes * 10 + a.score));

  const winner = ranked[0];
  if (!winner || (winner.score < 6 && winner.votes < 2)) return null;
  return winner;
}

const CAPABILITIES = [
  ['AI assistant',['ai assistant','artificial intelligence assistant']],
  ['chatbot',['chatbot','chat bot']],
  ['conversational AI',['conversational ai','ai chat','character chat']],
  ['research',['research']],
  ['citations',['citations','sources']],
  ['web search',['web search','search the web','answer engine']],
  ['analysis',['analysis','analyze','analytics']],
  ['writing',['writing','write content','content writing']],
  ['coding',['coding','code assistant','code generation']],
  ['multimodal',['multimodal','image and text','vision']],
  ['image generation',['image generation','generate images','ai images']],
  ['video generation',['video generation','generate videos','ai video']],
  ['video editing',['video editing','edit video']],
  ['transcription',['transcription','transcribe']],
  ['meeting notes',['meeting notes','meeting assistant','meeting transcription']],
  ['summarization',['summarization','summarize','summary']],
  ['voice',['voice','speech']],
  ['collaboration',['collaboration','collaborate','team workspace']],
  ['API',[' api ','api access','developer api']],
  ['automation',['automation','automate','workflow']],
  ['integrations',['integrations','integrate with']],
  ['email marketing',['email marketing']],
  ['CRM',[' crm ','customer relationship management']],
  ['forms',['form builder','forms']],
  ['design',['design','graphic design','prototype']],
  ['templates',['templates']],
  ['deployment',['deployment','deploy']],
  ['project management',['project management']],
  ['task management',['task management']],
  ['social media',['social media']],
  ['ecommerce',['ecommerce','e-commerce','online store']]
];

const CATEGORY_RULES = {
  'ai-research':['answer engine','citations','research assistant','web research','source synthesis'],
  'ai-assistant':['ai assistant','chatbot','conversational ai','ai chat','multimodal'],
  developer:['developer','api','coding','code','deployment','sdk'],
  content:['video generation','ai video','video editing','transcription','meeting notes','content creation'],
  design:['design','graphic design','image generation','prototype'],
  analytics:['analytics','funnels','retention','session replay'],
  crm:['crm','customer relationship management','sales pipeline'],
  marketing:['email marketing','marketing automation','campaign'],
  automation:['workflow automation','automation platform','integrations'],
  forms:['form builder','online forms','survey'],
  sales:['sales intelligence','prospecting','outbound','cold email'],
  support:['helpdesk','customer support','ticketing'],
  social:['social media','social scheduling','social listening'],
  website:['website builder','cms','landing page'],
  ecommerce:['ecommerce','e-commerce','online store','checkout'],
  business:['project management','task management','team collaboration','productivity']
};

function detectedCapabilities(text) {
  const corpus = ` ${String(text || '').toLowerCase().replace(/\s+/g,' ')} `;
  return CAPABILITIES.filter(([,terms]) => terms.some(term => corpus.includes(term))).map(([label]) => label).slice(0, 10);
}

function inferCategory(text) {
  const corpus = String(text || '').toLowerCase();
  const scored = Object.entries(CATEGORY_RULES).map(([category,terms]) => ({
    category,
    score: terms.filter(term => corpus.includes(term)).length
  })).sort((a,b) => b.score - a.score);
  return scored[0]?.score ? scored[0] : { category: 'software', score: 0 };
}

function identityVerified(gap, page) {
  let parsed;
  try { parsed = new URL(page.finalUrl); } catch { return false; }
  if (isCompetitorHost(parsed.hostname) || isBlockedHost(parsed.hostname)) return false;
  const key = entityKey(gap.slug);
  const tokens = key.split('-').filter(x => x.length >= 3 && !GENERIC_ENTITY_SUFFIXES.has(x));
  const corpus = `${parsed.hostname} ${page.title || ''} ${page.description || ''}`.toLowerCase().replace(/[^a-z0-9]+/g,' ');
  const host = parsed.hostname.toLowerCase().replace(/[^a-z0-9]/g,'');
  const compactKey = key.replace(/-/g,'');
  if (compactKey.length >= 4 && host.includes(compactKey)) return true;
  return tokens.filter(token => corpus.includes(token)).length >= Math.min(2, Math.max(1, tokens.length));
}

function parseOfficialPage(result) {
  const html = result.html || '';
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g,' ').trim();
  const description = meta(html,'description') || meta(html,'og:description');
  const text = stripHtml(html).slice(0, 50000);
  return { ...result, title, description, text };
}

function pageSignal(slug) {
  const pages = Array.isArray(gsc.pages) ? gsc.pages : [];
  const match = pages.find(item => {
    const value = String(item?.page || item?.pathname || '');
    return value === `/tools/${slug}` || value.endsWith(`/tools/${slug}`) || value.endsWith(`/tools/${slug}.html`);
  });
  if (!match) return { clicks:0, impressions:0, ctr:0, position:0, status:'not-observed' };
  const clicks = Number(match.clicks || 0), impressions = Number(match.impressions || 0), ctr = Number(match.ctr || 0), position = Number(match.position || 0);
  return { clicks, impressions, ctr, position, status: clicks > 0 ? 'traffic-observed' : impressions > 0 ? 'search-visible' : 'not-observed' };
}

const profilesByKey = new Map(previousProfiles.map(profile => [compact(profile.slug || profile.name), profile]).filter(([key]) => key));
const state = { ...(previousState.candidates || {}) };
const held = [];
const resolved = [];
const admitted = [];
const contentResearch = [];
let newProfiles = 0;

for (const gap of gaps.gaps || []) {
  const key = compact(gap.slug);
  const prior = state[gap.slug] || {};
  state[gap.slug] = {
    ...prior,
    candidateType: gap.candidateType || 'software-entity',
    firstSeenAt: prior.firstSeenAt || now,
    lastSeenAt: now,
    mentions: Number(gap.mentions || 0),
    sources: gap.sources || []
  };

  if (Number(gap.mentions || 0) < minSignals) {
    held.push({ slug:gap.slug, reason:'insufficient-independent-market-signals', mentions:gap.mentions });
    continue;
  }

  if ((gap.candidateType || 'software-entity') === 'content-intent') {
    contentResearch.push({
      slug: gap.slug,
      mentions: gap.mentions,
      sources: gap.sources,
      action: 'validate-content-intent-against-catalog',
      ownerActionRequired: false
    });
    state[gap.slug].status = 'content-research';
    continue;
  }

  if (toolAlreadyCovered(gap.slug)) {
    resolved.push({ slug:gap.slug, reason:'covered-by-catalog-entity' });
    state[gap.slug].status = 'resolved-covered';
    profilesByKey.delete(key);
    continue;
  }

  const existingProfile = profilesByKey.get(key);
  if (existingProfile) {
    const source = await fetchHtml(existingProfile.sourceUrl);
    if (source.status === 'ok') {
      const page = parseOfficialPage(source);
      const capabilities = detectedCapabilities(`${page.description} ${page.text}`);
      profilesByKey.set(key, {
        ...existingProfile,
        description: page.description && page.description.length >= 60 ? page.description : existingProfile.description,
        features: capabilities.length >= minimumCapabilities ? capabilities : existingProfile.features,
        lastVerified: now.slice(0,10),
        marketSignals: { count:gap.mentions, sources:gap.sources, exampleUrls:gap.exampleUrls }
      });
      state[gap.slug].status = pageSignal(existingProfile.slug).status;
      continue;
    }
    held.push({ slug:gap.slug, reason:'previous-official-source-unreachable', sourceUrl:existingProfile.sourceUrl });
    state[gap.slug].status = 'verification-warning';
    continue;
  }

  if (newProfiles >= maxNewProfiles) {
    held.push({ slug:gap.slug, reason:'cycle-admission-cap', retry:'next-cycle' });
    state[gap.slug].status = 'queued';
    continue;
  }

  const discovered = await discoverOfficialSource(gap);
  if (!discovered) {
    held.push({ slug:gap.slug, reason:'official-source-not-resolved', retry:'next-cycle' });
    state[gap.slug].status = 'awaiting-official-source';
    continue;
  }

  const fetched = await fetchHtml(discovered.url);
  if (fetched.status !== 'ok') {
    held.push({ slug:gap.slug, reason:'official-source-unreachable', sourceUrl:discovered.url, retry:'next-cycle' });
    state[gap.slug].status = 'awaiting-official-source';
    continue;
  }
  const official = parseOfficialPage(fetched);
  if (!identityVerified(gap, official)) {
    held.push({ slug:gap.slug, reason:'official-source-identity-gate-failed', sourceUrl:official.finalUrl });
    state[gap.slug].status = 'identity-gate-failed';
    continue;
  }

  const capabilities = detectedCapabilities(`${official.description} ${official.text}`);
  if (!official.description || official.description.length < 60 || capabilities.length < minimumCapabilities) {
    held.push({
      slug:gap.slug,
      reason:'first-party-evidence-too-thin',
      sourceUrl:official.finalUrl,
      descriptionLength:(official.description || '').length,
      verifiedCapabilities:capabilities.length
    });
    state[gap.slug].status = 'evidence-gate-failed';
    continue;
  }

  const inferred = inferCategory(`${official.description} ${official.text}`);
  const profile = {
    slug: gap.slug,
    name: humanName(gap.slug),
    category: inferred.category,
    description: official.description,
    sourceUrl: official.finalUrl,
    features: capabilities,
    firstVerified: now.slice(0,10),
    lastVerified: now.slice(0,10),
    marketSignals: { count:gap.mentions, sources:gap.sources, exampleUrls:gap.exampleUrls },
    verification: {
      mode: 'competitive-gap-first-party',
      officialSourceDiscoveryScore: discovered.score,
      officialSourceVotes: discovered.votes,
      categoryEvidenceScore: inferred.score,
      competitorContentUsedForEditorialFacts: false
    }
  };
  profilesByKey.set(key, profile);
  admitted.push({ slug:gap.slug, sourceUrl:official.finalUrl, category:inferred.category, features:capabilities });
  newProfiles += 1;
  state[gap.slug].status = 'profile-published-pending-generation';
  state[gap.slug].officialSource = official.finalUrl;
  state[gap.slug].profileCreatedAt = now;
}

const profiles = [...profilesByKey.values()].sort((a,b) => a.slug.localeCompare(b.slug));
const profilePerformance = profiles.map(profile => ({ slug:profile.slug, ...pageSignal(profile.slug) }));

for (const perf of profilePerformance) {
  const candidate = state[perf.slug];
  if (!candidate) continue;
  if (perf.clicks > 0) candidate.status = 'traffic-observed';
  else if (perf.impressions > 0) candidate.status = 'search-visible';
  candidate.gsc = perf;
  candidate.lastMeasuredAt = now;
}

await fs.mkdir('data', { recursive:true });
await fs.mkdir('reports', { recursive:true });
await fs.writeFile('data/competitive-gap-profiles.json', JSON.stringify(profiles, null, 2) + '\n');
await fs.writeFile('reports/competitive-gap-state.json', JSON.stringify({ version:1, updatedAt:now, candidates:state }, null, 2) + '\n');
await fs.writeFile('reports/competitive-gap-loop.json', JSON.stringify({
  generatedAt: now,
  objective: 'Detect competitor coverage gaps, deduplicate against ToolScout, verify first-party sources, publish evidence-backed coverage profiles, submit them through the normal sitemap surface and measure Search Console outcomes on subsequent cycles.',
  guardrails: [
    'Competitor pages are used only to discover market signals and possible official-source links.',
    'Editorial facts come from the verified first-party source, not competitor copy.',
    'Catalog rankings are not changed by competitive-gap profiles.',
    'Unverified or thin candidates are held and retried instead of being published.'
  ],
  summary: {
    scannedGaps: (gaps.gaps || []).length,
    activeProfiles: profiles.length,
    newProfiles: admitted.length,
    resolvedAsExistingCoverage: resolved.length,
    held: held.length,
    contentResearch: contentResearch.length,
    searchVisibleProfiles: profilePerformance.filter(x => x.impressions > 0).length,
    trafficObservedProfiles: profilePerformance.filter(x => x.clicks > 0).length
  },
  admitted,
  resolved,
  held,
  contentResearch,
  performance: profilePerformance
}, null, 2) + '\n');

console.log(JSON.stringify({
  gaps:(gaps.gaps || []).length,
  profiles:profiles.length,
  admitted:admitted.length,
  resolved:resolved.length,
  held:held.length,
  contentResearch:contentResearch.length,
  searchVisible:profilePerformance.filter(x => x.impressions > 0).length,
  trafficObserved:profilePerformance.filter(x => x.clicks > 0).length
}, null, 2));
