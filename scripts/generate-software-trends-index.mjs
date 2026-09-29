import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const PAGE_URL=`${BASE}/software-trends-index.html`;
const DATA_URL=`${BASE}/software-trends-index.json`;
const VERSION=4;
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const monthKey=date=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
const monthLabel=date=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(date);

const feed=read('data/software-updates.json',{updatedAt:new Date().toISOString(),editorialPolicy:'Updates are selected for buyer relevance.',items:[]});
const growthPriority=read('reports/growth-priority.json',{gsc:{siteTotals:{}},items:[]});
const gscTotals=growthPriority?.gsc?.siteTotals||{};
const comparisons=read('data/comparisons.json',[]);
const items=(feed.items||[]).slice().sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
const vendorUpdates=items.filter(item=>item?.toolSlug&&/^https:\/\//i.test(String(item?.sourceUrl||''))).slice(0,12);
const stamp=new Date(feed.updatedAt||new Date().toISOString());
const publishedAt=Number.isFinite(stamp.getTime())?stamp:new Date();
const edition=monthKey(publishedAt);
const editionLabel=monthLabel(publishedAt);

function changeType(item){
  const label=`${item?.label||''} ${item?.title||''} ${item?.summary||''}`.toLowerCase();
  if(/retire|shut down|sunset|deprecat/.test(label))return'product_retirement';
  if(/security|authentication|mfa|ssh|permission|access/.test(label))return'security_governance';
  if(/price|pricing|plan|free tier|billing/.test(label))return'pricing_packaging';
  if(/mcp|connector|integration|connect/.test(label))return'integrations_connectivity';
  if(/agent|ai |copilot|model|automation|workflow/.test(label))return'ai_automation';
  return'product_capability';
}
function buyerImpact(type,item){
  const tool=item?.toolName||'This product';
  if(type==='product_retirement')return `${tool} buyers should review migration, continuity and replacement requirements before relying on the affected workflow.`;
  if(type==='security_governance')return `${tool} buyers should verify whether the new controls change authentication, administration or security requirements for their team.`;
  if(type==='pricing_packaging')return `${tool} buyers should re-check total cost and plan eligibility because packaging changes can alter the economics of an existing shortlist.`;
  if(type==='integrations_connectivity')return `${tool} buyers should reassess integration depth and automation architecture if connected workflows are central to the purchase decision.`;
  if(type==='ai_automation')return `${tool} buyers should verify how the new AI or automation capability changes workflow scope, governance and implementation effort.`;
  return `${tool} buyers should compare the new capability against the requirements that originally put the product on their shortlist.`;
}
function decisionPagesFor(item){
  const slug=String(item?.toolSlug||'');if(!slug)return[];
  const pages=[];
  if(fs.existsSync(path.join(ROOT,'tools',slug+'.html')))pages.push({type:'profile',url:`/tools/${slug}`,label:`${item.toolName||slug} profile`});
  for(const pair of comparisons||[]){
    if(!Array.isArray(pair)||pair.length<2||!pair.includes(slug))continue;
    const comparisonSlug=`${pair[0]}-vs-${pair[1]}`;
    if(fs.existsSync(path.join(ROOT,comparisonSlug+'.html')))pages.push({type:'comparison',url:`/${comparisonSlug}`,label:comparisonSlug.replace(/-/g,' ')});
  }
  for(const row of growthPriority?.items||[]){
    if(!Array.isArray(row?.topTools)||!row.topTools.includes(slug))continue;
    const intent=String(row.intent||'');if(!intent)continue;
    if(fs.existsSync(path.join(ROOT,intent+'.html')))pages.push({type:'guide',url:`/${intent}`,label:row.title||intent.replace(/-/g,' ')});
  }
  return [...new Map(pages.map(x=>[x.url,x])).values()].slice(0,5);
}

const themeDefs=[
  {id:'agent-workflows',title:'AI agents are becoming reusable team workflows',summary:'Recent product releases point toward reusable skills, shared AI behaviour and repeatable agent workflows instead of isolated prompting.',keywords:['agent','skill','reusable','shared']},
  {id:'connected-software',title:'Business software is opening up to agent connections',summary:'MCP and related integration layers are making software easier for AI tools to read from and act on with explicit permissions.',keywords:['mcp','integration','connect','connector']},
  {id:'workflow-convergence',title:'Analysis and execution are moving closer together',summary:'More software updates are designed to reduce the handoff between understanding what happened and taking the next operational action.',keywords:['action','workflow','automation','execute']}
];

const themes=themeDefs.map(theme=>{
  const evidence=vendorUpdates.filter(item=>{
    const haystack=`${item.title||''} ${item.summary||''}`.toLowerCase();
    return theme.keywords.some(keyword=>haystack.includes(keyword));
  }).map(item=>item.id);
  return {...theme,evidence};
}).filter(theme=>theme.evidence.length>0).map(({keywords,...theme})=>theme);

const updates=vendorUpdates.map(item=>{
  const type=changeType(item);
  return{
    id:item.id,
    publishedAt:item.publishedAt,
    toolSlug:item.toolSlug,
    toolName:item.toolName,
    label:item.label,
    title:item.title,
    summary:item.summary,
    changeType:type,
    buyerImpact:buyerImpact(type,item),
    decisionPages:decisionPagesFor(item),
    articleUrl:item.articleUrl||item.profileUrl||null,
    sourceName:item.sourceName,
    sourceUrl:item.sourceUrl
  };
});

const publicData={
  version:VERSION,
  edition,
  editionLabel,
  publishedAt:publishedAt.toISOString(),
  scope:'ToolScout first-party editorial dataset of public software product changes selected for buyer relevance. It is not a measure of global market share.',
  updatedThrough:updates[0]?.publishedAt||null,
  sourceMethod:'Primary vendor documentation, changelogs, release notes and official product announcements. ToolScout classifies buyer impact independently of affiliate status.',
  primarySourceCount:new Set(updates.map(x=>x.sourceUrl).filter(Boolean)).size,
  searchVisibility:{source:'Google Search Console',impressions:Number(gscTotals.impressions||0),clicks:Number(gscTotals.clicks||0),ctr:Number(gscTotals.ctr||0),position:Number(gscTotals.position||0)},
  editorialPolicy:feed.editorialPolicy||'Updates are selected for buyer relevance. Affiliate status does not influence inclusion or placement.',
  themes,
  updates,
  pageUrl:PAGE_URL,
  dataUrl:DATA_URL
};

fs.writeFileSync(path.join(ROOT,'software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');

const updateCards=updates.map(item=>`<article class="update"><div class="meta"><span>${esc(item.label||'Product update')}</span><span>${esc(item.publishedAt||'')}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="impact"><strong>Buyer impact</strong><span>${esc(item.buyerImpact)}</span></div>${item.decisionPages?.length?`<div class="decision"><strong>Related ToolScout decisions</strong><div>${item.decisionPages.map(page=>`<a href="${esc(page.url)}">${esc(page.label)}</a>`).join('')}</div></div>`:''}<div class="actions">${item.articleUrl?`<a href="${esc(item.articleUrl)}">Read ToolScout article</a>`:''}<a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">Official source</a></div></article>`).join('');
const themeCards=themes.map(theme=>`<article class="theme"><div class="eyebrow">Signal to watch</div><h2>${esc(theme.title)}</h2><p>${esc(theme.summary)}</p></article>`).join('');
const schema={
  '@context':'https://schema.org',
  '@graph':[
    {
      '@type':'Article',
      headline:`Software Trends: ${editionLabel}`,
      description:'A buyer focused monthly brief on public software product changes, AI agent workflows, integrations and automation trends.',
      url:PAGE_URL,
      datePublished:publishedAt.toISOString(),
      dateModified:publishedAt.toISOString(),
      author:{'@type':'Organization',name:'ToolScout',url:BASE},
      publisher:{'@type':'Organization',name:'ToolScout',url:BASE},
      about:themes.map(theme=>theme.title)
    },
    {
      '@type':'Dataset',
      name:`ToolScout Software Trends Index - ${editionLabel}`,
      description:'Structured observations of public software product changes with primary sources, ToolScout change classification and buyer-impact notes.',
      url:DATA_URL,
      dateModified:publishedAt.toISOString(),
      creator:{'@type':'Organization',name:'ToolScout',url:BASE},
      distribution:{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:DATA_URL},
      variableMeasured:['published date','software vendor','change type','buyer impact','primary source','related decision pages']
    }
  ]
};

const html=`<!doctype html><html lang="en"><head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Software Trends: ${esc(editionLabel)} | ToolScout</title><meta name="description" content="A buyer focused monthly brief on public software releases, AI agent workflows, integrations and automation trends."><link rel="canonical" href="${PAGE_URL}"><meta name="robots" content="index,follow"><meta property="og:title" content="Software Trends: ${esc(editionLabel)} | ToolScout"><meta property="og:description" content="Public product changes and software trends worth watching this month."><meta property="og:type" content="article"><meta property="og:url" content="${PAGE_URL}"><meta property="og:site_name" content="ToolScout"><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style>:root{font-family:Inter,system-ui,sans-serif;color:#101828;background:#f6f7f9}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1080px;margin:auto;padding:28px 22px 84px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px}.brand{font-size:22px;font-weight:850;color:#101828;text-decoration:none}.nav{display:flex;gap:12px;flex-wrap:wrap}.nav a{font-size:13px;color:#667085;text-decoration:none}.hero{padding:76px 0 38px;max-width:880px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}h1{font-size:clamp(46px,7vw,76px);line-height:.98;letter-spacing:-.055em;margin:14px 0 18px}.lead{font-size:19px;line-height:1.65;color:#667085;max-width:820px}.notice{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:20px;margin-top:26px;color:#475467;line-height:1.65}.themes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:28px 0 64px}.theme{background:#101828;color:#fff;border-radius:20px;padding:22px}.theme .eyebrow{color:#98a2b3}.theme h2{font-size:22px;letter-spacing:-.035em;margin:12px 0 10px}.theme p{color:#c7ced8;line-height:1.6;font-size:14px}.section{margin-top:58px;padding-top:34px;border-top:1px solid #e4e7ec}.sectionHead h2{font-size:32px;letter-spacing:-.035em;margin:0 0 8px}.sectionHead p{color:#667085;line-height:1.6;max-width:760px}.updates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin-top:22px}.update{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:20px}.update .meta{display:flex;justify-content:space-between;gap:10px;color:#98a2b3;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}.update h3{font-size:20px;letter-spacing:-.025em;margin:13px 0 8px}.update p{color:#667085;line-height:1.6;font-size:14px}.impact,.decision{margin-top:14px;border-top:1px solid #eef1f4;padding-top:12px}.impact strong,.decision strong{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#667085}.impact span{display:block;margin-top:5px;color:#344054;font-size:13px;line-height:1.55}.decision div{display:flex;gap:9px;flex-wrap:wrap;margin-top:6px}.decision a{font-size:11px;color:#344054}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}.actions a{font-size:12px;font-weight:800;color:#344054;text-decoration:none}.method{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:22px;color:#667085;line-height:1.65}.method strong{color:#101828}.cta{display:inline-block;margin-top:22px;background:#101828;color:#fff;text-decoration:none;padding:11px 15px;border-radius:10px;font-weight:800}@media(max-width:800px){.themes{grid-template-columns:1fr}.updates{grid-template-columns:1fr}}</style></head><body><div class="wrap"><div class="top"><a class="brand" href="/">ToolScout</a><nav class="nav"><a href="/whats-new.html">What's new</a><a href="/compare.html">Compare</a><a href="/guides.html">Guides</a><a href="/tools.html">Tools</a></nav></div><main class="hero"><div class="eyebrow">Software trends · ${esc(editionLabel)}</div><h1>Software trends worth watching.</h1><p class="lead">A buyer focused brief on public product releases and the patterns they suggest across AI agents, integrations and automation.</p><div class="notice"><strong>Public product signals, carefully scoped.</strong> This page is built from primary vendor documentation and public product updates selected for buyer relevance. Each record includes ToolScout's buyer-impact classification and links back to the primary source. <a href="/software-trends-index.json">Download the structured JSON dataset</a>.</div></main>${themes.length?`<section class="themes">${themeCards}</section>`:''}<section class="section"><div class="sectionHead"><h2>Notable product moves</h2><p>These are selected public updates from official vendor sources. They are included for product relevance, not because of affiliate relationships.</p></div><div class="updates">${updateCards||'<article class="update"><h3>No public updates selected yet.</h3><p>The next edition will appear here when there are relevant vendor changes to cover.</p></article>'}</div></section><section class="section"><div class="sectionHead"><h2>How ToolScout reads the market</h2></div><div class="method"><strong>Selection is editorial.</strong> We look for product changes that materially affect how buyers evaluate or use software, prioritise first party vendor sources and keep affiliate status out of inclusion decisions. ToolScout then classifies the type of change, writes a buyer-impact note and connects the update to relevant decision pages. The themes above describe patterns in the selected public releases. They are not market share claims.</div><a class="cta" href="/compare.html">Compare software</a></section></div></body></html>`;
fs.writeFileSync(path.join(ROOT,'software-trends-index.html'),html,'utf8');

const distributionAsset={generatedAt:publishedAt.toISOString(),items:[{id:`software-trends-${edition}`,assetType:'editorial_research',title:`Software Trends: ${editionLabel}`,canonicalUrl:PAGE_URL,dataUrl:DATA_URL,citationText:'ToolScout Software Trends summarises public vendor release notes and product announcements selected for buyer relevance.',sourcePolicy:'Official vendor sources and clearly labelled public product updates.'}]};
fs.writeFileSync(path.join(ROOT,'reports','linkable-assets.json'),JSON.stringify(distributionAsset,null,2)+'\n');
console.log(JSON.stringify({edition,themes:themes.length,updates:updates.length,page:'software-trends-index.html'}));
