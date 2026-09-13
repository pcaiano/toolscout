import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntents } from './seo-intent-loader.mjs';
import { editorialEligibility } from './seo-eligibility.mjs';
import { editorialTrust } from './editorial-trust.mjs';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const PAGE_URL=`${BASE}/software-trends-index.html`;
const DATA_URL=`${BASE}/software-trends-index.json`;
const VERSION=1;
const MAX_FACTUAL_AGE_DAYS=45;
const MAX_SOURCE_CHECK_AGE_DAYS=10;
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const monthKey=date=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
const monthLabel=date=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(date);
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const pct=value=>`${Number(value||0).toFixed(1)}%`;

const tools=read('data/tools.json',[]);
const freshness=read('data/catalog-freshness-state.json',{tools:{}});
const growth=read('reports/growth-priority.json',{gsc:{available:false,siteTotals:{}},items:[]});
const engine=read('data/organic-growth-engine.json',{editorialGates:{}});
const intents=loadSeoIntents(ROOT);
const intentBySlug=new Map(intents.map(x=>[x.slug,x]));
const toolBySlug=new Map(tools.map(x=>[x.slug,x]));
const minRelevance=num(engine?.editorialGates?.minimumLexicalRelevance||0.75);
const now=new Date();
const edition=monthKey(now);
const editionLabel=monthLabel(now);
const historyPath=path.join(ROOT,'reports','software-trends-history.json');
const history=read('reports/software-trends-history.json',{version:VERSION,editions:[]});

function strictTrust(tool){
  return editorialTrust(tool,freshness?.tools?.[tool?.slug]||null,{maxFactualAgeDays:MAX_FACTUAL_AGE_DAYS,strictSource:true,maxSourceCheckAgeDays:MAX_SOURCE_CHECK_AGE_DAYS});
}

