import fs from 'node:fs/promises';

const readJson = async (file, fallback) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
};

const now = new Date().toISOString();
const today = now.slice(0, 10);
const config = await readJson('data/catalog-engine.json', {});
const policy = config.coverageAdmission || {};
const profiles = await readJson('data/competitive-gap-profiles.json', []);
let tools = await readJson('data/tools.json', []);
const allowed = new Set(config.admission?.allowedCatalogCategories || []);
const scoreKeys = config.admission?.scoreKeys || [];
const maxPromotions = Number(policy.maxPromotionsPerCycle || 5);
const minSignals = Number(policy.minimumIndependentMarketSignals || 2);
const minCapabilities = Number(policy.minimumVerifiedCapabilities || 3);
const minDescription = Number(policy.minimumDescriptionLength || 60);
const timeoutMs = 12000;

const BEST_FOR = {
  crm: ['teams managing customer relationships', 'sales teams evaluating CRM workflows'],
  marketing: ['marketing teams', 'businesses evaluating campaign software'],
  seo: ['SEO teams', 'marketers evaluating search visibility tools'],
  automation: ['operations teams', 'teams automating repeatable workflows'],
  forms: ['teams collecting structured data', 'businesses evaluating form software'],
  sales: ['sales teams', 'businesses evaluating prospecting and outreach tools'],
  support: ['customer support teams', 'businesses evaluating helpdesk software'],
  social: ['social media teams', 'businesses managing social publishing workflows'],
  website: ['teams building and managing websites', 'businesses evaluating website software'],
  analytics: ['product and growth teams', 'teams evaluating analytics software'],
  'ai-research': ['research and knowledge workers', 'teams evaluating AI research software'],
  'ai-assistant': ['knowledge workers', 'teams evaluating general AI assistants'],
  'ai-writing': ['content teams', 'writers evaluating AI writing software'],
  developer: ['developers', 'engineering teams evaluating developer software'],
  ecommerce: ['online merchants', 'teams evaluating ecommerce software'],
  design: ['design teams', 'creators evaluating visual design software'],
  content: ['content teams', 'creators evaluating content production software'],
  business: ['business teams', 'teams evaluating productivity and work software']
};

const slugify = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const entityKey = value => slugify(value).replace(/-(?:ai|app|apps|software|tool|tools|platform|platforms)$/,'').replace(/-/g,'');

function existingKeys() {
  const out = new Set();
  for (const tool of tools) {
    for (const value of [tool?.slug, tool?.name]) {
      const key = entityKey(value);
      if (key) out.add(key);
    }
    try {
      const host = new URL(tool.sourceUrl).hostname.toLowerCase().replace(/^www\./,'').split('.')[0];
      if (host) out.add(entityKey(host));
    } catch {}
  }
  return out;
}

async function verifySource(url) {
  if (!url) return { ok:false, reason:'missing_official_source' };
  let parsed;
  try { parsed = new URL(url); } catch { return { ok:false, reason:'invalid_official_source' }; }
  if (parsed.protocol !== 'https:') return { ok:false, reason:'official_source_not_https' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(parsed.toString(), {
      redirect:'follow',
      signal:controller.signal,
      headers:{'user-agent':'ToolScout Catalog Promotion/1.0 (+https://trytoolscout.org)'}
    });
    if (!res.ok) return { ok:false, reason:`official_source_http_${res.status}`, httpStatus:res.status };
    return { ok:true, finalUrl:res.url || parsed.toString(), httpStatus:res.status };
  } catch (error) {
    return { ok:false, reason:error?.name === 'AbortError' ? 'official_source_timeout' : 'official_source_network_error' };
  } finally {
    clearTimeout(timer);
  }
}

function neutralScores(profile) {
  const supplied = profile?.scores && typeof profile.scores === 'object' ? profile.scores : {};
  return Object.fromEntries(scoreKeys.map(key => [key, Number.isFinite(supplied[key]) ? Math.max(0, Math.min(10, supplied[key])) : 5]));
}

function marketSignals(profile) {
  const count = Number(profile?.marketSignals?.count || profile?.competitorMentions || 0);
  const sources = profile?.marketSignals?.sources || profile?.sources || [];
  return { count, sources:[...new Set(sources)].slice(0,10) };
}

