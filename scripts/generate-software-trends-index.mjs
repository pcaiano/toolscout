import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const PAGE_URL=BASE+'/software-trends-index.html';
const DATA_URL=BASE+'/software-trends-index.json';
const VERSION=5;
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const monthKey=date=>date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0');
const monthLabel=date=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(date);
const fmtDate=value=>{try{return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(String(value).slice(0,10)+'T12:00:00Z'));}catch{return String(value||'');}};

const feed=read('data/software-updates.json',{updatedAt:new Date().toISOString(),editorialPolicy:'Updates are selected for buyer relevance.',items:[]});
const growthPriority=read('reports/growth-priority.json',{gsc:{siteTotals:{}},items:[]});
const gscTotals=growthPriority?.gsc?.siteTotals||{};
const comparisons=read('data/comparisons.json',[]);
const items=(feed.items||[]).slice().sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
const stamp=new Date(feed.updatedAt||new Date().toISOString());
const publishedAt=Number.isFinite(stamp.getTime())?stamp:new Date();
const edition=monthKey(publishedAt);
const editionLabel=monthLabel(publishedAt);
const eligibleUpdates=items.filter(item=>item?.toolSlug&&/^https:\/\//i.test(String(item?.sourceUrl||'')));
const windowStart=new Date(publishedAt.getTime()-(29*24*60*60*1000));
const observedUpdates=eligibleUpdates.filter(item=>{
  const date=new Date(String(item.publishedAt||'').slice(0,10)+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date>=windowStart&&date<=publishedAt;
}).slice(0,40);

function changeType(item){
  const label=(String(item?.label||'')+' '+String(item?.title||'')+' '+String(item?.summary||'')).toLowerCase();
  if(/retire|shut down|sunset|deprecat/.test(label))return'product_retirement';
  if(/security|authentication|mfa|ssh|permission|access|vulnerab/.test(label))return'security_governance';
  if(/price|pricing|plan|free tier|billing|packag/.test(label))return'pricing_packaging';
  if(/mcp|connector|integration|connect|api/.test(label))return'integrations_connectivity';
  if(/agent|ai |copilot|model|automation|workflow/.test(label))return'ai_automation';
  return'product_capability';
}
function buyerImpact(type,item){
  const tool=item?.toolName||'This product';
  if(type==='product_retirement')return tool+' buyers should review migration, continuity and replacement requirements before relying on the affected workflow.';
  if(type==='security_governance')return tool+' buyers should verify whether the new controls change authentication, administration or security requirements for their team.';
  if(type==='pricing_packaging')return tool+' buyers should re-check total cost and plan eligibility because packaging changes can alter the economics of an existing shortlist.';
  if(type==='integrations_connectivity')return tool+' buyers should reassess integration depth and automation architecture if connected workflows are central to the purchase decision.';
  if(type==='ai_automation')return tool+' buyers should verify how the new AI or automation capability changes workflow scope, governance and implementation effort.';
  return tool+' buyers should compare the new capability against the requirements that originally put the product on their shortlist.';
}
function decisionPagesFor(item){
  const slug=String(item?.toolSlug||'');if(!slug)return[];
  const pages=[];
  if(fs.existsSync(path.join(ROOT,'tools',slug+'.html')))pages.push({type:'profile',url:'/tools/'+slug,label:(item.toolName||slug)+' profile'});
  for(const pair of comparisons||[]){
    if(!Array.isArray(pair)||pair.length<2||!pair.includes(slug))continue;
    const comparisonSlug=pair[0]+'-vs-'+pair[1];
    if(fs.existsSync(path.join(ROOT,comparisonSlug+'.html')))pages.push({type:'comparison',url:'/'+comparisonSlug,label:comparisonSlug.replace(/-/g,' ')});
  }
  for(const row of growthPriority?.items||[]){
    if(!Array.isArray(row?.topTools)||!row.topTools.includes(slug))continue;
    const intent=String(row.intent||'');if(!intent)continue;
    if(fs.existsSync(path.join(ROOT,intent+'.html')))pages.push({type:'guide',url:'/'+intent,label:row.title||intent.replace(/-/g,' ')});
  }
  return [...new Map(pages.map(x=>[x.url,x])).values()].slice(0,5);
}

const themeDefs=[
  {id:'agent-workflows',title:'AI agents are becoming reusable team workflows',summary:'Recent product releases point toward reusable skills, shared AI behaviour and repeatable agent workflows instead of isolated prompting.',keywords:['agent','skill','reusable','shared']},
  {id:'connected-software',title:'Business software is opening up to agent connections',summary:'MCP, APIs and related integration layers are making software easier for AI tools to read from and act on with explicit permissions.',keywords:['mcp','integration','connect','connector','api']},
  {id:'workflow-convergence',title:'Analysis and execution are moving closer together',summary:'More software updates are designed to reduce the handoff between understanding what happened and taking the next operational action.',keywords:['action','workflow','automation','execute']}
];

const themes=themeDefs.map(theme=>{
  const matching=observedUpdates.filter(item=>{
    const haystack=(String(item.title||'')+' '+String(item.summary||'')).toLowerCase();
    return theme.keywords.some(keyword=>haystack.includes(keyword));
  });
  return {...theme,evidence:matching.map(item=>item.id),vendors:[...new Set(matching.map(item=>item.toolName).filter(Boolean))]};
}).filter(theme=>theme.evidence.length>0).map(({keywords,...theme})=>theme);

const updates=observedUpdates.map(item=>{
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

const typeMeta={
  ai_automation:{label:'AI and automation',note:'Agent, model and workflow capability changes.'},
  integrations_connectivity:{label:'Integrations and connectivity',note:'APIs, MCP, connectors and connected workflow changes.'},
  security_governance:{label:'Security and governance',note:'Authentication, access, vulnerability and administrative controls.'},
  pricing_packaging:{label:'Pricing and packaging',note:'Plan, billing and commercial packaging changes.'},
  product_capability:{label:'Product capability',note:'Material product changes outside the categories above.'},
  product_retirement:{label:'Retirements and migrations',note:'Shutdowns, deprecations and continuity changes.'}
};

const total=Math.max(updates.length,1);
const trendBreakdown=Object.entries(typeMeta).map(([id,meta])=>{
  const rows=updates.filter(item=>item.changeType===id);
  return{
    id,
    label:meta.label,
    note:meta.note,
    count:rows.length,
    share:Number(((rows.length/total)*100).toFixed(1)),
    vendors:[...new Set(rows.map(item=>item.toolName).filter(Boolean))],
    latestPublishedAt:rows[0]?.publishedAt||null,
    evidence:rows.map(item=>item.id)
  };
}).filter(row=>row.count>0).sort((a,b)=>b.count-a.count||String(a.label).localeCompare(String(b.label)));

const vendorMap=new Map();
for(const item of updates){
  const key=item.toolSlug||item.toolName;
  if(!key)continue;
  const row=vendorMap.get(key)||{toolSlug:item.toolSlug,toolName:item.toolName||item.toolSlug,count:0,latestPublishedAt:item.publishedAt,changeTypes:new Set(),evidence:[]};
  row.count+=1;
  row.latestPublishedAt=String(item.publishedAt||'')>String(row.latestPublishedAt||'')?item.publishedAt:row.latestPublishedAt;
  row.changeTypes.add(item.changeType);
  row.evidence.push(item.id);
  vendorMap.set(key,row);
}
const vendorActivity=[...vendorMap.values()].map(row=>({...row,changeTypes:[...row.changeTypes]})).sort((a,b)=>b.count-a.count||String(b.latestPublishedAt||'').localeCompare(String(a.latestPublishedAt||''))||String(a.toolName).localeCompare(String(b.toolName))).slice(0,8);

const evidenceHighlights=[];
const seenTypes=new Set();
const seenTools=new Set();
for(const item of updates){
  if(evidenceHighlights.length>=4)break;
  if(seenTypes.has(item.changeType)&&seenTools.has(item.toolSlug))continue;
  evidenceHighlights.push(item);
  seenTypes.add(item.changeType);
  seenTools.add(item.toolSlug);
}
for(const item of updates){
  if(evidenceHighlights.length>=4)break;
  if(evidenceHighlights.some(row=>row.id===item.id))continue;
  evidenceHighlights.push(item);
}

const metrics={
  observedUpdates:updates.length,
  vendors:new Set(updates.map(item=>item.toolSlug).filter(Boolean)).size,
  trendCategories:trendBreakdown.length,
  primarySources:new Set(updates.map(item=>item.sourceUrl).filter(Boolean)).size
};

const publicData={
  version:VERSION,
  edition,
  editionLabel,
  publishedAt:publishedAt.toISOString(),
  scope:'ToolScout first-party editorial dataset: a rolling 30 day sample of public software product changes selected for buyer relevance. It is not a measure of global market share.',
  windowStart:windowStart.toISOString(),
  windowEnd:publishedAt.toISOString(),
  updatedThrough:updates[0]?.publishedAt||null,
  sourceMethod:'Primary vendor documentation, changelogs, release notes and official product announcements from the rolling 30 day window. ToolScout aggregates observed changes into trend categories and keeps affiliate status out of selection.',
  primarySourceCount:metrics.primarySources,
  metrics,
  searchVisibility:{source:'Google Search Console',impressions:Number(gscTotals.impressions||0),clicks:Number(gscTotals.clicks||0),ctr:Number(gscTotals.ctr||0),position:Number(gscTotals.position||0)},
  editorialPolicy:feed.editorialPolicy||'Updates are selected for buyer relevance. Affiliate status does not influence inclusion or placement.',
  themes,
  trendBreakdown,
  vendorActivity,
  evidenceHighlights,
  updates,
  pageUrl:PAGE_URL,
  dataUrl:DATA_URL
};

fs.writeFileSync(path.join(ROOT,'software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');

const themeRows=themes.map((theme,index)=>'<article class="themeRow"><span class="themeNo">0'+(index+1)+'</span><div><div class="kicker">'+esc(theme.evidence.length)+' supporting signals · '+esc(theme.vendors.join(', '))+'</div><h3>'+esc(theme.title)+'</h3><p>'+esc(theme.summary)+'</p></div></article>').join('');
const trendRows=trendBreakdown.map(row=>'<article class="trendRow"><div class="trendName"><div class="kicker">'+esc(row.count)+' observed changes · '+esc(row.vendors.length)+' vendors</div><h3>'+esc(row.label)+'</h3><p>'+esc(row.note)+'</p></div><div class="trendSignal"><strong>'+esc(row.share)+'%</strong><span>share of selected changes</span><div class="bar" role="progressbar" aria-label="'+esc(row.label)+' share of selected changes" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+esc(row.share)+'"><i style="width:'+Math.max(4,Math.min(100,row.share))+'%"></i></div></div></article>').join('');
const vendorRows=vendorActivity.map((row,index)=>'<article class="vendorRow"><span class="vendorRank">'+String(index+1).padStart(2,'0')+'</span><div><strong>'+esc(row.toolName)+'</strong><span>'+esc(row.changeTypes.map(type=>typeMeta[type]?.label||type).join(' · '))+'</span></div><div class="vendorCount"><strong>'+esc(row.count)+'</strong><span>observed</span></div></article>').join('');
const evidenceRows=evidenceHighlights.map(item=>'<article class="evidenceRow"><div class="evidenceMeta">'+esc(item.toolName||'Software')+' · '+esc(fmtDate(item.publishedAt))+'</div><h3>'+esc(item.title)+'</h3><p>'+esc(item.buyerImpact)+'</p><div class="evidenceLinks">'+(item.articleUrl?'<a href="'+esc(item.articleUrl)+'">Read ToolScout update →</a>':'')+'<span>Primary source: '+esc(item.sourceName||'official vendor documentation')+'</span></div></article>').join('');

const schema={
  '@context':'https://schema.org',
  '@graph':[
    {
      '@type':'Article',
      headline:'Software Trends: '+editionLabel,
      description:'ToolScout analysis of the patterns behind buyer relevant software product changes.',
      url:PAGE_URL,
      datePublished:publishedAt.toISOString(),
      dateModified:publishedAt.toISOString(),
      author:{'@type':'Organization',name:'ToolScout',url:BASE},
      publisher:{'@type':'Organization',name:'ToolScout',url:BASE},
      about:themes.map(theme=>theme.title)
    },
    {
      '@type':'Dataset',
      name:'ToolScout Software Trends Index - '+editionLabel,
      description:'Structured buyer relevant software change data with trend categories, observed vendor activity, primary sources and editorial evidence.',
      url:DATA_URL,
      dateModified:publishedAt.toISOString(),
      creator:{'@type':'Organization',name:'ToolScout',url:BASE},
      distribution:{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:DATA_URL},
      variableMeasured:['published date','software vendor','change type','signal share','observed vendor activity','buyer impact','primary source']
    }
  ]
};

const css=':root{--graphite:#0B0D0C;--carbon:#141715;--off:#F3F5F1;--soft:#F8F9F6;--muted:#90978F;--muted-dark:#646B64;--lime:#B7FF3C;--line:#DDE2DC;--dark-line:rgba(243,245,241,.10);--fast:140ms;--base:180ms;--ease:cubic-bezier(.2,.7,.2,1);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--graphite);background:var(--off);line-height:1.45}*{box-sizing:border-box}body{margin:0;background:var(--off);color:var(--graphite)}a{color:inherit}.shell{max-width:1440px;margin:auto;padding-left:72px;padding-right:72px}.darkBand{background:var(--graphite);color:var(--off)}nav{height:84px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--dark-line)}.brand{display:inline-flex;align-items:center;gap:11px;color:var(--off);font-size:22px;font-weight:850;letter-spacing:-.045em;text-decoration:none}.brand img{width:24px;height:24px;border-radius:5px}.navlinks{display:flex;align-items:center;gap:25px;font-size:13px}.navlinks a{color:#CDD2CC;text-decoration:none}.navlinks a:hover{color:#fff}a:focus-visible{outline:2px solid var(--lime);outline-offset:4px;border-radius:3px}.skipLink{position:absolute;left:16px;top:-60px;background:var(--lime);color:var(--graphite);padding:10px 13px;border-radius:6px;font-size:12px;font-weight:850;text-decoration:none;z-index:10}.skipLink:focus{top:12px}.hero{display:grid;grid-template-columns:minmax(0,7fr) minmax(260px,5fr);gap:70px;padding:74px 0 62px}.eyebrow,.kicker{font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:850}.hero .eyebrow{color:var(--lime)}.hero h1{font-size:clamp(58px,6.5vw,92px);line-height:.92;letter-spacing:-.067em;margin:16px 0 25px}.hero h1 span{color:var(--lime)}.heroLead{font-size:18px;line-height:1.55;color:#C8CDC7;max-width:510px}.heroAside{align-self:end;border-top:1px solid rgba(243,245,241,.24);padding-top:18px;color:#AEB5AE;font-size:13px;line-height:1.65}.heroAside strong{display:block;color:#fff;font-size:14px;margin-bottom:6px}.heroLinks{display:flex;gap:18px;flex-wrap:wrap;margin-top:18px}.heroLinks a{font-size:10px;font-weight:850;letter-spacing:.08em;text-decoration:none}.heroLinks a:first-child{color:var(--lime)}.metricRail{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--dark-line)}.metric{padding:22px 22px 24px 0;border-right:1px solid var(--dark-line)}.metric+.metric{padding-left:22px}.metric:last-child{border-right:0}.metric strong{display:block;font-size:31px;letter-spacing:-.045em}.metric span{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#8F978F;font-weight:850}.content{padding-top:70px;padding-bottom:90px}.section{margin-bottom:82px}.sectionHead{display:grid;grid-template-columns:5fr 7fr;gap:56px;align-items:end;margin-bottom:26px}.sectionHead h2{font-size:clamp(36px,4.4vw,54px);line-height:1;letter-spacing:-.055em;margin:8px 0 0}.sectionHead p{color:#646B64;line-height:1.65;margin:0;max-width:610px}.trendBoard,.themeList,.vendorList,.evidenceGrid{border-top:1px solid var(--graphite)}.trendRow{display:grid;grid-template-columns:8fr 4fr;gap:44px;padding:25px 0;border-bottom:1px solid var(--line)}.trendName h3,.themeRow h3,.evidenceRow h3{font-size:24px;letter-spacing:-.035em;margin:6px 0 8px}.trendName p,.themeRow p,.evidenceRow p{color:#646B64;margin:0;line-height:1.6;max-width:760px}.trendSignal{align-self:center}.trendSignal strong{display:block;font-size:29px;letter-spacing:-.04em}.trendSignal span{display:block;color:#747B74;font-size:10px;text-transform:uppercase;letter-spacing:.09em;margin-top:2px}.bar{height:3px;background:#DCE1DA;margin-top:13px;overflow:hidden}.bar i{display:block;height:100%;background:var(--graphite)}.themeRow{display:grid;grid-template-columns:80px 1fr;gap:20px;padding:27px 0;border-bottom:1px solid var(--line)}.themeNo{font-size:12px;font-weight:900;color:#7C847C}.vendorList{display:grid;grid-template-columns:1fr 1fr}.vendorRow{display:grid;grid-template-columns:46px 1fr auto;gap:14px;align-items:center;padding:19px 0;border-bottom:1px solid var(--line)}.vendorRow:nth-child(odd){padding-right:28px}.vendorRow:nth-child(even){padding-left:28px;border-left:1px solid var(--line)}.vendorRank{font-size:10px;color:#838B83;font-weight:850}.vendorRow div>strong{display:block;font-size:17px}.vendorRow div>span{display:block;color:#707770;font-size:10px;margin-top:4px;text-transform:uppercase;letter-spacing:.07em}.vendorCount{text-align:right}.vendorCount strong{font-size:22px!important}.evidenceGrid{display:grid;grid-template-columns:1fr 1fr}.evidenceRow{padding:25px 28px 27px 0;border-bottom:1px solid var(--line)}.evidenceRow:nth-child(even){padding-left:28px;border-left:1px solid var(--line)}.evidenceMeta{font-size:9px;text-transform:uppercase;letter-spacing:.1em;font-weight:850;color:#737A73}.evidenceRow h3{font-size:21px}.evidenceLinks{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px}.evidenceLinks a,.textLink{font-size:10px;font-weight:850;letter-spacing:.07em;text-decoration:none}.evidenceLinks a:hover,.textLink:hover{text-decoration:underline}.method{display:grid;grid-template-columns:5fr 7fr;gap:56px;border-top:1px solid var(--graphite);padding-top:43px}.method h2{font-size:36px;line-height:1.05;letter-spacing:-.05em;margin:7px 0}.method p{color:#646B64;line-height:1.7;margin:0 0 14px}.pageEnter{animation:pageEnter var(--base) var(--ease) both}@keyframes pageEnter{from{opacity:.4;transform:translateY(7px)}to{opacity:1;transform:none}}@media(max-width:900px){.shell{padding-left:30px;padding-right:30px}.hero{grid-template-columns:1fr;gap:30px}.heroAside{max-width:620px}.sectionHead,.method{grid-template-columns:1fr;gap:18px}.vendorList,.evidenceGrid{grid-template-columns:1fr}.vendorRow:nth-child(odd),.vendorRow:nth-child(even),.evidenceRow,.evidenceRow:nth-child(even){padding-left:0;padding-right:0;border-left:0}}@media(max-width:700px){.shell{padding-left:20px;padding-right:20px}nav{height:auto;min-height:64px;padding:12px 0 9px;align-items:center;flex-wrap:wrap;row-gap:8px}.brand{font-size:20px}.navlinks{order:3;width:100%;gap:18px;overflow-x:auto;white-space:nowrap;padding-bottom:2px}.navlinks a{font-size:12px}.hero{padding:44px 0 38px}.hero h1{font-size:51px}.heroLead{font-size:16px}.metricRail{grid-template-columns:1fr 1fr}.metric:nth-child(2){border-right:0}.metric:nth-child(n+3){border-top:1px solid var(--dark-line)}.metric:nth-child(3){padding-left:0}.content{padding-top:45px;padding-bottom:68px}.section{margin-bottom:58px}.sectionHead h2{font-size:35px}.trendRow{grid-template-columns:1fr;gap:17px}.themeRow{grid-template-columns:48px 1fr}.trendName h3,.themeRow h3{font-size:21px}.evidenceRow h3{font-size:20px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}';

const html='<!doctype html><html lang="en"><head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Software Trends: '+esc(editionLabel)+' | ToolScout</title><meta name="description" content="ToolScout analysis of the patterns behind buyer relevant software product changes."><link rel="canonical" href="'+PAGE_URL+'"><meta name="robots" content="index,follow"><meta property="og:title" content="Software Trends: '+esc(editionLabel)+' | ToolScout"><meta property="og:description" content="Signals and patterns behind buyer relevant software changes, separated from the chronological news feed."><meta property="og:type" content="article"><meta property="og:url" content="'+PAGE_URL+'"><meta property="og:site_name" content="ToolScout"><script type="application/ld+json">'+JSON.stringify(schema).replaceAll('<','\\u003c')+'</script><style>'+css+'</style></head><body><a class="skipLink" href="#main-content">Skip to main content</a><div class="darkBand"><div class="shell"><main class="pageEnter" id="main-content"><header class="hero"><div><div class="eyebrow">ToolScout software trends · '+esc(editionLabel)+'</div><h1>Signals,<br><span>not headlines.</span></h1><p class="heroLead">A rolling 30 day view of the patterns behind buyer relevant software changes.</p></div><aside class="heroAside"><strong>This is analysis, not another news feed.</strong>What&#39;s New keeps the chronology. The Trends Index groups selected primary source updates into patterns so buyers can see what is changing across software.<div class="heroLinks"><a href="/whats-new">VIEW WHAT&#39;S NEW →</a><a href="/software-trends-index.json">DOWNLOAD DATA →</a></div></aside></header><section class="metricRail" aria-label="Software Trends coverage"><div class="metric"><strong>'+esc(metrics.observedUpdates)+'</strong><span>selected changes</span></div><div class="metric"><strong>'+esc(metrics.vendors)+'</strong><span>vendors observed</span></div><div class="metric"><strong>'+esc(metrics.trendCategories)+'</strong><span>trend categories</span></div><div class="metric"><strong>'+esc(metrics.primarySources)+'</strong><span>primary sources</span></div></section></main></div></div><div class="shell content"><section class="section"><div class="sectionHead"><div><div class="eyebrow">Trend board</div><h2>Where the change is clustering.</h2></div><p>Share of ToolScout selected buyer relevant changes in the rolling 30 day window. This is editorial observation, not market share.</p></div><div class="trendBoard">'+trendRows+'</div></section>'+(themeRows?'<section class="section"><div class="sectionHead"><div><div class="eyebrow">Patterns to watch</div><h2>What the releases suggest.</h2></div><p>Patterns require multiple supporting changes. ToolScout does not promote a theme from one isolated announcement.</p></div><div class="themeList">'+themeRows+'</div></section>':'')+(vendorRows?'<section class="section"><div class="sectionHead"><div><div class="eyebrow">Observed activity</div><h2>Products moving most often.</h2></div><p>Frequency inside this selected editorial sample. It indicates observed product activity, not popularity or market leadership.</p></div><div class="vendorList">'+vendorRows+'</div></section>':'')+'<section class="section"><div class="sectionHead"><div><div class="eyebrow">Evidence sample</div><h2>Enough proof. No duplicate feed.</h2></div><p>Representative changes support the analysis below. The full chronological stream stays in What&#39;s New.</p></div><div class="evidenceGrid">'+evidenceRows+'</div><a class="textLink" href="/whats-new" style="display:inline-block;margin-top:18px">VIEW ALL WHAT&#39;S NEW →</a></section><section class="method"><div><div class="eyebrow">Method</div><h2>Primary sources first.</h2></div><div><p>ToolScout selects material product changes from official vendor documentation and public product updates, classifies the buyer impact, then aggregates the selected evidence into trend categories. Affiliate status never changes inclusion, weighting or prominence.</p><p>The index measures a rolling 30 day editorial sample only. It does not claim global market share, adoption, revenue or user sentiment.</p><a class="textLink" href="/software-trends-index.json">DOWNLOAD THE STRUCTURED DATA →</a></div></section></div></body></html>';

fs.writeFileSync(path.join(ROOT,'software-trends-index.html'),html,'utf8');

const distributionAsset={generatedAt:publishedAt.toISOString(),items:[{id:'software-trends-'+edition,assetType:'editorial_research',title:'Software Trends: '+editionLabel,canonicalUrl:PAGE_URL,dataUrl:DATA_URL,citationText:'ToolScout Software Trends groups buyer relevant primary source software changes into observable patterns and supporting evidence.',sourcePolicy:'Official vendor sources and clearly labelled public product updates. The index reports editorial observations, not market share.'}]};
fs.writeFileSync(path.join(ROOT,'reports','linkable-assets.json'),JSON.stringify(distributionAsset,null,2)+'\n');
console.log(JSON.stringify({edition,themes:themes.length,updates:updates.length,trendCategories:trendBreakdown.length,vendors:vendorActivity.length,page:'software-trends-index.html'}));
