import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const readJson = async (path, fallback = null) => {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); } catch { return fallback; }
};
const exists = async path => { try { await fs.access(path); return true; } catch { return false; } };
const today = new Date().toISOString().slice(0,10);
const now = new Date().toISOString();
const config = await readJson('data/catalog-engine.json');
if (!config) throw new Error('Missing data/catalog-engine.json');
let tools = await readJson('data/tools.json', []);
const intents = await readJson('data/intents.json', []);
const affiliatePipeline = await readJson('data/affiliate-pipeline.json', { verified_programs: [] });
const previous = await readJson('data/catalog-freshness-state.json', { tools: {} });
const gapReport = await readJson('reports/competitive-gap-signals.json', { gaps: [] });

const knownCategories = new Set(intents.map(x => x.category).filter(Boolean));
const scoreKeys = config.admission.scoreKeys;
const required = config.admission.requiredFields;
const timeoutMs = 15000;

const categoryProfiles = {
  crm: { features:['crm','pipeline','contacts','automation','reporting','integrations'], bestFor:['sales teams','small businesses','growing companies'], scores:{sales:9,automation:8,integrations:8,ease:7,price:6,ai:6,marketing:6,seo:2,research:4,content:3,agency:8}},
  marketing: { features:['email','campaigns','automation','analytics','integrations','content'], bestFor:['marketing teams','small businesses','agencies'], scores:{marketing:9,automation:8,integrations:8,ease:7,price:6,ai:6,sales:6,seo:5,research:5,content:8,agency:8}},
  seo: { features:['keyword research','rank tracking','site audit','backlinks','competitor research','reporting'], bestFor:['SEO professionals','marketers','agencies'], scores:{seo:9,research:9,content:7,automation:6,integrations:6,ease:6,price:6,ai:5,marketing:7,sales:2,agency:8}},
  automation: { features:['automation','workflows','integrations','webhooks','data'], bestFor:['operations teams','agencies','power users'], scores:{automation:10,integrations:9,ease:7,price:7,ai:6,sales:5,marketing:6,seo:2,research:3,content:3,agency:9}},
  forms: { features:['forms','surveys','payments','integrations','automation'], bestFor:['small businesses','operations teams','lead generation'], scores:{ease:9,integrations:8,automation:7,sales:6,price:8,ai:5,marketing:6,seo:2,research:3,content:4,agency:7}},
  sales: { features:['prospecting','contacts','email outreach','sequences','analytics','integrations'], bestFor:['sales teams','founders','agencies'], scores:{sales:10,automation:8,integrations:8,research:8,ease:7,price:6,ai:6,marketing:5,seo:2,content:3,agency:8}},
  support: { features:['ticketing','helpdesk','knowledge base','automation','analytics','integrations'], bestFor:['support teams','customer success teams','growing businesses'], scores:{automation:8,integrations:8,ease:7,ai:6,sales:4,marketing:4,price:6,seo:2,research:4,content:4,agency:7}},
  social: { features:['scheduling','publishing','analytics','engagement','content','social listening'], bestFor:['social media teams','creators','agencies'], scores:{marketing:9,automation:8,content:8,ease:8,integrations:7,ai:6,price:6,sales:4,seo:2,research:5,agency:9}},
  website: { features:['website builder','cms','hosting','seo','analytics','publishing'], bestFor:['small businesses','marketing teams','agencies'], scores:{ease:8,marketing:8,seo:7,content:7,integrations:7,automation:6,price:7,ai:6,sales:4,research:3,agency:8}},
  analytics: { features:['analytics','funnels','retention','dashboards','events','reporting'], bestFor:['product teams','growth teams','analysts'], scores:{research:9,integrations:8,automation:7,ease:6,price:7,ai:5,marketing:6,sales:3,seo:3,content:3,agency:7}},
  'ai-research': { features:['AI search','research','citations','source synthesis','analysis','reports'], bestFor:['researchers','knowledge workers','analysts'], scores:{ai:10,research:10,ease:8,content:7,automation:6,integrations:6,price:7,marketing:5,sales:3,seo:5,agency:6}},
  'ai-assistant': { features:['AI assistant','writing','analysis','research','coding','multimodal'], bestFor:['knowledge workers','teams','developers'], scores:{ai:10,research:8,content:8,ease:9,automation:7,integrations:7,price:7,marketing:7,sales:5,seo:4,agency:7}},
  developer: { features:['development','code','deployment','automation','integrations','collaboration'], bestFor:['developers','engineering teams','startups'], scores:{automation:9,integrations:9,ai:7,research:7,ease:6,price:7,sales:2,marketing:2,seo:3,content:3,agency:7}},
  ecommerce: { features:['online store','checkout','payments','orders','analytics','integrations'], bestFor:['ecommerce businesses','retailers','growing merchants'], scores:{sales:10,integrations:9,marketing:8,automation:8,ease:7,price:6,ai:6,seo:6,research:3,content:5,agency:8}},
  design: { features:['design','templates','collaboration','assets','AI','export'], bestFor:['designers','marketing teams','creators'], scores:{content:9,ease:8,ai:7,integrations:6,agency:8,marketing:7,price:7,automation:5,sales:3,seo:2,research:4}},
  content: { features:['video','recording','editing','transcription','AI','publishing'], bestFor:['content teams','creators','marketing teams'], scores:{content:10,ai:7,ease:8,automation:6,marketing:7,integrations:6,price:7,sales:4,seo:3,research:4,agency:7}},
  business: { features:['projects','tasks','collaboration','documents','automation','integrations'], bestFor:['teams','small businesses','agencies'], scores:{ease:8,automation:7,integrations:8,agency:8,price:7,ai:6,sales:5,marketing:5,seo:2,research:5,content:5}}
};