const keys = existingKeys();
const promoted = [];
const held = [];

if (policy.autoPromoteVerifiedCompetitiveGapProfiles !== false) {
  for (const profile of profiles) {
    if (promoted.length >= maxPromotions) {
      held.push({slug:profile?.slug || null, reason:'cycle_promotion_cap', retry:'next_cycle'});
      continue;
    }

    const slug = slugify(profile?.slug);
    const name = String(profile?.name || '').trim();
    const key = entityKey(slug || name);
    const signals = marketSignals(profile);
    const category = String(profile?.category || '').trim();
    const features = [...new Set((profile?.features || []).map(x => String(x).trim()).filter(Boolean))];
    const description = String(profile?.description || '').trim();

    if (!slug || !name || !key) { held.push({slug:slug || null, reason:'missing_identity'}); continue; }
    if (keys.has(key)) { held.push({slug, reason:'entity_already_in_catalog'}); continue; }
    if (signals.count < minSignals) { held.push({slug, reason:'insufficient_market_signals',signals:signals.count,minimum:minSignals}); continue; }
    if (policy.requireKnownCategory !== false && !allowed.has(category)) { held.push({slug, reason:'unknown_or_unsupported_category',category}); continue; }
    if (features.length < minCapabilities) { held.push({slug, reason:'insufficient_verified_capabilities',capabilities:features.length,minimum:minCapabilities}); continue; }
    if (description.length < minDescription) { held.push({slug, reason:'description_too_thin',length:description.length,minimum:minDescription}); continue; }
    if (profile?.verification?.mode !== 'competitive-gap-first-party') { held.push({slug, reason:'missing_first_party_verification'}); continue; }

    const source = await verifySource(profile.sourceUrl);
    if (policy.requireReachableOfficialSource !== false && !source.ok) {
      held.push({slug, reason:source.reason, httpStatus:source.httpStatus || null});
      continue;
    }

    const bestFor = Array.isArray(profile.bestFor) && profile.bestFor.length >= 2
      ? profile.bestFor.slice(0,6)
      : (BEST_FOR[category] || ['software buyers evaluating this category', 'teams comparing relevant software options']);

    const freePlanKnown = typeof profile.freePlan === 'boolean';
    const tool = {
      affiliateUrl:'',
      slug,
      name,
      category,
      description,
      pricing:String(profile.pricing || 'See vendor for current pricing'),
      freePlan:freePlanKnown ? profile.freePlan : false,
      freePlanKnown,
      features:features.slice(0,10),
      bestFor,
      affiliateProgram:'Not evaluated for catalog admission',
      commission:'Commercial terms are separate from editorial selection',
      sourceUrl:source.finalUrl || profile.sourceUrl,
      lastVerified:today,
      scores:neutralScores(profile),
      catalogTier:'coverage',
      rankingEligible:policy.rankingEligibleOnAdmission === true,
      comparisonEligible:policy.comparisonEligibleOnAdmission === true,
      provenance:{
        mode:'verified_competitive_gap_coverage',
        admittedAt:now,
        source:'competitive-gap-loop',
        marketSignals:signals,
        rankingNote:'Catalog inclusion does not imply recommendation. Tool-specific editorial evidence is required before ranking eligibility.'
      }
    };

    tools.push(tool);
    keys.add(key);
    promoted.push({slug,name,category,signals:signals.count,capabilities:features.length,catalogTier:'coverage',rankingEligible:tool.rankingEligible,comparisonEligible:tool.comparisonEligible});
  }
}

if (promoted.length) await fs.writeFile('data/tools.json', JSON.stringify(tools,null,2)+'\n');
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/catalog-auto-promotion.json', JSON.stringify({
  generatedAt:now,
  policy:'Broaden the indexable catalog using verified first-party product facts and repeated market signals, while keeping ranking and comparison eligibility separate until stronger tool-specific editorial evidence exists.',
  summary:{catalogTools:tools.length,promoted:promoted.length,held:held.length,maxPromotionsPerCycle:maxPromotions},
  promoted,
  held
},null,2)+'\n');

console.log(JSON.stringify({catalogTools:tools.length,promoted:promoted.length,held:held.length,slugs:promoted.map(x=>x.slug)},null,2));