function buildSnapshot(){
  const trustedTools=tools.filter(tool=>strictTrust(tool).trusted);
  const trustedSet=new Set(trustedTools.map(x=>x.slug));
  const byCategory=new Map();
  for(const tool of trustedTools){
    const category=String(tool.category||'uncategorized');
    byCategory.set(category,(byCategory.get(category)||0)+1);
  }
  const categoryCoverage=[...byCategory.entries()].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count||a.category.localeCompare(b.category));

  const observedDemand=(growth.items||[])
    .filter(item=>num(item?.searchSignal?.impressions)>0&&fs.existsSync(path.join(ROOT,`${item.intent}.html`)))
    .map(item=>({
      intent:item.intent,
      title:item.title||item.intent,
      url:`${BASE}/${item.intent}.html`,
      impressions:num(item.searchSignal.impressions),
      clicks:num(item.searchSignal.clicks),
      ctr:num(item.searchSignal.ctr),
      position:num(item.searchSignal.position),
      evidenceConfidence:item.searchSignal.evidenceConfidence||null
    }))
    .sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks||a.position-b.position)
    .slice(0,10);

  const shortlistCounts=new Map();
  const shortlistEvidence=new Map();
  for(const item of growth.items||[]){
    const intent=intentBySlug.get(item.intent);
    if(!intent||item.editorialEligibility!=='eligible')continue;
    for(const slug of item.topTools||[]){
      const tool=toolBySlug.get(slug);
      if(!tool||!trustedSet.has(slug))continue;
      const fit=editorialEligibility(tool,intent,minRelevance);
      if(!fit.eligible)continue;
      shortlistCounts.set(slug,(shortlistCounts.get(slug)||0)+1);
      if(!shortlistEvidence.has(slug))shortlistEvidence.set(slug,[]);
      shortlistEvidence.get(slug).push(item.intent);
    }
  }
  const shortlistLeaders=[...shortlistCounts.entries()]
    .map(([slug,guideAppearances])=>({
      slug,
      name:toolBySlug.get(slug)?.name||slug,
      category:toolBySlug.get(slug)?.category||null,
      guideAppearances,
      eligibleGuides:(shortlistEvidence.get(slug)||[]).slice().sort(),
      sourceUrl:toolBySlug.get(slug)?.sourceUrl||null,
      factualReviewDate:toolBySlug.get(slug)?.lastVerified||toolBySlug.get(slug)?.sourceCheckedOn||null,
      sourceCheckedAt:freshness?.tools?.[slug]?.sourceCheckedAt||null
    }))
    .sort((a,b)=>b.guideAppearances-a.guideAppearances||a.name.localeCompare(b.name))
    .slice(0,12);

  const siteTotals=growth?.gsc?.available?{
    clicks:num(growth?.gsc?.siteTotals?.clicks),
    impressions:num(growth?.gsc?.siteTotals?.impressions),
    ctr:num(growth?.gsc?.siteTotals?.ctr),
    intentsWithSignals:num(growth?.gsc?.intentsWithSignals)
  }:null;

  return {
    version:VERSION,
    edition,
    editionLabel,
    publishedAt:now.toISOString(),
    scope:'ToolScout first-party observations. This is not a measure of global market share, vendor revenue or industry-wide popularity.',
    methodology:{
      catalog:'Named tools are included only when their ToolScout factual record is within 45 days, their official HTTPS source is currently healthy, and that source was checked within 10 days.',
      search:'Search-demand figures come from the Google Search Console Search Analytics data already ingested by ToolScout. Impressions are visibility, not visits or market demand estimates.',
      shortlist:'Shortlist frequency counts appearances in current ToolScout guide shortlists after category, structured capability, hard attribute, relevance and trust gates. It is an editorial coverage measure, not user popularity.',
      independence:'Affiliate status, commission and payout do not increase editorial eligibility, shortlist frequency or ranking.'
    },
    sourceState:{
      catalogRecords:tools.length,
      verifiedCurrentTools:trustedTools.length,
      excludedFromNamedAnalysis:Math.max(0,tools.length-trustedTools.length),
      categoriesRepresented:categoryCoverage.length,
      freePlanRecorded:trustedTools.filter(x=>x.freePlan===true).length,
      gscAvailable:Boolean(growth?.gsc?.available),
      gscSource:growth?.gsc?.source||null
    },
    searchVisibility:siteTotals,
    observedDemand,
    categoryCoverage,
    shortlistLeaders
  };
}

let snapshot=(history.editions||[]).find(x=>x.edition===edition&&x.version===VERSION)||null;
if(!snapshot){
  snapshot=buildSnapshot();
  history.version=VERSION;
  history.editions=[...(history.editions||[]).filter(x=>x.edition!==edition),snapshot].sort((a,b)=>String(a.edition).localeCompare(String(b.edition))).slice(-24);
  fs.mkdirSync(path.dirname(historyPath),{recursive:true});
  fs.writeFileSync(historyPath,JSON.stringify(history,null,2)+'\n');
}

