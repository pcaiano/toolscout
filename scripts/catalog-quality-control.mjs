import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const readJson = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
};
const now = new Date();
const nowIso = now.toISOString();
const today = nowIso.slice(0, 10);
const config = await readJson('data/catalog-engine.json', {});
const policy = config.qualityControl || {};
let tools = await readJson('data/tools.json', []);
const previous = await readJson('data/catalog-quality-state.json', {version:1,tools:{}});
const curatedAssets = await readJson('data/tool-assets-curated.json', {assets:{}});
const timeoutMs = 15000;

const strip = html => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, ' ')
  .replace(/&#\d+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
const normalize = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.filter(Boolean))];

function resolveUrl(raw, base) {
  try { return new URL(raw, base).toString(); } catch { return null; }
}

async function fetchPage(url) {
  if (!url) return {ok:false,status:'missing',url:null};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect:'follow',
      signal:controller.signal,
      headers:{'user-agent':'ToolScout Catalog Quality/1.0 (+https://trytoolscout.org)'}
    });
    if (!res.ok) return {ok:false,status:`http_${res.status}`,httpStatus:res.status,url:res.url || url};
    const type = String(res.headers.get('content-type') || '');
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) return {ok:false,status:'not_html',httpStatus:res.status,url:res.url || url,contentType:type};
    const html = await res.text();
    return {ok:true,status:'ok',httpStatus:res.status,url:res.url || url,html,text:strip(html).slice(0,90000)};
  } catch (error) {
    return {ok:false,status:error?.name === 'AbortError' ? 'timeout' : 'network_error',url};
  } finally { clearTimeout(timer); }
}

function sameOriginEvidenceLinks(page) {
  if (!page?.ok || !page.html || !page.url) return [];
  let origin;
  try { origin = new URL(page.url).origin; } catch { return []; }
  const scored = [];
  for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    const url = resolveUrl(match[1], page.url);
    if (!url) continue;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    if (parsed.origin !== origin) continue;
    const p = `${parsed.pathname}${parsed.search}`.toLowerCase();
    let score = 0;
    if (/pricing|plans|billing|packages/.test(p)) score += 10;
    if (/features|product|platform|solutions|capabilities/.test(p)) score += 4;
    if (!score) continue;
    scored.push({url:parsed.toString(),score});
  }
  return [...new Map(scored.sort((a,b)=>b.score-a.score).map(x=>[x.url,x])).values()]
    .slice(0, Number(policy.maxSameOriginEvidencePages || 2));
}

function iconCandidates(page) {
  if (!page?.ok || !page.html || !page.url) return [];
  const out = [];
  for (const match of page.html.matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = match[1];
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] || '';
    if (!/icon/i.test(rel)) continue;
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const url = resolveUrl(href, page.url);
    if (url) out.push({url,provenance:/apple-touch-icon/i.test(rel)?'first-party-apple-touch-icon':'first-party-icon'});
  }
  try {
    const root = new URL('/favicon.ico', page.url).toString();
    out.push({url:root,provenance:'first-party-root-favicon'});
  } catch {}
  return unique(out.map(x=>`${x.provenance}|${x.url}`)).map(x=>{
    const [provenance,...rest]=x.split('|');return {provenance,url:rest.join('|')};
  });
}