const normalizeScores = partial => Object.fromEntries(scoreKeys.map(k => [k, Number.isFinite(partial?.[k]) ? Math.max(0,Math.min(10,partial[k])) : 5]));
const strip = html => String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
const meta = (html, name) => {
  const re1 = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i');
  return (html.match(re1)?.[1] || html.match(re2)?.[1] || '').trim();
};

async function fetchPage(url) {
  if (!url) return { status:'missing', httpStatus:null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect:'follow', signal:controller.signal, headers:{'user-agent':'ToolScout Catalog Engine/2.0 (+https://trytoolscout.org)'} });
    const code = res.status;
    if (code === 404 || code === 410) return { status:'broken', httpStatus:code, finalUrl:res.url || url };
    if (!res.ok) return { status: code === 403 || code === 429 ? 'blocked_or_limited' : 'warning', httpStatus:code, finalUrl:res.url || url };
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g,' ').trim();
    const description = meta(html,'description') || meta(html,'og:description');
    const text = strip(html).slice(0,30000);
    const fingerprint = crypto.createHash('sha256').update(`${title}\n${description}\n${text.slice(0,12000)}`).digest('hex').slice(0,24);
    return { status:'ok', httpStatus:code, finalUrl:res.url || url, title, description, text, fingerprint };
  } catch (e) {
    return { status:'network_warning', httpStatus:null, error:String(e?.name === 'AbortError' ? 'timeout' : e?.message || e) };
  } finally { clearTimeout(timer); }
}

function validateTool(tool) {
  const errors = [];
  for (const k of required) if (tool[k] === undefined || tool[k] === null || tool[k] === '') errors.push(`missing:${k}`);
  if (!knownCategories.has(tool.category)) errors.push('unknown_category');
  if (!Array.isArray(tool.features) || tool.features.length < config.admission.minimumFeatures) errors.push('features_too_thin');
  if (!Array.isArray(tool.bestFor) || tool.bestFor.length < config.admission.minimumBestFor) errors.push('best_for_too_thin');
  if (String(tool.description||'').length < config.admission.minimumDescriptionLength) errors.push('description_too_short');
  for (const k of scoreKeys) if (!Number.isFinite(tool.scores?.[k]) || tool.scores[k] < 0 || tool.scores[k] > 10) errors.push(`invalid_score:${k}`);
  return errors;
}

const categoryCounts = () => tools.reduce((a,t)=>(a[t.category]=(a[t.category]||0)+1,a),{});
const intentDemand = intents.reduce((a,i)=>(a[i.category]=(a[i.category]||0)+1,a),{});

function independentSignals(slug) {
  const token = String(slug).toLowerCase();
  const matches = (gapReport.gaps || []).filter(g => String(g.slug||'').includes(token) || (g.exampleUrls||[]).some(u => String(u).toLowerCase().includes(token)));
  const sources = new Set(matches.flatMap(x => x.sources || []));
  return { count:sources.size, sources:[...sources], examples:matches.flatMap(x=>x.exampleUrls||[]).slice(0,3) };
}