const publicData={
  ...snapshot,
  latestEdition:true,
  pageUrl:PAGE_URL,
  dataUrl:DATA_URL,
  citation:'When citing these figures, describe them as ToolScout first-party observations and preserve the metric labels shown here.'
};
fs.writeFileSync(path.join(ROOT,'software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');

const demandRows=(snapshot.observedDemand||[]).map((x,i)=>`<tr><td>${i+1}</td><td><a href="/${esc(x.intent)}.html">${esc(x.title)}</a></td><td>${x.impressions.toLocaleString('en-GB')}</td><td>${x.clicks.toLocaleString('en-GB')}</td><td>${x.position?x.position.toFixed(1):'n/a'}</td></tr>`).join('');
const shortlistRows=(snapshot.shortlistLeaders||[]).map((x,i)=>`<tr><td>${i+1}</td><td><a href="/tools/${esc(x.slug)}.html">${esc(x.name)}</a></td><td>${esc(x.category)}</td><td>${x.guideAppearances}</td><td>${esc(x.factualReviewDate||'n/a')}</td></tr>`).join('');
const categoryRows=(snapshot.categoryCoverage||[]).map(x=>`<tr><td>${esc(x.category)}</td><td>${x.count}</td></tr>`).join('');
const schema={
  '@context':'https://schema.org','@type':'Dataset',name:`ToolScout Software Trends Index: ${snapshot.editionLabel}`,
  description:'Monthly first-party observations from ToolScout covering verified catalog coverage, Google Search Console visibility and current editorial shortlist frequency.',
  url:PAGE_URL,datePublished:snapshot.publishedAt,dateModified:snapshot.publishedAt,creator:{'@type':'Organization',name:'ToolScout',url:BASE},
  measurementTechnique:['Google Search Console Search Analytics','Verified ToolScout catalog records','ToolScout editorial eligibility and shortlist rules'],
  distribution:{'@type':'DataDownload',contentUrl:DATA_URL,encodingFormat:'application/json'}
};
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout Software Trends Index: ${esc(snapshot.editionLabel)}</title><meta name="description" content="Verified monthly ToolScout first-party observations on software search visibility, catalog coverage and editorial shortlist frequency."><link rel="canonical" href="${PAGE_URL}"><meta name="robots" content="index,follow"><meta property="og:title" content="ToolScout Software Trends Index: ${esc(snapshot.editionLabel)}"><meta property="og:description" content="First-party software observations with explicit methodology and verified source gates."><meta property="og:type" content="article"><meta property="og:url" content="${PAGE_URL}"><meta property="og:site_name" content="ToolScout"><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#101828}.wrap{max-width:1040px;margin:auto;padding:28px 22px 84px}.brand{font-size:22px;font-weight:850;color:#101828;text-decoration:none}.hero{padding:72px 0 34px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}h1{font-size:clamp(42px,7vw,72px);line-height:1;letter-spacing:-.055em;margin:14px 0 18px}.lead{font-size:19px;line-height:1.65;color:#667085;max-width:820px}.notice{background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:20px;margin:24px 0;color:#475467;line-height:1.6}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:28px 0}.metric{background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:20px}.metric b{display:block;font-size:30px;margin-bottom:6px}.metric span{font-size:12px;color:#667085}.section{margin-top:54px;padding-top:34px;border-top:1px solid #e4e7ec}.section h2{font-size:30px;letter-spacing:-.03em}.section p,.section li{color:#667085;line-height:1.65}.tableWrap{overflow-x:auto;background:#fff;border:1px solid #e4e7ec;border-radius:18px}.tableWrap table{width:100%;border-collapse:collapse}.tableWrap th,.tableWrap td{text-align:left;padding:14px 16px;border-bottom:1px solid #eaecf0;font-size:14px}.tableWrap th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#667085}.tableWrap tr:last-child td{border-bottom:0}.tableWrap a{color:#101828;font-weight:700}.download{display:inline-block;margin-top:18px;background:#101828;color:#fff;padding:11px 15px;border-radius:10px;text-decoration:none;font-weight:750}.small{font-size:12px;color:#667085}@media(max-width:760px){.metrics{grid-template-columns:1fr 1fr}}@media(max-width:480px){.metrics{grid-template-columns:1fr}}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><main class="hero"><div class="eyebrow">Original research · ${esc(snapshot.editionLabel)}</div><h1>Software Trends Index</h1><p class="lead">A monthly snapshot of what ToolScout can verify from its own catalog, editorial system and observed Google Search Console visibility.</p><div class="notice"><strong>Scope:</strong> ${esc(snapshot.scope)} The labels below are deliberately narrow so these observations are not mistaken for global software-market statistics.</div></main><section class="metrics"><div class="metric"><b>${snapshot.sourceState.verifiedCurrentTools}</b><span>current tools passing strict source gates</span></div><div class="metric"><b>${snapshot.sourceState.categoriesRepresented}</b><span>verified catalog categories represented</span></div><div class="metric"><b>${snapshot.searchVisibility?snapshot.searchVisibility.impressions.toLocaleString('en-GB'):'n/a'}</b><span>observed GSC impressions in the current source window</span></div><div class="metric"><b>${snapshot.searchVisibility?snapshot.searchVisibility.intentsWithSignals:'n/a'}</b><span>ToolScout intents with observed GSC signals</span></div></section><section class="section"><h2>Highest observed search visibility</h2><p>These are ToolScout pages with the most Google Search Console impressions in the source data used for this edition. Impressions measure search-result visibility. They do not measure market share, product popularity or visits.</p><div class="tableWrap"><table><thead><tr><th>#</th><th>ToolScout guide</th><th>Impressions</th><th>Clicks</th><th>Average position</th></tr></thead><tbody>${demandRows||'<tr><td colspan="5">No verified GSC observations available for this edition.</td></tr>'}</tbody></table></div></section><section class="section"><h2>Most frequently shortlisted in current ToolScout guides</h2><p>This table counts how often a verified tool appears in current ToolScout shortlists after category, structured capability, hard-attribute, relevance and source-trust gates. It is an editorial coverage metric, not a popularity ranking.</p><div class="tableWrap"><table><thead><tr><th>#</th><th>Tool</th><th>Category</th><th>Eligible guide appearances</th><th>Factual review date</th></tr></thead><tbody>${shortlistRows||'<tr><td colspan="5">No named tools passed all strict gates for this edition.</td></tr>'}</tbody></table></div></section><section class="section"><h2>Verified catalog coverage</h2><p>Only tools passing the strict source and freshness requirements for this edition are counted here.</p><div class="tableWrap"><table><thead><tr><th>Category</th><th>Verified current tools</th></tr></thead><tbody>${categoryRows}</tbody></table></div></section><section class="section"><h2>Methodology and limits</h2><ul><li>${esc(snapshot.methodology.catalog)}</li><li>${esc(snapshot.methodology.search)}</li><li>${esc(snapshot.methodology.shortlist)}</li><li>${esc(snapshot.methodology.independence)}</li></ul><p class="small">Excluded from named analysis: ${snapshot.sourceState.excludedFromNamedAnalysis} catalog record(s) that did not pass all strict source gates at publication time. This exclusion is intentional.</p><a class="download" href="/software-trends-index.json">Open the public JSON dataset</a></section></div></body></html>`;
fs.writeFileSync(path.join(ROOT,'software-trends-index.html'),html,'utf8');

const distributionAsset={
  generatedAt:snapshot.publishedAt,
  items:[{
    id:`software-trends-index-${snapshot.edition}`,
    assetType:'original_research',
    title:`ToolScout Software Trends Index: ${snapshot.editionLabel}`,
    url:PAGE_URL,
    dataUrl:DATA_URL,
    priority:96,
    audience:['software journalists','technology newsletters','software communities','AI discovery systems'],
    distributionPolicy:'Use this research asset for editorial, content, community and page-indexing surfaces. Product-directory submissions must continue to use the ToolScout product profile or homepage.',
    claims:[
      `Current strict-source catalog coverage: ${snapshot.sourceState.verifiedCurrentTools} tools across ${snapshot.sourceState.categoriesRepresented} categories.`,
      snapshot.searchVisibility?`Observed ToolScout GSC visibility in this edition source window: ${snapshot.searchVisibility.impressions} impressions across ${snapshot.searchVisibility.intentsWithSignals} intents.`:null
    ].filter(Boolean)
  }]
};
fs.writeFileSync(path.join(ROOT,'reports','linkable-assets.json'),JSON.stringify(distributionAsset,null,2)+'\n');
console.log(JSON.stringify({edition:snapshot.edition,verifiedCurrentTools:snapshot.sourceState.verifiedCurrentTools,categories:snapshot.sourceState.categoriesRepresented,gscImpressions:snapshot.searchVisibility?.impressions||0,namedShortlistLeaders:snapshot.shortlistLeaders.length,page:'software-trends-index.html'}));