async function probeImage(candidate) {
  if (!candidate?.url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    let res = await fetch(candidate.url, {method:'HEAD',redirect:'follow',signal:controller.signal,headers:{'user-agent':'ToolScout Asset Quality/1.0 (+https://trytoolscout.org)'}});
    if ([400,403,405,429].includes(res.status)) {
      res = await fetch(candidate.url, {method:'GET',redirect:'follow',signal:controller.signal,headers:{'user-agent':'ToolScout Asset Quality/1.0 (+https://trytoolscout.org)'}});
    }
    const type = String(res.headers.get('content-type') || '');
    if (!res.ok || (!/^image\//i.test(type) && !/svg/i.test(type))) return null;
    return {url:res.url || candidate.url,provenance:candidate.provenance,contentType:type,httpStatus:res.status};
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function pricingTokens(text) {
  const amounts = [...String(text || '').matchAll(/(?:[$€£]\s?\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP))\s*(?:\/|per\s+)?(?:user\s+)?(?:month|mo|year|yr|annual|monthly|yearly)?/gi)]
    .map(m=>normalize(m[0]).replace(/\s+/g,' '));
  return unique(amounts).slice(0,30);
}
function trialDays(text) {
  const values = [...String(text || '').matchAll(/\b(\d{1,3})\s*[- ]?day\s+(?:free\s+)?trial\b/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
  return unique(values).sort((a,b)=>a-b);
}
function freePlanEvidence(text, evidenceUrls) {
  const t = normalize(text);
  const explicitNegative = /\b(?:no|without)\s+(?:a\s+)?free\s+(?:plan|tier)\b|\bfree\s+(?:plan|tier)\s+(?:is\s+)?(?:not|no longer)\s+(?:available|offered)\b/.test(t);
  const explicitPositive = /\bfree\s+forever\b|\bfree\s+(?:plan|tier)\b/.test(t) && !explicitNegative;
  const hasTrial = /\b\d{1,3}\s*[- ]?day\s+(?:free\s+)?trial\b/.test(t);
  const hasPaidAmounts = pricingTokens(t).length >= 1;
  const pricingPage = evidenceUrls.some(url=>/pricing|plans|billing|packages/i.test(url));
  const inferredNegative = pricingPage && hasTrial && hasPaidAmounts && !explicitPositive;
  if (explicitNegative) return {value:false,confidence:'explicit',reason:'official_source_explicit_no_free_plan'};
  if (explicitPositive) return {value:true,confidence:'explicit',reason:'official_source_explicit_free_plan'};
  if (inferredNegative) return {value:false,confidence:'inferred',reason:'official_pricing_page_lists_trial_and_paid_pricing_without_free_plan'};
  return {value:null,confidence:'unknown',reason:'no_decisive_first_party_free_plan_signal'};
}
function observedFeatures(tool, text) {
  const hay = normalize(text).replace(/[^a-z0-9+.#/-]+/g,' ');
  return (tool.features || []).filter(feature => {
    const needle = normalize(feature).replace(/[^a-z0-9+.#/-]+/g,' ').trim();
    return needle.length >= 3 && hay.includes(needle);
  });
}
function arraysEqual(a,b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }

const nextState = {version:1,generatedAt:nowIso,tools:{}};
const assets = {...(curatedAssets.assets || {})};
const findings = [];
const corrections = [];

for (let i=0;i<tools.length;i++) {
  const tool = tools[i];
  const prior = previous.tools?.[tool.slug] || null;
  const source = await fetchPage(tool.sourceUrl);
  if (!source.ok) {
    findings.push({slug:tool.slug,severity:'high',type:'official_source_unavailable',detail:source.status});
    nextState.tools[tool.slug] = {...prior,checkedAt:nowIso,sourceStatus:source.status,sourceUrl:tool.sourceUrl};
    continue;
  }

  const evidencePages = [source];
  const evidenceLinks = sameOriginEvidenceLinks(source);
  for (const item of evidenceLinks) {
    const page = await fetchPage(item.url);
    if (page.ok) evidencePages.push(page);
  }
  const evidenceUrls = evidencePages.map(p=>p.url).filter(Boolean);
  const combinedText = evidencePages.map(p=>p.text).join(' ');
  const freeSignal = freePlanEvidence(combinedText,evidenceUrls);
  const prices = pricingTokens(combinedText);
  const trials = trialDays(combinedText);
  const features = observedFeatures(tool,combinedText);
  const snapshot = {
    checkedAt:nowIso,
    sourceStatus:'ok',
    sourceUrl:source.url,
    evidenceUrls,
    pageFingerprint:hash(evidencePages.map(p=>`${p.url}\n${p.text}`).join('\n---\n')),
    volatile:{
      freePlan:freeSignal,
      pricingTokens:prices,
      trialDays:trials,
      observedCatalogFeatures:features
    },
    fieldVerifiedAt:{
      pricing:prices.length?nowIso:(prior?.fieldVerifiedAt?.pricing || null),
      freePlan:freeSignal.value !== null?nowIso:(prior?.fieldVerifiedAt?.freePlan || null),
      trial:trials.length?nowIso:(prior?.fieldVerifiedAt?.trial || null),
      features:features.length?nowIso:(prior?.fieldVerifiedAt?.features || null)
    }
  };

  if (freeSignal.value !== null && Boolean(tool.freePlan) !== freeSignal.value) {
    const severity = freeSignal.confidence === 'explicit' ? 'critical' : 'high';
    findings.push({slug:tool.slug,severity,type:'free_plan_contradiction',catalogValue:Boolean(tool.freePlan),observedValue:freeSignal.value,confidence:freeSignal.confidence,reason:freeSignal.reason,evidenceUrls});
    const canAutoCorrect = freeSignal.confidence === 'explicit'
      ? policy.autoCorrectExplicitFreePlanContradictions !== false
      : policy.autoCorrectInferredFreePlanContradictions === true;
    if (canAutoCorrect) {
      tools[i] = {...tool,freePlan:freeSignal.value,lastVerified:today};
      corrections.push({slug:tool.slug,field:'freePlan',from:Boolean(tool.freePlan),to:freeSignal.value,evidence:freeSignal.reason});
    }
  }

  if (prior?.volatile) {
    if (!arraysEqual(prior.volatile.pricingTokens,prices) && prices.length) {
      findings.push({slug:tool.slug,severity:'medium',type:'pricing_evidence_changed',previous:prior.volatile.pricingTokens || [],current:prices,evidenceUrls});
    }
    if (!arraysEqual(prior.volatile.trialDays,trials)) {
      findings.push({slug:tool.slug,severity:'medium',type:'trial_evidence_changed',previous:prior.volatile.trialDays || [],current:trials,evidenceUrls});
    }
    const priorFeatures = prior.volatile.observedCatalogFeatures || [];
    if (priorFeatures.length >= 2 && features.length < Math.ceil(priorFeatures.length / 2)) {
      findings.push({slug:tool.slug,severity:'medium',type:'feature_evidence_drop',previous:priorFeatures,current:features,evidenceUrls});
    }
  }

  let asset = null;
  const curatedAsset = curatedAssets.assets?.[tool.slug] || null;
  if (curatedAsset?.url) asset = await probeImage(curatedAsset);
  if (!asset && policy.validateVisualAssets !== false) {
    for (const candidate of iconCandidates(source)) {
      asset = await probeImage(candidate);
      if (asset) break;
    }
  }
  if (!asset) {
    let host='';
    try { host=new URL(source.url).hostname; } catch {}
    if (host) {
      const google = {url:`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,provenance:'google-favicon-fallback'};
      asset = await probeImage(google);
    }
  }
  if (asset) assets[tool.slug] = {...curatedAsset,...asset,checkedAt:nowIso};
  else if (policy.reportUnresolvedVisualAssetFailures !== false) findings.push({slug:tool.slug,severity:'low',type:'visual_asset_unresolved',sourceUrl:source.url});

  nextState.tools[tool.slug] = snapshot;
}

const rank = {critical:4,high:3,medium:2,low:1};
findings.sort((a,b)=>(rank[b.severity]||0)-(rank[a.severity]||0)||String(a.slug).localeCompare(String(b.slug)));
const counts = severity => findings.filter(x=>x.severity===severity).length;

await fs.writeFile('data/catalog-quality-state.json', JSON.stringify(nextState,null,2)+'\n');
await fs.writeFile('data/tool-assets.json', JSON.stringify({generatedAt:nowIso,assets},null,2)+'\n');
if (corrections.length) await fs.writeFile('data/tools.json', JSON.stringify(tools,null,2)+'\n');
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/catalog-quality-control.json', JSON.stringify({
  generatedAt:nowIso,
  methodology:'Field-level first-party quality control for volatile catalog facts plus validated visual asset resolution. Ambiguous changes are reported, not silently rewritten.',
  summary:{tools:tools.length,critical:counts('critical'),high:counts('high'),medium:counts('medium'),low:counts('low'),autoCorrections:corrections.length,assetsResolved:Object.keys(assets).length},
  corrections,
  findings
},null,2)+'\n');

console.log(JSON.stringify({tools:tools.length,findings:findings.length,corrections:corrections.length,assetsResolved:Object.keys(assets).length,critical:counts('critical'),high:counts('high')},null,2));