function inferCategory(text) {
  const lower = String(text).toLowerCase();
  const keywords = {
    crm:['crm','sales pipeline','deal management'], marketing:['email marketing','marketing automation','campaign'], seo:['seo','keyword research','rank tracking'], automation:['workflow automation','automation platform','integrations'], forms:['form builder','online forms','survey'], sales:['sales intelligence','prospecting','cold email','outbound'], support:['helpdesk','customer support','ticketing'], social:['social media','social scheduling','social listening'], website:['website builder','cms','landing page'], analytics:['product analytics','web analytics','session replay','funnels'], 'ai-research':['ai research','answer engine','citations','source synthesis'], 'ai-assistant':['ai assistant','chatbot','general-purpose ai'], developer:['developer','code editor','devops','deployment'], ecommerce:['ecommerce','online store','checkout'], design:['design platform','graphic design','prototype'], content:['video editor','screen recording','content creation'], business:['project management','team collaboration','productivity']
  };
  const scored = Object.entries(keywords).map(([cat,ks]) => [cat,ks.filter(k=>lower.includes(k)).length]).sort((a,b)=>b[1]-a[1]);
  return scored[0]?.[1] > 0 ? { category:scored[0][0], confidence:scored[0][1] } : null;
}

function generatedTool(program, page) {
  const corpus = `${page.title||''} ${page.description||''} ${page.text||''}`;
  const inferred = inferCategory(corpus);
  if (!inferred || inferred.confidence < 2) return null;
  const profile = categoryProfiles[inferred.category];
  if (!profile) return null;
  const foundFeatures = profile.features.filter(f => corpus.toLowerCase().includes(f.toLowerCase())).slice(0,8);
  if (foundFeatures.length < config.admission.minimumFeatures) return null;
  const name = program.provider || program.slug;
  const description = page.description && page.description.length >= config.admission.minimumDescriptionLength ? page.description : `${name} is a ${inferred.category.replace(/-/g,' ')} software product. ToolScout verified the official product source and catalogued its core capabilities from first-party product information.`;
  return {
    slug: program.slug,
    name,
    category: inferred.category,
    description,
    pricing: /free plan|free tier|start for free|free forever/i.test(corpus) ? 'Free access may be available; verify current pricing on the official site' : 'Pricing varies; verify current pricing on the official site',
    freePlan: /free plan|free tier|free forever/i.test(corpus),
    features: foundFeatures,
    bestFor: profile.bestFor,
    affiliateProgram: program.status === 'active' ? `${name} affiliate/partner program` : 'Pending verification',
    commission: 'Commercial terms are tracked separately and do not affect editorial selection',
    sourceUrl: program.source,
    lastVerified: today,
    scores: normalizeScores(profile.scores),
    provenance: { mode:'auto_generated_official_source', admittedAt:now, marketSignals:independentSignals(program.slug) }
  };
}

const trusted = [];
if (config.admission.allowTrustedEnrichmentFiles) {
  for (const path of config.trustedCandidateFiles || []) if (await exists(path)) trusted.push(...await readJson(path, []));
}
const trustedMap = new Map(trusted.map(t => [t.slug,t]));
const state = { version:1, generatedAt:now, tools:{} };
const quarantined = [];
const kept = [];
const changes = [];

for (const tool of tools) {
  const page = await fetchPage(tool.sourceUrl);
  const prior = previous.tools?.[tool.slug] || {};
  const brokenConsecutive = page.status === 'broken' ? Number(prior.brokenConsecutive||0)+1 : 0;
  const contentChanged = page.status === 'ok' && prior.fingerprint && page.fingerprint !== prior.fingerprint;
  state.tools[tool.slug] = {
    sourceCheckedAt: now,
    sourceStatus: page.status,
    httpStatus: page.httpStatus ?? null,
    finalUrl: page.finalUrl || null,
    fingerprint: page.fingerprint || prior.fingerprint || null,
    contentChanged: Boolean(contentChanged),
    brokenConsecutive,
    factualReviewAgeDays: tool.lastVerified ? Math.floor((Date.now()-new Date(`${tool.lastVerified}T00:00:00Z`))/86400000) : null
  };
  if (brokenConsecutive >= config.cadence.suppressAfterConfirmedBrokenRuns) {
    quarantined.push({ tool, reason:'confirmed_official_source_broken', quarantinedAt:now, evidence:state.tools[tool.slug] });
    changes.push({type:'quarantine',slug:tool.slug,reason:'confirmed_official_source_broken'});
    continue;
  }
  kept.push(tool);
}
tools = kept;

