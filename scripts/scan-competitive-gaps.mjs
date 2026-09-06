import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const intents = JSON.parse(fs.readFileSync('data/intents.json','utf8'));
const consolidations = JSON.parse(fs.readFileSync('data/seo-consolidations.json','utf8'));

const maxUrls = Number(config.thresholds?.maximumCompetitorUrlsPerSource || 1500);
const terms = (config.opportunityTerms || []).map(x => String(x).toLowerCase());
const current = new Set(intents.map(x => x.slug));
const redirected = new Set(Object.keys(consolidations || {}));

function xmlLocs(xml) {
  return [...String(xml).matchAll(/<loc>(.*?)<\/loc>/gsi)].map(m => m[1].trim());
}

function robotsSitemaps(text) {
  return String(text).split(/\r?\n/).map(x => x.trim()).filter(x => /^sitemap\s*:/i.test(x)).map(x => x.replace(/^sitemap\s*:\s*/i,'').trim()).filter(Boolean);
}

function normalizeCandidate(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.toLowerCase().split('/').filter(Boolean);
    const raw = parts.at(-1) || '';
    return raw.replace(/\.(html?|php)$/,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  } catch {
    return '';
  }
}

function interesting(url) {
  const v = String(url).toLowerCase();
  return terms.some(term => v.includes(term));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'ToolScoutOrganicGrowthBot/1.1 (+https://trytoolscout.org)' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverSitemaps(source) {
  const candidates = [...(source.sitemapCandidates || [])];
  try {
    const robots = await fetchText(new URL('/robots.txt', source.baseUrl).toString());
    if (robots) candidates.push(...robotsSitemaps(robots));
  } catch {}
  return [...new Set(candidates)];
}

async function expandSitemap(url, depth = 0, seen = new Set()) {
  if (depth > 2 || seen.has(url)) return [];
  seen.add(url);
  const text = await fetchText(url);
  if (!text || !/<loc>/i.test(text)) return [];
  const locs = xmlLocs(text);
  const nested = locs.filter(x => /sitemap/i.test(x)).slice(0, 20);
  if (!nested.length) return locs;
  const out = [];
  for (const child of nested) {
    out.push(...await expandSitemap(child, depth + 1, seen));
    if (out.length >= maxUrls * 3) break;
  }
  return out.length ? out : locs;
}

async function collectSource(source) {
  const candidates = await discoverSitemaps(source);
  let used = null;
  let urls = [];
  for (const candidate of candidates) {
    const expanded = await expandSitemap(candidate);
    if (expanded.length) { used = candidate; urls = expanded; break; }
  }
  if (!used) return { name: source.name, sitemap: null, status: 'unavailable', urls: [] };
  urls = [...new Set(urls.filter(interesting))].slice(0, maxUrls);
  return { name: source.name, sitemap: used, status: 'ok', urls };
}

const sources = [];
for (const source of config.competitors || []) sources.push(await collectSource(source));

const candidateMap = new Map();
for (const source of sources) {
  for (const url of source.urls) {
    const slug = normalizeCandidate(url);
    if (!slug || current.has(slug) || redirected.has(slug)) continue;
    const row = candidateMap.get(slug) || { slug, mentions: 0, sources: [], exampleUrls: [] };
    if (!row.sources.includes(source.name)) { row.sources.push(source.name); row.mentions += 1; }
    if (row.exampleUrls.length < 3) row.exampleUrls.push(url);
    candidateMap.set(slug, row);
  }
}

const minimum = Number(config.thresholds?.minimumCompetitorMentionsForGap || 2);
const gaps = [...candidateMap.values()]
  .filter(x => x.mentions >= minimum)
  .sort((a,b) => b.mentions - a.mentions || a.slug.localeCompare(b.slug))
  .slice(0, 250);

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/competitive-gap-signals.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  methodology: 'Public sitemap URL patterns only, with robots.txt sitemap discovery and bounded recursive sitemap-index expansion. Competitor content is not copied or used for editorial conclusions. Repeated URL themes are treated as market-coverage signals and must pass ToolScout demand and quality gates before any new page or catalog item is created.',
  sources: sources.map(x => ({ name: x.name, sitemap: x.sitemap, status: x.status, sampledUrls: x.urls.length })),
  count: gaps.length,
  gaps
}, null, 2) + '\n');

console.log(JSON.stringify({ sources: sources.map(x => ({name:x.name,status:x.status,urls:x.urls.length})), gaps: gaps.length, top: gaps.slice(0,20) }, null, 2));
