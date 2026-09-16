import fs from 'node:fs';
import path from 'node:path';
import { editorialEligibility } from './seo-eligibility.mjs';
import { loadSeoIntents } from './seo-intent-loader.mjs';

const ROOT=process.cwd(),BASE='https://trytoolscout.org';
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const tools=read('data/tools.json',[]);
const intents=loadSeoIntents(ROOT).filter(intent=>intent?.slug&&fs.existsSync(path.join(ROOT,`${intent.slug}.html`)));
const pairs=read('data/comparisons.json',[]);
const assets=read('data/tool-assets.json',{assets:{}})?.assets||{};
const config=read('data/organic-growth-engine.json',{editorialGates:{}});
const MIN_RELEVANCE=Number(config?.editorialGates?.minimumLexicalRelevance||0.75);
const out=path.join(ROOT,'tools');fs.mkdirSync(out,{recursive:true});
const clean=v=>String(v??'').replace(/[\u2014\u2013]/g,'-').replace(/verify current pricing before publication/gi,'See vendor for current pricing').replace(/verify before publication/gi,'See vendor for current details').replace(/pending verification/gi,'See vendor for current details').replace(/\s+/g,' ').trim();
const esc=v=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const score=(tool,intent)=>Object.entries(intent.weights||{}).reduce((sum,[key,w])=>sum+(key==='freePlan'?(tool.freePlan?10:0):Number(tool.scores?.[key==='simplicity'?'ease':key]||0))*Number(w||0),0);
const title=i=>i.title||i.slug.replace(/-/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
const firstPartyLogo=tool=>{try{return `${new URL(tool.sourceUrl).origin}/favicon.ico`;}catch{return ''}};
const googleLogo=tool=>{try{const host=new URL(tool.sourceUrl).hostname;return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;}catch{return ''}};
const logoChain=tool=>{const curated=assets?.[tool.slug]?.url||'',first=firstPartyLogo(tool),google=googleLogo(tool);return{src:curated||first||google,first:curated?first:'',google,stage:curated?0:1};};
const logoUrl=tool=>logoChain(tool).src;
const initials=name=>String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'TS';
const validTool=tool=>{try{if(!tool?.slug||!tool?.name||!tool?.description||!Array.isArray(tool.features)||!Array.isArray(tool.bestFor)||!tool.scores||typeof tool.scores!=='object')return false;const u=new URL(tool.sourceUrl);return /^https?:$/.test(u.protocol);}catch{return false;}};
const safePricing=tool=>clean(tool.pricing||'See the vendor for current pricing and plan details.');
const canCompare=tool=>tool?.comparisonEligible!==false;
const norm=v=>clean(v).toLowerCase();
const setOf=values=>new Set((values||[]).map(norm).filter(Boolean));

function relationScore(a,b){
  let total=a.category===b.category?8:0;
  const af=setOf(a.features),bf=setOf(b.features),ab=setOf(a.bestFor),bb=setOf(b.bestFor);
  for(const value of af)if(bf.has(value))total+=3;
  for(const value of ab)if(bb.has(value))total+=1;
  return total;
}
function relatedTools(tool){
  if(!canCompare(tool))return[];
  return tools.filter(other=>other.slug!==tool.slug&&canCompare(other)&&validTool(other))
    .map(other=>({tool:other,score:relationScore(tool,other)}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||String(a.tool.name).localeCompare(String(b.tool.name)))
    .slice(0,4).map(x=>x.tool);
}
function freePlanLabel(tool){
  if(tool.freePlanKnown===false)return 'Unknown';
  return tool.freePlan?'Yes':'No';
}
function iconMarkup(tool,className=''){
  const icon=logoChain(tool);
  if(!icon.src)return `<span class="${className||'miniFallback'}">${esc(initials(tool.name))}</span>`;
  return `<img${className?` class="${className}"`:''} src="${esc(icon.src)}" data-first="${esc(icon.first)}" data-google="${esc(icon.google)}" data-stage="${icon.stage}" alt="${esc(tool.name)} logo" loading="lazy" referrerpolicy="no-referrer" onerror="nextToolIcon(this)"><span class="${className==='toolLogo'?'logoFallback':'miniFallback'}" hidden aria-hidden="true">${esc(initials(tool.name))}</span>`;
}

function render(tool){
  const url=`${BASE}/tools/${tool.slug}`,pageTitle=`${tool.name} Tool Profile: Features, Pricing and Best For`,description=`ToolScout profile for ${tool.name}, covering recorded use cases, key capabilities, pricing model and relevant software comparisons.`,brandLogo=logoUrl(tool);
  const guides=intents.map(intent=>({intent,eligible:editorialEligibility(tool,intent,MIN_RELEVANCE).eligible,score:score(tool,intent)})).filter(x=>x.eligible).sort((a,b)=>b.score-a.score).slice(0,4).map(x=>x.intent);
  const comparisons=pairs.filter(([a,b])=>a===tool.slug||b===tool.slug).map(([a,b])=>({slug:`${a}-vs-${b}`,names:[tools.find(x=>x.slug===a)?.name,tools.find(x=>x.slug===b)?.name]})).filter(x=>x.names.every(Boolean)&&fs.existsSync(path.join(ROOT,`${x.slug}.html`)));
  const related=relatedTools(tool);
  const verificationDate=tool.sourceCheckedOn||tool.lastVerified||null;
  const freeAnswer=tool.freePlanKnown===false
    ? `ToolScout has not yet verified whether ${tool.name} currently offers a free plan. Check the vendor for current offers.`
    : tool.freePlan
      ? 'The current ToolScout catalog records a free plan. Check the vendor for current limits and eligibility.'
      : 'The current ToolScout catalog does not record a free plan. Check the vendor for current offers.';
  const faq=[[`What is ${tool.name} best for?`,`${tool.name} is recorded in the ToolScout catalog for ${(tool.bestFor||[]).join(', ')||'the use cases shown on this page'}.`],[`Does ${tool.name} have a free plan?`,freeAnswer],[`How current is this ${tool.name} profile?`,verificationDate?`The source data for this profile was last checked ${verificationDate}. Vendor pricing and capabilities can change.`:'ToolScout uses the current catalog record for this profile. Check the vendor for the latest pricing and capabilities.']];
  const schemas=[{'@context':'https://schema.org','@type':'WebPage',name:clean(pageTitle),description:clean(description),url,isPartOf:{'@type':'WebSite',name:'ToolScout',url:BASE+'/'},about:{'@type':'SoftwareApplication',name:clean(tool.name),applicationCategory:clean(tool.category),description:clean(tool.description),url:tool.sourceUrl,image:brandLogo||undefined}},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:BASE+'/'},{'@type':'ListItem',position:2,name:'Tools',item:BASE+'/tools'},{'@type':'ListItem',position:3,name:clean(tool.name),item:url}]},{'@context':'https://schema.org','@type':'FAQPage',mainEntity:faq.map(([q,a])=>({'@type':'Question',name:clean(q),acceptedAnswer:{'@type':'Answer',text:clean(a)}}))}];
  const relatedHtml=related.length?`<section class="section"><div class="sectionHead"><div><div class="eyebrow">Related tools</div><h2>Compare ${esc(tool.name)} with similar options</h2></div>${canCompare(tool)?`<a class="textLink" href="/compare.html?a=${encodeURIComponent(tool.slug)}&source=tool-profile">Start a new comparison</a>`:''}</div><div class="relatedGrid">${related.map(other=>`<article class="relatedCard"><div class="relatedIdentity">${iconMarkup(other)}<div><a class="relatedName" href="/tools/${encodeURIComponent(other.slug)}">${esc(other.name)}</a><span>${esc(other.category)}</span></div></div><a class="compareBtn" href="/compare.html?a=${encodeURIComponent(tool.slug)}&b=${encodeURIComponent(other.slug)}&source=related-tool">Compare</a></article>`).join('')}</div></section>`:'';
  const comparisonCta=canCompare(tool)?`<a class="cta secondaryCta" href="/compare.html?a=${encodeURIComponent(tool.slug)}&source=tool-profile">Compare ${esc(tool.name)}</a>`:'';
  const reportHref=`mailto:pedro@trytoolscout.org?subject=${encodeURIComponent(`Outdated ToolScout information: ${tool.name}`)}&body=${encodeURIComponent(`Tool: ${url}\n\nWhat looks outdated?\n`)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pageTitle)} | ToolScout</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}"><meta name="robots" content="index,follow"><meta property="og:title" content="${esc(pageTitle)} | ToolScout"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${url}"><meta property="og:site_name" content="ToolScout">${brandLogo?`<meta property="og:image" content="${esc(brandLogo)}">`:''}<script type="application/ld+json">${JSON.stringify(schemas).replaceAll('<','\\u003c')}</script><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#101828}.wrap{max-width:940px;margin:auto;padding:24px 22px 80px}a{color:#344054}.brand{font-size:22px;font-weight:850;text-decoration:none;color:#101828}.crumbs{margin-top:30px;font-size:13px;color:#667085}.hero{padding:46px 0 26px}.heroHead{display:grid;grid-template-columns:92px 1fr;gap:22px;align-items:center}.toolLogo,.logoFallback{width:88px;height:88px;border-radius:20px;background:#fff;border:1px solid #e4e7ec;box-shadow:0 8px 24px rgba(16,24,40,.08);box-sizing:border-box}.toolLogo{object-fit:contain;padding:14px}.logoFallback{display:grid;place-items:center;font-size:26px;font-weight:850}.logoFallback[hidden],.miniFallback[hidden]{display:none!important}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:800;color:#667085}h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:12px 0 18px}.lead{font-size:19px;line-height:1.65;color:#667085}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel,details{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px}.panel p,.panel li,details p{color:#667085;line-height:1.6}.chips{display:flex;flex-wrap:wrap;gap:7px}.chips span{font-size:12px;background:#f2f4f7;border-radius:999px;padding:7px 9px}.section{margin-top:42px;padding-top:28px;border-top:1px solid #e4e7ec}.sectionHead{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:14px}.sectionHead h2{margin:5px 0 0}.links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.links a{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:15px;text-decoration:none;font-weight:700}.cta{display:inline-block;background:#101828;color:#fff;padding:12px 17px;border-radius:11px;text-decoration:none;font-weight:750;margin-top:22px}.secondaryCta{background:#eef2f6;color:#101828;margin-left:8px}.relatedGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.relatedCard{background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}.relatedIdentity{display:flex;align-items:center;gap:10px;min-width:0}.relatedIdentity img,.miniFallback{width:34px;height:34px;border-radius:9px;background:#f2f4f7;border:1px solid #e4e7ec;object-fit:contain;display:grid;place-items:center;font-size:10px;font-weight:850;flex:0 0 34px}.relatedName{font-weight:800;text-decoration:none;display:block}.relatedIdentity span:not(.miniFallback){display:block;font-size:11px;color:#667085}.compareBtn{font-size:12px;font-weight:800;text-decoration:none;background:#101828;color:#fff;padding:9px 11px;border-radius:9px;white-space:nowrap}.textLink{font-size:13px;font-weight:750}.small{font-size:12px;color:#667085;line-height:1.55}.qualityActions{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:18px}.qualityActions a{font-size:12px;color:#667085}summary{font-weight:750;cursor:pointer}@media(max-width:700px){.grid,.links,.relatedGrid{grid-template-columns:1fr}.heroHead{grid-template-columns:72px 1fr;gap:16px}.toolLogo,.logoFallback{width:68px;height:68px}.sectionHead{align-items:flex-start;flex-direction:column}.relatedCard{align-items:flex-start}.secondaryCta{margin-left:0}}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><nav class="crumbs"><a href="/">Home</a> / <a href="/tools">Tools</a> / ${esc(tool.name)}</nav><main class="hero"><div class="heroHead">${iconMarkup(tool,'toolLogo')}<div><div class="eyebrow">Independent ${esc(tool.category)} software profile</div><h1>${esc(tool.name)} profile</h1></div></div><p class="lead">${esc(tool.description)}</p></main><section class="grid"><div class="panel"><h2>Best for</h2><ul>${(tool.bestFor||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h2>Key capabilities</h2><div class="chips">${(tool.features||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div></div><div class="panel"><h2>Pricing at a glance</h2><p>${esc(safePricing(tool))}</p><p><strong>Free plan recorded:</strong> ${freePlanLabel(tool)}</p><p><strong>Category:</strong> ${esc(tool.category)}</p><a class="cta" href="/go/${encodeURIComponent(tool.slug)}" rel="nofollow sponsored">Explore ${esc(tool.name)}</a>${comparisonCta}</div></section>${relatedHtml}${guides.length?`<section class="section"><h2>Buying guides featuring ${esc(tool.name)}</h2><div class="links">${guides.map(g=>`<a href="/${g.slug}">${esc(title(g))}</a>`).join('')}</div></section>`:''}${comparisons.length?`<section class="section"><h2>${esc(tool.name)} editorial comparisons</h2><div class="links">${comparisons.map(c=>`<a href="/${c.slug}">${esc(c.names.join(' vs '))}</a>`).join('')}</div></section>`:''}<section class="section"><h2>Frequently asked questions</h2>${faq.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section><p class="small">${verificationDate?`Source data last checked ${esc(verificationDate)}. `:''}Vendor pricing and capabilities can change. Check current vendor information before purchase. ToolScout may earn affiliate compensation, but affiliate relationships do not influence ranking or fit.</p><div class="qualityActions"><a href="${esc(reportHref)}">Report outdated information</a><a href="/methodology.html">How ToolScout verifies software information</a></div></div><script>function nextToolIcon(img){const stage=Number(img.dataset.stage||0);if(stage===0&&img.dataset.first){img.dataset.stage='1';img.src=img.dataset.first;return}if(stage<=1&&img.dataset.google){img.dataset.stage='2';img.src=img.dataset.google;return}img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.hidden=false}</script></body></html>`;
}

const holds=[];let created=0,refreshed=0,removed=0;
for(const tool of tools){
  const file=path.join(out,`${tool.slug}.html`);
  if(!validTool(tool)){
    if(fs.existsSync(file)){fs.rmSync(file);removed++;}
    holds.push({slug:tool?.slug||null,name:tool?.name||null,reason:'Insufficient catalog evidence for an indexable public tool profile.'});
    continue;
  }
  const html=render(tool);
  if(!fs.existsSync(file)){created++;fs.writeFileSync(file,html);}else if(fs.readFileSync(file,'utf8')!==html){refreshed++;fs.writeFileSync(file,html);}
}
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','tool-profile-holds.json'),JSON.stringify({generatedAt:new Date().toISOString(),count:holds.length,items:holds},null,2)+'\n');
console.log(JSON.stringify({created,refreshed,removed,profiles:tools.length-holds.length,publishedGuideCandidates:intents.length,held:holds.length}));