const existing = new Set(tools.map(t=>t.slug));
for (const [slug,candidate] of trustedMap) {
  if (existing.has(slug) || !config.admission.autoAdmitTrustedCandidates) continue;
  const errors = validateTool(candidate);
  if (errors.length) continue;
  const page = await fetchPage(candidate.sourceUrl);
  if (config.admission.requireReachableOfficialSource && page.status !== 'ok') continue;
  const admitted = { affiliateUrl:'', ...candidate, provenance:{mode:'trusted_enrichment',admittedAt:now} };
  tools.push(admitted); existing.add(slug);
  state.tools[slug] = { sourceCheckedAt:now, sourceStatus:page.status, httpStatus:page.httpStatus, finalUrl:page.finalUrl, fingerprint:page.fingerprint||null, contentChanged:false, brokenConsecutive:0, factualReviewAgeDays:0 };
  changes.push({type:'admit_trusted',slug});
}

const discovered = [];
for (const program of affiliatePipeline.verified_programs || []) {
  if (existing.has(program.slug) || !program.source) continue;
  const signals = independentSignals(program.slug);
  discovered.push({slug:program.slug,provider:program.provider,officialSource:program.source,independentMarketSignals:signals});
  if (!config.admission.autoAdmitGeneratedCandidates || signals.count < config.discovery.minimumIndependentMarketSignals) continue;
  const page = await fetchPage(program.source);
  if (page.status !== 'ok') continue;
  const candidate = generatedTool(program,page);
  if (!candidate) continue;
  const errors = validateTool(candidate);
  if (errors.length) continue;
  tools.push(candidate); existing.add(program.slug);
  state.tools[program.slug] = { sourceCheckedAt:now, sourceStatus:'ok', httpStatus:page.httpStatus, finalUrl:page.finalUrl, fingerprint:page.fingerprint||null, contentChanged:false, brokenConsecutive:0, factualReviewAgeDays:0 };
  changes.push({type:'admit_generated',slug:program.slug,marketSignals:signals.count});
}

const duplicates = tools.map(t=>t.slug).filter((s,i,a)=>a.indexOf(s)!==i);
if (duplicates.length) throw new Error(`Duplicate slugs: ${[...new Set(duplicates)].join(', ')}`);
const invalid = tools.map(t=>({slug:t.slug,errors:validateTool(t)})).filter(x=>x.errors.length);
if (invalid.length) throw new Error(`Catalog validation failed: ${JSON.stringify(invalid.slice(0,10))}`);

const counts = categoryCounts();
const coverage = [...knownCategories].sort().map(category => ({
  category,
  tools: counts[category] || 0,
  intentSurfaces: intentDemand[category] || 0,
  target: Math.max(config.coverage.minimumToolsPerIntentCategory, Math.min(10,(intentDemand[category]||0)+3)),
  gap: Math.max(0, Math.max(config.coverage.minimumToolsPerIntentCategory, Math.min(10,(intentDemand[category]||0)+3))-(counts[category]||0))
}));

await fs.mkdir('reports',{recursive:true});
await fs.writeFile('data/tools.json',JSON.stringify(tools,null,2)+'\n');
await fs.writeFile('data/catalog-freshness-state.json',JSON.stringify(state,null,2)+'\n');
await fs.writeFile('data/catalog-quarantine.json',JSON.stringify(quarantined,null,2)+'\n');
await fs.writeFile('reports/catalog-freshness-coverage.json',JSON.stringify({
  generatedAt:now,
  methodology:'Autonomous catalog maintenance using official-source verification, independent market-demand signals, deterministic quality gates and affiliate-neutral selection. Affiliate status and commission never increase editorial admission or ranking.',
  summary:{tools:tools.length,changes:changes.length,quarantined:quarantined.length,discovered:discovered.length,coverageGaps:coverage.filter(x=>x.gap>0).length,sourceHealthy:Object.values(state.tools).filter(x=>x.sourceStatus==='ok').length,sourceWarnings:Object.values(state.tools).filter(x=>x.sourceStatus!=='ok').length},
  changes,
  coverage,
  discovered,
  contentChanges:Object.entries(state.tools).filter(([,v])=>v.contentChanged).map(([slug,v])=>({slug,...v})),
  quarantined:quarantined.map(x=>({slug:x.tool.slug,reason:x.reason,evidence:x.evidence}))
},null,2)+'\n');

console.log(JSON.stringify({tools:tools.length,changes,coverageGaps:coverage.filter(x=>x.gap>0),quarantined:quarantined.map(x=>x.tool.slug)},null,2));
