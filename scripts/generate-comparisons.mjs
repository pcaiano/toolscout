import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntents } from './seo-intent-loader.mjs';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const intents=loadSeoIntents(ROOT).filter(intent=>intent?.slug&&fs.existsSync(path.join(ROOT,`${intent.slug}.html`)));
const PAIRS=JSON.parse(fs.readFileSync(path.join(ROOT,'data','comparisons.json'),'utf8'));
const compareTemplate=fs.readFileSync(path.join(ROOT,'compare.html'),'utf8');
const assetData=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tool-assets.json'),'utf8'));
const assets=assetData?.assets||{};
const bySlug=new Map(tools.map(t=>[t.slug,t]));
const clean=v=>String(v??'').replace(/[\u2014\u2013]/g,'-').replace(/verify current pricing before publication/gi,'See vendor for current pricing').replace(/verify before publication/gi,'See vendor for current details').replace(/pending verification/gi,'See vendor for current details').replace(/\s+/g,' ').trim();
const esc=v=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const shared=(a,b)=>[...(a||[])].filter(x=>(b||[]).map(v=>String(v).toLowerCase()).includes(String(x).toLowerCase()));
const stronger=(a,b,key)=>Number(a.scores?.[key]||0)>Number(b.scores?.[key]||0)?a:Number(b.scores?.[key]||0)>Number(a.scores?.[key]||0)?b:null;
const dimensions=['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency'];
const validHttps=value=>{try{return new URL(String(value||'')).protocol==='https:'}catch{return false}};

function assertToolData(tool,pairSlug){
  if(!tool?.slug||!tool?.name||!tool?.category)throw new Error(`${pairSlug}: comparison tool is missing identity or category data`);
  if(!String(tool.description||'').trim())throw new Error(`${pairSlug}: ${tool.slug} is missing a catalog description`);
  if(!validHttps(tool.sourceUrl))throw new Error(`${pairSlug}: ${tool.slug} is missing a valid HTTPS source URL`);
  if(!tool.scores||typeof tool.scores!=='object')throw new Error(`${pairSlug}: ${tool.slug} is missing ToolScout score data`);
}

const intentScore=(tool,intent)=>{const weights=intent.weights||{};let total=0,weight=0;for(const[key,raw]of Object.entries(weights)){const w=Number(raw)||0;if(!w)continue;let value=key==='freePlan'?(tool.freePlan?10:0):key==='simplicity'?Number(tool.scores?.ease||0):Number(tool.scores?.[key]||0);total+=value*w;weight+=w;}return weight?total/weight:0;};
const relatedGuides=(a,b)=>intents.map(intent=>({intent,score:Math.max(intentScore(a,intent),intentScore(b,intent))+(intent.category===a.category||intent.category===b.category?2:0)})).filter(x=>x.intent?.slug&&x.score>0).sort((x,y)=>y.score-x.score).slice(0,3).map(x=>x.intent);

