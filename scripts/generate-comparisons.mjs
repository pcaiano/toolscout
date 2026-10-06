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
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'data','organic-growth-engine.json'),'utf8'));
const editorialQuality=config?.editorialQuality||{};
const editorialQualityFor=pagePath=>editorialQuality.rollout==='full'||(editorialQuality.rollout==='pilot'&&(editorialQuality.pilotPaths||[]).includes(pagePath));
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
function aiProfile(tool){return tool?.aiIntegration&&typeof tool.aiIntegration==='object'?tool.aiIntegration:{status:'unverified',tier:'unknown',mcp:'unknown',assistants:[]};}
function aiTier(tool){const p=aiProfile(tool);if(p.status!=='verified')return 'Not yet verified';return p.tier==='strong'?'Strong':p.tier==='moderate'?'Moderate':p.tier==='limited'?'Limited':'Verified';}
function aiAssistants(tool){const xs=aiProfile(tool).assistants||[];return xs.length?listPhrase(xs):'No named assistant client recorded';}
function aiMcp(tool){const p=aiProfile(tool);return p.mcp==='official'?'Official MCP':p.mcp==='community'?'Community MCP':'Not verified';}
function aiComparisonSentence(a,b){
  const ap=aiProfile(a),bp=aiProfile(b),rank={unknown:0,limited:1,moderate:2,strong:3},av=rank[ap.tier]||0,bv=rank[bp.tier]||0;
  if(ap.status!=='verified'&&bp.status!=='verified')return 'ToolScout has not yet verified AI assistant or agent interoperability for either product, so this factor should not be used to choose between them yet.';
  if(av===bv)return `${aiTier(a)} AI interoperability is recorded for ${a.name} and ${aiTier(b).toLowerCase()} for ${b.name}. Check the named assistant and MCP routes against the workflow you plan to automate.`;
  const winner=av>bv?a:b,other=av>bv?b:a;
  return `${winner.name} currently has the stronger verified AI interoperability profile. ${other.name} may still fit better on product capability, price or workflow depth.`;
}
function editorialConclusionLegacy(a,b){
  const aWins=dimensions.filter(key=>Number(a.scores?.[key]||0)>Number(b.scores?.[key]||0)).slice(0,3).map(key=>dimensionLabel[key]||key);
  const bWins=dimensions.filter(key=>Number(b.scores?.[key]||0)>Number(a.scores?.[key]||0)).slice(0,3).map(key=>dimensionLabel[key]||key);
  const first=aWins.length&&bWins.length?`${a.name} scores higher on ${listPhrase(aWins)}, while ${b.name} scores higher on ${listPhrase(bWins)}.`:aWins.length?`${a.name} has the clearer score advantage on ${listPhrase(aWins)}, while the remaining decision still depends on fit and current product terms.`:bWins.length?`${b.name} has the clearer score advantage on ${listPhrase(bWins)}, while the remaining decision still depends on fit and current product terms.`:`ToolScout scores do not separate ${a.name} and ${b.name} clearly enough to support a general winner.`;
  const aBest=(a.bestFor||[]).slice(0,2),bBest=(b.bestFor||[]).slice(0,2);
  const second=aBest.length&&bBest.length?`${a.name} is cataloged for ${listPhrase(aBest)}, while ${b.name} is cataloged for ${listPhrase(bBest)}.`:aBest.length?`${a.name} is cataloged for ${listPhrase(aBest)}.`:bBest.length?`${b.name} is cataloged for ${listPhrase(bBest)}.`:'';
  const bFeatures=new Set((b.features||[]).map(v=>String(v).toLowerCase()));
  const overlap=(a.features||[]).filter(v=>bFeatures.has(String(v).toLowerCase())).slice(0,3);
  const third=overlap.length?`Because both list ${listPhrase(overlap)}, compare the depth of those shared capabilities against your workflow before choosing.`:'Compare the products against your actual workflow, feature requirements and current commercial terms before choosing.';
  return clean([first,second,third,aiComparisonSentence(a,b)].filter(Boolean).join(' '));
}
function comparisonKey(a,b){return [String(a?.slug||''),String(b?.slug||'')].sort().join('|');}
function editorialOverride(a,b){return editorialQuality?.comparisonOverrides?.[comparisonKey(a,b)]||null;}
function editorialConclusionV2(a,b){
  const deltas=dimensions.map(key=>({key,diff:Number(a.scores?.[key]||0)-Number(b.scores?.[key]||0)})).filter(x=>x.diff!==0).sort((x,y)=>Math.abs(y.diff)-Math.abs(x.diff));
  const aEdges=deltas.filter(x=>x.diff>0),bEdges=deltas.filter(x=>x.diff<0),aEdge=aEdges[0],bEdge=bEdges[0];
  const aOnly=(a.features||[]).filter(v=>!(b.features||[]).map(x=>String(x).toLowerCase()).includes(String(v).toLowerCase())).slice(0,2);
  const bOnly=(b.features||[]).filter(v=>!(a.features||[]).map(x=>String(x).toLowerCase()).includes(String(v).toLowerCase())).slice(0,2);
  const sharedBest=shared(a.bestFor,b.bestFor).slice(0,2);
  let first='';
  if(aEdge&&bEdge){
    const aMag=Math.abs(aEdge.diff),bMag=Math.abs(bEdge.diff);
    if(aMag>bMag)first=`${a.name}'s clearest numerical separation is ${dimensionLabel[aEdge.key]||aEdge.key}, where it scores ${Number(a.scores?.[aEdge.key]||0)} against ${Number(b.scores?.[aEdge.key]||0)} for ${b.name}. ${b.name}'s strongest counterweight is ${dimensionLabel[bEdge.key]||bEdge.key}.`;
    else if(bMag>aMag)first=`${b.name}'s strongest score advantage is ${dimensionLabel[bEdge.key]||bEdge.key}, at ${Number(b.scores?.[bEdge.key]||0)} versus ${Number(a.scores?.[bEdge.key]||0)}. ${a.name} answers with smaller advantages led by ${dimensionLabel[aEdge.key]||aEdge.key}.`;
    else first=`${a.name} and ${b.name} separate on different priorities: ${a.name} is stronger on ${dimensionLabel[aEdge.key]||aEdge.key}, while ${b.name} is stronger on ${dimensionLabel[bEdge.key]||bEdge.key}.`;
  }else if(aEdge)first=`${a.name} has the clearer score profile, led by ${dimensionLabel[aEdge.key]||aEdge.key}; ${b.name}'s case has to come from product fit rather than a higher recorded score.`;
  else if(bEdge)first=`${b.name} has the clearer score profile, led by ${dimensionLabel[bEdge.key]||bEdge.key}; ${a.name}'s case has to come from product fit rather than a higher recorded score.`;
  else first=`The scorecard does not create a meaningful numerical gap between ${a.name} and ${b.name}, so product scope and workflow fit have to do the separating.`;
  const second=aOnly.length&&bOnly.length?`${a.name} adds ${listPhrase(aOnly)} to the comparison, while ${b.name} brings ${listPhrase(bOnly)}.`:aOnly.length?`${a.name}'s more distinctive recorded capabilities include ${listPhrase(aOnly)}.`:bOnly.length?`${b.name}'s more distinctive recorded capabilities include ${listPhrase(bOnly)}.`:'';
  const third=sharedBest.length?`Both target ${listPhrase(sharedBest)}, so audience labels alone are not enough to settle the choice.`:`Their recorded audiences differ enough that the buyer profile should carry real weight in the decision.`;
  return clean([first,second,third,aiComparisonSentence(a,b)].filter(Boolean).join(' '));
}
function editorialConclusion(a,b){
  const override=editorialOverride(a,b);
  if(override?.analysis)return clean(override.analysis);
  return editorialQualityFor(`${a.slug}-vs-${b.slug}.html`)||editorialQualityFor(`${b.slug}-vs-${a.slug}.html`)?editorialConclusionV2(a,b):editorialConclusionLegacy(a,b);
}
function decisionGuidanceLegacy(a,b){
  const ranked=dimensions
    .map(key=>({key,diff:Number(a.scores?.[key]||0)-Number(b.scores?.[key]||0)}))
    .sort((x,y)=>Math.abs(y.diff)-Math.abs(x.diff));
  const lead=ranked.find(item=>item.diff!==0);
  if(lead){
    const winner=lead.diff>0?a:b,other=lead.diff>0?b:a;
    const otherFit=(other.bestFor||[])[0]||other.category||'your alternative workflow';
    return clean(`Choose ${winner.name} if ${dimensionLabel[lead.key]||lead.key} is the stronger priority for your workflow; choose ${other.name} when ${otherFit} better matches the job you need to do.`);
  }
  const aFit=(a.bestFor||[])[0]||a.category||'your workflow';
  const bFit=(b.bestFor||[])[0]||b.category||'your workflow';
  return clean(`Choose ${a.name} if ${aFit} better matches your workflow; choose ${b.name} when ${bFit} is the closer fit.`);
}
function decisionGuidanceV2(a,b){
  const ranked=dimensions.map(key=>({key,diff:Number(a.scores?.[key]||0)-Number(b.scores?.[key]||0)})).filter(x=>x.diff!==0).sort((x,y)=>Math.abs(y.diff)-Math.abs(x.diff));
  const aEdge=ranked.find(x=>x.diff>0),bEdge=ranked.find(x=>x.diff<0);
  const aFit=(a.bestFor||[])[0]||a.category||'this workflow',bFit=(b.bestFor||[])[0]||b.category||'this workflow';
  if(aEdge&&bEdge)return clean(`Choose ${a.name} when ${dimensionLabel[aEdge.key]||aEdge.key} matters more and the buyer looks like ${aFit}; choose ${b.name} when ${dimensionLabel[bEdge.key]||bEdge.key} is the harder requirement and ${bFit} is the closer operating context.`);
  if(aEdge)return clean(`${a.name} is the stronger default on the recorded scorecard, especially for ${dimensionLabel[aEdge.key]||aEdge.key}; choose ${b.name} only where its product scope or ${bFit} audience fit is more important than that edge.`);
  if(bEdge)return clean(`${b.name} is the stronger default on the recorded scorecard, especially for ${dimensionLabel[bEdge.key]||bEdge.key}; choose ${a.name} only where its product scope or ${aFit} audience fit is more important than that edge.`);
  return clean(`There is no defensible score winner here. Choose ${a.name} for the workflow that better matches ${aFit}, and ${b.name} where ${bFit} is the more accurate description of the buyer.`);
}
function decisionGuidance(a,b){
  const override=editorialOverride(a,b);
  if(override?.decision)return clean(override.decision);
  return editorialQualityFor(`${a.slug}-vs-${b.slug}.html`)||editorialQualityFor(`${b.slug}-vs-${a.slug}.html`)?decisionGuidanceV2(a,b):decisionGuidanceLegacy(a,b);
}
function comparisonMethodology(){
  return 'ToolScout compares catalog-backed pricing, capabilities, use cases and score dimensions using first-party vendor sources and recorded verification dates. The conclusion is a workflow fit judgment, not a universal product claim, and affiliate relationships do not influence the comparison.';
}
function overlapValues(a,b,key){
  const bSet=new Set((b[key]||[]).map(v=>String(v).toLowerCase()));
  return (a[key]||[]).filter(v=>bSet.has(String(v).toLowerCase()));
}
function scoreDistance(a,b){
  const diffs=dimensions.map(key=>Math.abs(Number(a.scores?.[key]||0)-Number(b.scores?.[key]||0)));
  return diffs.reduce((sum,v)=>sum+v,0)/Math.max(1,diffs.length);
}
function comparableScore(candidate,anchor){
  if(candidate.category!==anchor.category)return -1;
  const featureOverlap=overlapValues(candidate,anchor,'features').length;
  const audienceOverlap=overlapValues(candidate,anchor,'bestFor').length;
  return featureOverlap*10+audienceOverlap*5+Math.max(0,30-scoreDistance(candidate,anchor)*6);
}
function comparableTools(a,b){
  const eligible=tools.filter(t=>t.comparisonEligible!==false);
  const used=new Set([a.slug,b.slug]),out=[];
  for(const anchor of [a,b]){
    const ranked=eligible.filter(t=>!used.has(t.slug)&&t.category===anchor.category).map(t=>({tool:t,anchor,score:comparableScore(t,anchor)})).sort((x,y)=>y.score-x.score||String(x.tool.name).localeCompare(String(y.tool.name)));
    for(const item of ranked){
      if(out.filter(x=>x.anchor.slug===anchor.slug).length>=2)break;
      if(used.has(item.tool.slug))continue;
      out.push(item);used.add(item.tool.slug);
      if(out.length>=4)break;
    }
    if(out.length>=4)break;
  }
  if(out.length<4){
    const anchors=[a,b];
    const fill=eligible.filter(t=>!used.has(t.slug)&&anchors.some(anchor=>t.category===anchor.category)).map(t=>{
      const anchor=anchors.filter(x=>x.category===t.category).sort((x,y)=>comparableScore(t,y)-comparableScore(t,x))[0];
      return{tool:t,anchor,score:comparableScore(t,anchor)};
    }).sort((x,y)=>y.score-x.score||String(x.tool.name).localeCompare(String(y.tool.name)));
    for(const item of fill){if(out.length>=4)break;if(!used.has(item.tool.slug)){out.push(item);used.add(item.tool.slug)}}
  }
  return out.slice(0,4);
}
function suggestionReason(tool,anchor){
  const sharedFeatures=overlapValues(tool,anchor,'features').slice(0,2);
  if(sharedFeatures.length)return `Same ${anchor.category} category as ${anchor.name} and shares ${listPhrase(sharedFeatures)}.`;
  const sharedAudience=overlapValues(tool,anchor,'bestFor').slice(0,2);
  if(sharedAudience.length)return `Same ${anchor.category} category as ${anchor.name} and targets ${listPhrase(sharedAudience)}.`;
  return `Same ${anchor.category} category as ${anchor.name} with a nearby ToolScout score profile.`;
}
function suggestionLogoHtml(tool){
  const icon=iconSources(tool);
  const img=icon.src?`<img src="${esc(icon.src)}" data-first="${esc(icon.first)}" data-google="${esc(icon.google)}" data-stage="${icon.stage}" alt="${esc(tool.name)} logo" width="25" height="25" loading="lazy" referrerpolicy="no-referrer" onerror="nextIcon(this)">`:'';
  return `<div class="logo"><span class="logo-fallback">${esc(initials(tool.name))}</span>${img}</div>`;
}
function suggestionsHtml(a,b){
  const items=comparableTools(a,b);
  if(!items.length)return '';
  return `<div class='suggestions-head'><div class='meta'>Explore alternatives</div><h2>Also worth comparing</h2><p>Other tools in the same categories that may help sharpen the decision.</p></div><div class='suggestion-grid'>${items.map(item=>`<a class='suggestion-card' href='/compare.html?a=${encodeURIComponent(item.anchor.slug)}&amp;b=${encodeURIComponent(item.tool.slug)}&amp;source=comparison-suggestions'><div class='suggestion-top'>${suggestionLogoHtml(item.tool)}<strong>${esc(item.tool.name)}</strong></div><span>${esc(suggestionReason(item.tool,item.anchor))}</span><b>Compare with ${esc(item.anchor.name)}</b></a>`).join('')}</div>`;
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
  const rows=[['Category',a.category,b.category],['Pricing',a.pricing||'See vendor',b.pricing||'See vendor'],['Free plan',freeLabel(a),freeLabel(b)],['AI interoperability',aiTier(a),aiTier(b)],['AI assistants',aiAssistants(a),aiAssistants(b)],['Agent connectivity',aiMcp(a),aiMcp(b)],['Features',(a.features||[]).join(', '),(b.features||[]).join(', ')],['Best for',(a.bestFor||[]).join(', '),(b.bestFor||[]).join(', ')],['Last verified',a.lastVerified||'Not recorded',b.lastVerified||'Not recorded']];
  return `<div class="row"><div class="cell label">Compare</div><div class="cell">${headHtml(a)}${ctaHtml(a)}</div><div class="cell">${headHtml(b)}${ctaHtml(b)}</div></div>`+rows.map(r=>`<div class="row"><div class="cell label">${esc(r[0])}</div><div class="cell value">${esc(r[1])}</div><div class="cell value">${esc(r[2])}</div></div>`).join('');
}
function render(a,b){
  const slug=`${a.slug}-vs-${b.slug}`;assertToolData(a,slug);assertToolData(b,slug);
  const title=`${a.name} vs ${b.name}: Software Comparison | ToolScout`;
  const desc=`Compare ${a.name} and ${b.name} side by side on pricing, capabilities, AI interoperability, use cases and ToolScout fit signals.`;
  const schema={"@context":"https://schema.org","@type":"WebPage",name:clean(`${a.name} vs ${b.name} software comparison`),url:`${BASE}/${slug}`,description:clean(desc),isPartOf:{"@type":"WebSite",name:"ToolScout",url:`${BASE}/`},about:[{"@type":"SoftwareApplication",name:clean(a.name),url:a.sourceUrl,featureList:aiProfile(a).status==='verified'?[aiComparisonSentence(a,b)]:undefined},{"@type":"SoftwareApplication",name:clean(b.name),url:b.sourceUrl,featureList:aiProfile(b).status==='verified'?[aiComparisonSentence(a,b)]:undefined}]};
  let html=compareTemplate;
  html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${esc(title)}</title>`);
  html=html.replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(desc)}">`);
  html=html.replace(/<link rel="canonical" href="[^"]*">/,`<link rel="canonical" href="${BASE}/${slug}">`);
  html=html.replace(/<meta property="og:title" content="[^"]*">/,`<meta property="og:title" content="${esc(title)}">`);
  html=html.replace(/<meta property="og:description" content="[^"]*">/,`<meta property="og:description" content="${esc(desc)}">`);
  html=html.replace(/<meta property="og:url" content="[^"]*">/,`<meta property="og:url" content="${BASE}/${slug}">`);
  html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,`<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script>`);
  html=html.replace('<body data-default-a="" data-default-b="">',`<body data-default-a="${esc(a.slug)}" data-default-b="${esc(b.slug)}"${editorialQualityFor(`${slug}.html`)?` data-editorial-quality="${editorialQuality.rollout==='pilot'?'pilot':'full'}"`:''}>`);
  html=html.replace('<div id="pairNote"></div>',`<div id="pairNote"><div class="pairNote">Comparing <strong>${esc(a.name)}</strong> with <strong>${esc(b.name)}</strong>. Change either selector to explore another pair.</div></div>`);
  html=html.replace('<div id="table" class="table"></div>',`<div id="table" class="table">${initialTable(a,b)}</div>`);
  html=html.replace('<section id="analysis" class="analysis" aria-live="polite"></section>',`<section id="analysis" class="analysis" aria-live="polite"><div class="meta">ToolScout analysis</div><h2>What this comparison means in practice</h2><p>${esc(editorialConclusion(a,b))}</p><p class="decision"><strong>Decision:</strong> ${esc(decisionGuidance(a,b))}</p><h3>How this comparison works</h3><p>${esc(comparisonMethodology())}</p><p class="source-note"><strong>Editorial evidence:</strong> first-party vendor sources are recorded in the ToolScout catalog. Catalog evidence last checked ${esc(a.lastVerified||'not recorded')} and ${esc(b.lastVerified||'not recorded')} respectively.</p></section>`);
  html=html.replace('<section id="suggestions" class="suggestions" aria-live="polite"></section>',`<section id="suggestions" class="suggestions" aria-live="polite">${suggestionsHtml(a,b)}</section>`);
  return html;
}

let created=0,refreshed=0,skipped=[];
for(const[left,right]of PAIRS){const a=bySlug.get(left),b=bySlug.get(right);if(!a||!b){skipped.push(`${left}-vs-${right}`);continue;}const target=path.join(ROOT,`${left}-vs-${right}.html`),html=render(a,b);if(fs.existsSync(target)){if(fs.readFileSync(target,'utf8')!==html){fs.writeFileSync(target,html);refreshed++;}}else{fs.writeFileSync(target,html);created++;}}
if(skipped.length)throw new Error(`Comparison pairs reference missing tools: ${skipped.join(', ')}`);
console.log(JSON.stringify({created,refreshed,comparisons:PAIRS.length,publishedGuideCandidates:intents.length,editorialIntegrity:'strict'}));
