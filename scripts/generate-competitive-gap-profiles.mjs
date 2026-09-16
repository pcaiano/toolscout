import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://trytoolscout.org';
const profilesPath = path.join(ROOT,'data','competitive-gap-profiles.json');
const profiles = fs.existsSync(profilesPath) ? JSON.parse(fs.readFileSync(profilesPath,'utf8')) : [];
const out = path.join(ROOT,'tools');
fs.mkdirSync(out,{recursive:true});

const clean = value => String(value ?? '').replace(/[\u2014\u2013]/g,'-').replace(/\s+/g,' ').trim();
const esc = value => clean(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'TS';
const logoUrl = profile => {
  try {
    const host = new URL(profile.sourceUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return '';
  }
};

function valid(profile) {
  try {
    if (!profile?.slug || !profile?.name || !profile?.description || profile.description.length < 60) return false;
    if (!Array.isArray(profile.features) || profile.features.length < 2) return false;
    const source = new URL(profile.sourceUrl);
    return /^https?:$/.test(source.protocol) && profile?.verification?.mode === 'competitive-gap-first-party';
  } catch {
    return false;
  }
}

function render(profile) {
  const url = `${BASE}/tools/${profile.slug}`;
  const logo = logoUrl(profile);
  const category = profile.category && profile.category !== 'software' ? profile.category : 'software';
  const signals = Number(profile.marketSignals?.count || 0);
  const sourceNames = (profile.marketSignals?.sources || []).slice(0,4);
  const pageTitle = `${profile.name} Software Profile: Verified Capabilities`;
  const description = `Independent ToolScout profile for ${profile.name}, based on verified first-party product information and repeated market coverage signals.`;
  const schema = {
    '@context':'https://schema.org',
    '@type':'WebPage',
    name:clean(pageTitle),
    description:clean(description),
    url,
    isPartOf:{'@type':'WebSite',name:'ToolScout',url:BASE+'/'},
    about:{
      '@type':'SoftwareApplication',
      name:clean(profile.name),
      applicationCategory:clean(category),
      description:clean(profile.description),
      url:profile.sourceUrl,
      image:logo || undefined
    }
  };
  const marketNote = signals > 0
    ? `ToolScout opened this coverage profile after the product appeared across ${signals} independent market sources${sourceNames.length ? `: ${sourceNames.join(', ')}` : ''}. This signal triggered research, not a recommendation.`
    : 'ToolScout opened this profile from independent market coverage signals. This signal triggered research, not a recommendation.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pageTitle)} | ToolScout</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}"><meta name="robots" content="index,follow"><meta property="og:title" content="${esc(pageTitle)} | ToolScout"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${url}"><meta property="og:site_name" content="ToolScout">${logo?`<meta property="og:image" content="${esc(logo)}">`:''}<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#101828}.wrap{max-width:900px;margin:auto;padding:24px 22px 80px}a{color:#344054}.brand{font-size:22px;font-weight:850;text-decoration:none;color:#101828}.crumbs{margin-top:30px;font-size:13px;color:#667085}.hero{padding:46px 0 26px}.heroHead{display:grid;grid-template-columns:92px 1fr;gap:22px;align-items:center}.toolLogo,.logoFallback{width:88px;height:88px;border-radius:20px;background:#fff;border:1px solid #e4e7ec;box-sizing:border-box}.toolLogo{object-fit:contain;padding:14px}.logoFallback{display:grid;place-items:center;font-size:26px;font-weight:850}.logoFallback[hidden]{display:none!important}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:800;color:#667085}h1{font-size:clamp(40px,7vw,64px);line-height:1;letter-spacing:-.05em;margin:12px 0 18px}.lead{font-size:19px;line-height:1.65;color:#667085}.panel{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px;margin-top:14px}.panel p,.panel li{color:#667085;line-height:1.65}.chips{display:flex;flex-wrap:wrap;gap:7px}.chips span{font-size:12px;background:#f2f4f7;border-radius:999px;padding:7px 9px}.cta{display:inline-block;background:#101828;color:#fff;padding:12px 17px;border-radius:11px;text-decoration:none;font-weight:750;margin-top:12px}.small{font-size:12px;color:#667085;line-height:1.55;margin-top:32px}@media(max-width:700px){.heroHead{grid-template-columns:72px 1fr;gap:16px}.toolLogo,.logoFallback{width:68px;height:68px}}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><nav class="crumbs"><a href="/">Home</a> / <a href="/tools">Tools</a> / ${esc(profile.name)}</nav><main class="hero"><div class="heroHead">${logo?`<img class="toolLogo" src="${esc(logo)}" alt="${esc(profile.name)} logo" width="88" height="88" loading="eager" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="logoFallback" hidden aria-hidden="true">${esc(initials(profile.name))}</span>`:`<span class="logoFallback" aria-hidden="true">${esc(initials(profile.name))}</span>`}<div><div class="eyebrow">Verified ${esc(category)} coverage profile</div><h1>${esc(profile.name)}</h1></div></div><p class="lead">${esc(profile.description)}</p></main><section class="panel"><h2>Verified capabilities</h2><div class="chips">${profile.features.map(feature=>`<span>${esc(feature)}</span>`).join('')}</div><p>These capability labels were matched against the product's public first-party information. ToolScout does not use competitor copy as editorial evidence.</p></section><section class="panel"><h2>Why ToolScout covers this product</h2><p>${esc(marketNote)}</p><p>This is a factual coverage profile. It does not place the product into ToolScout rankings until the full catalog and editorial eligibility gates are satisfied.</p></section><section class="panel"><h2>Official product source</h2><p>Capabilities and the product description on this page are grounded in the vendor source verified on ${esc(profile.lastVerified || profile.firstVerified || 'the latest review')}.</p><a class="cta" href="${esc(profile.sourceUrl)}" rel="noopener">Visit official website →</a></section><p class="small">ToolScout separates market discovery from editorial ranking. Repeated competitor coverage can trigger research, but cannot by itself create a recommendation or affect ranking. Affiliate relationships do not influence this coverage decision.</p></div></body></html>`;
}

const holds = [];
let created = 0, refreshed = 0;
for (const profile of profiles) {
  if (!valid(profile)) {
    holds.push({slug:profile?.slug || null, reason:'Competitive gap profile failed first-party evidence gates.'});
    continue;
  }
  const file = path.join(out,`${profile.slug}.html`);
  const html = render(profile);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file,html,'utf8');
    created += 1;
  } else if (fs.readFileSync(file,'utf8') !== html) {
    fs.writeFileSync(file,html,'utf8');
    refreshed += 1;
  }
}

fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','competitive-gap-profile-publication.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),
  profiles:profiles.length,
  created,
  refreshed,
  held:holds.length,
  holds
},null,2)+'\n');
console.log(JSON.stringify({profiles:profiles.length,created,refreshed,held:holds.length}));