const dimensionLabel={price:'price',ease:'ease of use',automation:'automation',integrations:'integrations',sales:'sales workflows',ai:'AI capabilities',marketing:'marketing',seo:'SEO',research:'research',content:'content workflows',agency:'agency fit'};
function listPhrase(items){const xs=(items||[]).filter(Boolean);if(xs.length<=1)return xs[0]||'workflow fit';if(xs.length===2)return `${xs[0]} and ${xs[1]}`;return `${xs.slice(0,-1).join(', ')}, and ${xs[xs.length-1]}`;}
function editorialConclusion(a,b){
  const aWins=dimensions.filter(key=>Number(a.scores?.[key]||0)>Number(b.scores?.[key]||0)).slice(0,3).map(key=>dimensionLabel[key]||key);
  const bWins=dimensions.filter(key=>Number(b.scores?.[key]||0)>Number(a.scores?.[key]||0)).slice(0,3).map(key=>dimensionLabel[key]||key);
  const first=aWins.length&&bWins.length?`${a.name} scores higher on ${listPhrase(aWins)}, while ${b.name} scores higher on ${listPhrase(bWins)}.`:aWins.length?`${a.name} has the clearer score advantage on ${listPhrase(aWins)}, while the remaining decision still depends on fit and current product terms.`:bWins.length?`${b.name} has the clearer score advantage on ${listPhrase(bWins)}, while the remaining decision still depends on fit and current product terms.`:`ToolScout scores do not separate ${a.name} and ${b.name} clearly enough to support a general winner.`;
  const aBest=(a.bestFor||[]).slice(0,2),bBest=(b.bestFor||[]).slice(0,2);
  const second=aBest.length&&bBest.length?`${a.name} is cataloged for ${listPhrase(aBest)}, while ${b.name} is cataloged for ${listPhrase(bBest)}.`:aBest.length?`${a.name} is cataloged for ${listPhrase(aBest)}.`:bBest.length?`${b.name} is cataloged for ${listPhrase(bBest)}.`:'';
  const bFeatures=new Set((b.features||[]).map(v=>String(v).toLowerCase()));
  const overlap=(a.features||[]).filter(v=>bFeatures.has(String(v).toLowerCase())).slice(0,3);
  const third=overlap.length?`Because both list ${listPhrase(overlap)}, compare the depth of those shared capabilities against your workflow before choosing.`:'Compare the products against your actual workflow, feature requirements and current commercial terms before choosing.';
  return clean([first,second,third].filter(Boolean).join(' '));
}
function initials(n){return String(n||'T').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
function iconSources(t){
  let first='',google='';
  try{const u=new URL(t.sourceUrl);first=u.origin+'/favicon.ico';google='https://www.google.com/s2/favicons?domain='+encodeURIComponent(u.hostname)+'&sz=128';}catch{}
  const curated=assets?.[t.slug]?.url||'';
  return{src:curated||first||google,first:curated?first:'',google,stage:curated?0:1};
}
function freeLabel(t){return t.freePlanKnown===false?'Unknown':t.freePlan?'Yes':'No';}
function headHtml(t){
  const icon=iconSources(t);
  const img=icon.src?`<img src="${esc(icon.src)}" data-first="${esc(icon.first)}" data-google="${esc(icon.google)}" data-stage="${icon.stage}" alt="${esc(t.name)} logo" width="25" height="25" loading="lazy" referrerpolicy="no-referrer" onerror="nextIcon(this)">`:'';
  return `<div class="head"><div class="logo"><span class="logo-fallback">${esc(initials(t.name))}</span>${img}</div>${esc(t.name)}</div>`;
}
function ctaHtml(t){return `<div class="actions"><a class="btn secondary" href="./tools/${encodeURIComponent(t.slug)}">Profile</a><a class="btn" href="/go/${encodeURIComponent(t.slug)}?source=compare" target="_blank" rel="nofollow sponsored noopener">Visit ${esc(t.name)}</a></div>`;}
function initialTable(a,b){
  const rows=[['Category',a.category,b.category],['Pricing',a.pricing||'See vendor',b.pricing||'See vendor'],['Free plan',freeLabel(a),freeLabel(b)],['Features',(a.features||[]).join(', '),(b.features||[]).join(', ')],['Best for',(a.bestFor||[]).join(', '),(b.bestFor||[]).join(', ')],['Last verified',a.lastVerified||'Not recorded',b.lastVerified||'Not recorded']];
  return `<div class="row"><div class="cell label">Compare</div><div class="cell">${headHtml(a)}${ctaHtml(a)}</div><div class="cell">${headHtml(b)}${ctaHtml(b)}</div></div>`+rows.map(r=>`<div class="row"><div class="cell label">${esc(r[0])}</div><div class="cell value">${esc(r[1])}</div><div class="cell value">${esc(r[2])}</div></div>`).join('');
}
function render(a,b){
  const slug=`${a.slug}-vs-${b.slug}`;assertToolData(a,slug);assertToolData(b,slug);
  const title=`${a.name} vs ${b.name}: Software Comparison | ToolScout`;
  const desc=`Compare ${a.name} and ${b.name} side by side on pricing, capabilities, use cases and ToolScout fit signals.`;
  const schema={"@context":"https://schema.org","@type":"WebPage",name:clean(`${a.name} vs ${b.name} software comparison`),url:`${BASE}/${slug}`,description:clean(desc),isPartOf:{"@type":"WebSite",name:"ToolScout",url:`${BASE}/`},about:[{"@type":"SoftwareApplication",name:clean(a.name),url:a.sourceUrl},{"@type":"SoftwareApplication",name:clean(b.name),url:b.sourceUrl}]};
  let html=compareTemplate;
  html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${esc(title)}</title>`);
  html=html.replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(desc)}">`);
  html=html.replace(/<link rel="canonical" href="[^"]*">/,`<link rel="canonical" href="${BASE}/${slug}">`);
  html=html.replace(/<meta property="og:title" content="[^"]*">/,`<meta property="og:title" content="${esc(title)}">`);
  html=html.replace(/<meta property="og:description" content="[^"]*">/,`<meta property="og:description" content="${esc(desc)}">`);
  html=html.replace(/<meta property="og:url" content="[^"]*">/,`<meta property="og:url" content="${BASE}/${slug}">`);
  html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,`<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script>`);
  html=html.replace('<body data-default-a="" data-default-b="">',`<body data-default-a="${esc(a.slug)}" data-default-b="${esc(b.slug)}">`);
  html=html.replace('<div id="pairNote"></div>',`<div id="pairNote"><div class="pairNote">Comparing <strong>${esc(a.name)}</strong> with <strong>${esc(b.name)}</strong>. Change either selector to explore another pair.</div></div>`);
  html=html.replace('<div id="table" class="table"></div>',`<div id="table" class="table">${initialTable(a,b)}</div>`);
  html=html.replace('<section id="analysis" class="analysis" aria-live="polite"></section>',`<section id="analysis" class="analysis" aria-live="polite"><div class="meta">ToolScout analysis</div><h2>What this comparison means in practice</h2><p>${esc(editorialConclusion(a,b))}</p></section>`);
  return html;
}

let created=0,refreshed=0,skipped=[];
for(const[left,right]of PAIRS){const a=bySlug.get(left),b=bySlug.get(right);if(!a||!b){skipped.push(`${left}-vs-${right}`);continue;}const target=path.join(ROOT,`${left}-vs-${right}.html`),html=render(a,b);if(fs.existsSync(target)){if(fs.readFileSync(target,'utf8')!==html){fs.writeFileSync(target,html);refreshed++;}}else{fs.writeFileSync(target,html);created++;}}
if(skipped.length)throw new Error(`Comparison pairs reference missing tools: ${skipped.join(', ')}`);
console.log(JSON.stringify({created,refreshed,comparisons:PAIRS.length,publishedGuideCandidates:intents.length,editorialIntegrity:'strict'}));
