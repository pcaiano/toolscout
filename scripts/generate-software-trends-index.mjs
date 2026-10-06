import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const PAGE_URL=BASE+'/software-trends-index';
const DATA_URL=BASE+'/software-trends-index.json';
const CSV_URL=BASE+'/software-trends-index.csv';
const CHART_URL=BASE+'/software-trends-index-share.svg';
const VERSION=6;
const DAY=24*60*60*1000;

const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const clean=value=>String(value??'').replace(/[\u2013\u2014]/g,'-').replace(/\s+/g,' ').trim();
const monthKey=date=>date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0');
const monthLabel=date=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(date);
const fmtDate=value=>{try{return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(String(value).slice(0,10)+'T12:00:00Z'));}catch{return String(value||'');}};
const csvEscape=value=>{const s=String(value??'');return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};

const feed=read('data/software-updates.json',{updatedAt:new Date().toISOString(),editorialPolicy:'Updates are selected for buyer relevance.',items:[]});
const growthPriority=read('reports/growth-priority.json',{gsc:{siteTotals:{}},items:[]});
const gscTotals=growthPriority?.gsc?.siteTotals||{};
const comparisons=read('data/comparisons.json',[]);
const catalog=read('data/tools.json',[]);
const items=(feed.items||[]).slice().sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
const stamp=new Date(feed.updatedAt||new Date().toISOString());
const publishedAt=Number.isFinite(stamp.getTime())?stamp:new Date();
const edition=monthKey(publishedAt);
const editionLabel=monthLabel(publishedAt);
const windowStart=new Date(publishedAt.getTime()-(29*DAY));
const latestWindowStart=new Date(publishedAt.getTime()-(13*DAY));
const previousWindowStart=new Date(publishedAt.getTime()-(27*DAY));

const eligibleUpdates=items.filter(item=>item?.toolSlug&&/^https:\/\//i.test(String(item?.sourceUrl||'')));
const observedUpdates=eligibleUpdates.filter(item=>{
  const date=new Date(String(item.publishedAt||'').slice(0,10)+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date>=windowStart&&date<=publishedAt;
}).slice(0,60);

function changeType(item){
  const label=(String(item?.label||'')+' '+String(item?.title||'')+' '+String(item?.summary||'')).toLowerCase();
  if(/retire|shut down|sunset|deprecat/.test(label))return'product_retirement';
  if(/security|authentication|mfa|ssh|permission|access|vulnerab|advisory/.test(label))return'security_governance';
  if(/price|pricing|plan|free tier|billing|packag/.test(label))return'pricing_packaging';
  if(/mcp|connector|integration|connect|api/.test(label))return'integrations_connectivity';
  if(/agent|ai |copilot|model|automation|workflow/.test(label))return'ai_automation';
  return'product_capability';
}
function buyerImpact(type,item){
  const tool=item?.toolName||'This product';
  if(type==='product_retirement')return tool+' buyers should review migration, continuity and replacement requirements before relying on the affected workflow.';
  if(type==='security_governance')return tool+' buyers should verify whether the new controls change permissions, administration, auditability or security operations for their team.';
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

const typeMeta={
  ai_automation:{label:'AI and automation',note:'Agent, model and workflow capability changes.'},
  integrations_connectivity:{label:'Integrations and connectivity',note:'APIs, MCP, connectors and connected workflow changes.'},
  security_governance:{label:'Security and governance',note:'Authentication, access, vulnerability and administrative controls.'},
  pricing_packaging:{label:'Pricing and packaging',note:'Plan, billing and commercial packaging changes.'},
  product_capability:{label:'Product capability',note:'Material product changes outside the categories above.'},
  product_retirement:{label:'Retirements and migrations',note:'Shutdowns, deprecations and continuity changes.'}
};

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

const total=Math.max(updates.length,1);
const trendBreakdown=Object.entries(typeMeta).map(([id,meta])=>{
  const rows=updates.filter(item=>item.changeType===id);
  return{
    id,label:meta.label,note:meta.note,count:rows.length,
    share:Number(((rows.length/total)*100).toFixed(1)),
    vendors:[...new Set(rows.map(item=>item.toolName).filter(Boolean))],
    latestPublishedAt:rows[0]?.publishedAt||null,
    evidence:rows.map(item=>item.id)
  };
}).filter(row=>row.count>0).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));

const itemDate=item=>new Date(String(item?.publishedAt||'').slice(0,10)+'T12:00:00Z');
const latest14=updates.filter(item=>{const d=itemDate(item);return Number.isFinite(d.getTime())&&d>=latestWindowStart&&d<=publishedAt;});
const previous14=updates.filter(item=>{const d=itemDate(item);return Number.isFinite(d.getTime())&&d>=previousWindowStart&&d<latestWindowStart;});
const momentum=Object.entries(typeMeta).map(([id,meta])=>{
  const current=latest14.filter(item=>item.changeType===id).length;
  const previous=previous14.filter(item=>item.changeType===id).length;
  const delta=current-previous;
  return{id,label:meta.label,current14:current,previous14:previous,delta,direction:delta>0?'accelerating':delta<0?'cooling':'steady'};
}).filter(row=>row.current14||row.previous14).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||b.current14-a.current14||a.label.localeCompare(b.label));

const vendorMap=new Map();
for(const item of updates){
  const key=item.toolSlug||item.toolName;if(!key)continue;
  const row=vendorMap.get(key)||{toolSlug:item.toolSlug,toolName:item.toolName||item.toolSlug,count:0,latestPublishedAt:item.publishedAt,changeTypes:new Set(),evidence:[]};
  row.count+=1;
  row.latestPublishedAt=String(item.publishedAt||'')>String(row.latestPublishedAt||'')?item.publishedAt:row.latestPublishedAt;
  row.changeTypes.add(item.changeType);row.evidence.push(item.id);vendorMap.set(key,row);
}
const vendorActivity=[...vendorMap.values()].map(row=>({...row,changeTypes:[...row.changeTypes]})).sort((a,b)=>b.count-a.count||String(b.latestPublishedAt||'').localeCompare(String(a.latestPublishedAt||''))||String(a.toolName).localeCompare(String(b.toolName))).slice(0,10);

const themeDefs=[
  {id:'agent-workflows',title:'AI agents are becoming reusable team workflows',summary:'Recent releases point toward reusable skills, shared AI behaviour and repeatable agent workflows instead of isolated prompting.',keywords:['agent','skill','reusable','shared']},
  {id:'connected-software',title:'Business software is opening up to agent connections',summary:'MCP, APIs and related integration layers are making software easier for AI tools to read from and act on with explicit permissions.',keywords:['mcp','integration','connect','connector','api']},
  {id:'workflow-convergence',title:'Analysis and execution are moving closer together',summary:'More product changes reduce the handoff between understanding what happened and taking the next operational action.',keywords:['action','workflow','automation','execute']},
  {id:'governed-ai',title:'Governance is becoming part of the AI product decision',summary:'Security, permissions, auditability and administrative controls increasingly shape whether new AI capability is production-ready.',keywords:['security','permission','audit','governance','access']}
];
const themes=themeDefs.map(theme=>{
  const matching=updates.filter(item=>{
    const haystack=(String(item.title||'')+' '+String(item.summary||'')+' '+String(item.buyerImpact||'')).toLowerCase();
    return theme.keywords.some(keyword=>haystack.includes(keyword));
  });
  return{...theme,evidence:matching.map(item=>item.id),vendors:[...new Set(matching.map(item=>item.toolName).filter(Boolean))]};
}).filter(theme=>theme.evidence.length>=2).map(({keywords,...theme})=>theme);

const evidenceHighlights=[];
const seenTypes=new Set(),seenTools=new Set();
for(const item of updates){
  if(evidenceHighlights.length>=6)break;
  if(seenTypes.has(item.changeType)&&seenTools.has(item.toolSlug))continue;
  evidenceHighlights.push(item);seenTypes.add(item.changeType);seenTools.add(item.toolSlug);
}
for(const item of updates){
  if(evidenceHighlights.length>=6)break;
  if(!evidenceHighlights.some(row=>row.id===item.id))evidenceHighlights.push(item);
}

const aiVerified=catalog.filter(tool=>tool?.aiIntegration?.status==='verified');
const aiOfficialMcp=aiVerified.filter(tool=>tool?.aiIntegration?.mcp==='official');
const aiStrong=aiVerified.filter(tool=>tool?.aiIntegration?.tier==='strong');
const aiConnectivitySnapshot={
  catalogTools:catalog.length,
  verifiedAiInteroperability:aiVerified.length,
  strongAiInteroperability:aiStrong.length,
  officialMcp:aiOfficialMcp.length,
  measuredAs:'Current ToolScout catalog verification snapshot, not a market-wide adoption rate.'
};

const metrics={
  observedUpdates:updates.length,
  vendors:new Set(updates.map(item=>item.toolSlug).filter(Boolean)).size,
  trendCategories:trendBreakdown.length,
  primarySources:new Set(updates.map(item=>item.sourceUrl).filter(Boolean)).size
};

const pressFindings=[];
const topTrend=trendBreakdown[0]||null;
if(topTrend)pressFindings.push({
  id:'largest-signal-cluster',
  headline:topTrend.label+' is the largest change cluster in ToolScout\'s current sample',
  finding:'Within '+updates.length+' selected buyer-relevant changes, '+topTrend.label.toLowerCase()+' accounts for '+topTrend.share+'% ('+topTrend.count+' changes). This describes ToolScout\'s observed editorial sample, not global market share.',
  evidence:topTrend.evidence
});
const strongestMomentum=momentum.find(row=>row.delta!==0)||null;
if(strongestMomentum)pressFindings.push({
  id:'strongest-momentum-shift',
  headline:strongestMomentum.label+' shows the strongest two-week movement in the current sample',
  finding:strongestMomentum.label+' moved from '+strongestMomentum.previous14+' selected changes in the previous 14-day window to '+strongestMomentum.current14+' in the latest 14-day window ('+(strongestMomentum.delta>0?'+':'')+strongestMomentum.delta+').',
  evidence:updates.filter(item=>item.changeType===strongestMomentum.id).map(item=>item.id)
});
if(vendorActivity[0])pressFindings.push({
  id:'most-observed-vendor',
  headline:vendorActivity[0].toolName+' is the most frequently observed vendor in this edition',
  finding:'ToolScout recorded '+vendorActivity[0].count+' selected material changes for '+vendorActivity[0].toolName+' in the rolling window, spanning '+vendorActivity[0].changeTypes.length+' change '+(vendorActivity[0].changeTypes.length===1?'category':'categories')+'. Frequency measures observed release activity in this sample, not product popularity.',
  evidence:vendorActivity[0].evidence
});
if(catalog.length)pressFindings.push({
  id:'ai-interoperability-snapshot',
  headline:'AI interoperability is now a measurable catalog attribute',
  finding:'ToolScout currently verifies AI interoperability for '+aiVerified.length+' of '+catalog.length+' catalog tools; '+aiOfficialMcp.length+' have an official MCP connection recorded. This is a ToolScout catalog verification snapshot, not an industry adoption estimate.',
  evidence:aiOfficialMcp.slice(0,12).map(tool=>tool.slug)
});

const publicData={
  version:VERSION,edition,editionLabel,publishedAt:publishedAt.toISOString(),
  scope:'ToolScout first-party editorial dataset: a rolling 30 day sample of public software product changes selected for buyer relevance. It is not a measure of global market share.',
  windowStart:windowStart.toISOString(),windowEnd:publishedAt.toISOString(),updatedThrough:updates[0]?.publishedAt||null,
  sourceMethod:'Primary vendor documentation, changelogs, release notes and official product announcements from the rolling 30 day window. ToolScout aggregates observed changes into trend categories and keeps affiliate status out of selection.',
  methodology:{
    selection:'Material public software changes are selected for buyer relevance from official vendor sources. Routine marketing, duplicate stories and thin announcements are excluded.',
    classification:'Each selected change is assigned to one buyer-impact category using the content of the official update and ToolScout editorial rules.',
    momentum:'Momentum compares the latest 14-day count with the preceding 14-day count inside the same selected editorial sample.',
    vendorActivity:'Vendor activity counts selected material changes, not popularity, revenue, users, market share or product quality.',
    aiSnapshot:'AI interoperability counts only current ToolScout catalog records with verified AI integration metadata.',
    limitations:'The sample is intentionally editorial and bounded. It should be cited as ToolScout observed software-change data, never as a census of the software market.'
  },
  primarySourceCount:metrics.primarySources,metrics,
  searchVisibility:{source:'Google Search Console',impressions:Number(gscTotals.impressions||0),clicks:Number(gscTotals.clicks||0),ctr:Number(gscTotals.ctr||0),position:Number(gscTotals.position||0)},
  editorialPolicy:feed.editorialPolicy||'Updates are selected for buyer relevance. Affiliate status does not influence inclusion or placement.',
  themes,trendBreakdown,momentum,pressFindings,aiConnectivitySnapshot,vendorActivity,evidenceHighlights,updates,
  pageUrl:PAGE_URL,dataUrl:DATA_URL,csvUrl:CSV_URL,chartUrl:CHART_URL
};

fs.writeFileSync(path.join(ROOT,'software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','software-trends-index.json'),JSON.stringify(publicData,null,2)+'\n');

const csvRows=[['publishedAt','toolName','toolSlug','changeType','label','title','buyerImpact','sourceName','sourceUrl','articleUrl'],
  ...updates.map(item=>[item.publishedAt,item.toolName,item.toolSlug,item.changeType,item.label,item.title,item.buyerImpact,item.sourceName,item.sourceUrl,item.articleUrl])
];
fs.writeFileSync(path.join(ROOT,'software-trends-index.csv'),csvRows.map(row=>row.map(csvEscape).join(',')).join('\n')+'\n');

const chartRows=trendBreakdown.slice(0,6);
const chartWidth=1200,chartHeight=150+chartRows.length*92;
const chartSvg='<svg xmlns="http://www.w3.org/2000/svg" width="'+chartWidth+'" height="'+chartHeight+'" viewBox="0 0 '+chartWidth+' '+chartHeight+'" role="img" aria-labelledby="title desc"><title id="title">ToolScout Software Trends Index signal share - '+esc(editionLabel)+'</title><desc id="desc">Share of selected buyer-relevant software changes by ToolScout trend category. This is an editorial sample, not market share.</desc><rect width="100%" height="100%" fill="#F3F5F1"/><text x="54" y="54" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700" fill="#0B0D0C">ToolScout Software Trends Index · '+esc(editionLabel)+'</text><text x="54" y="84" font-family="Arial,Helvetica,sans-serif" font-size="15" fill="#646B64">Share of selected buyer-relevant changes · rolling 30 days · not market share</text>'+chartRows.map((row,index)=>{const y=138+index*92,w=Math.max(8,Math.round(row.share*8.2));return '<text x="54" y="'+y+'" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#0B0D0C">'+esc(row.label)+'</text><rect x="430" y="'+(y-22)+'" width="680" height="26" rx="4" fill="#DDE2DC"/><rect x="430" y="'+(y-22)+'" width="'+Math.min(680,w)+'" height="26" rx="4" fill="#0B0D0C"/><text x="1125" y="'+y+'" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" text-anchor="end" fill="#0B0D0C">'+row.share+'%</text>';}).join('')+'<text x="54" y="'+(chartHeight-24)+'" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="#646B64">Source: ToolScout first-party editorial dataset · '+esc(fmtDate(publicData.windowStart))+' to '+esc(fmtDate(publicData.windowEnd))+'</text></svg>';
fs.writeFileSync(path.join(ROOT,'software-trends-index-share.svg'),chartSvg,'utf8');

const themeRows=themes.map((theme,index)=>'<article class="themeRow"><span class="themeNo">'+String(index+1).padStart(2,'0')+'</span><div><div class="kicker">'+esc(theme.evidence.length)+' supporting signals · '+esc(theme.vendors.join(', '))+'</div><h3>'+esc(theme.title)+'</h3><p>'+esc(theme.summary)+'</p></div></article>').join('');
const trendRows=trendBreakdown.map(row=>'<article class="trendRow"><div class="trendName"><div class="kicker">'+esc(row.count)+' observed changes · '+esc(row.vendors.length)+' vendors</div><h3>'+esc(row.label)+'</h3><p>'+esc(row.note)+'</p></div><div class="trendSignal"><strong>'+esc(row.share)+'%</strong><span>share of selected changes</span><div class="bar" role="progressbar" aria-label="'+esc(row.label)+' share of selected changes" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+esc(row.share)+'"><i style="width:'+Math.max(4,Math.min(100,row.share))+'%"></i></div></div></article>').join('');
const pressRows=pressFindings.map((row,index)=>'<article class="findingRow"><span class="themeNo">'+String(index+1).padStart(2,'0')+'</span><div><div class="kicker">Press-ready finding · ToolScout observed data</div><h3>'+esc(row.headline)+'</h3><p>'+esc(row.finding)+'</p></div></article>').join('');
const momentumRows=momentum.map(row=>'<article class="momentumRow"><div><div class="kicker">'+esc(row.direction)+' · latest 14 days vs previous 14 days</div><h3>'+esc(row.label)+'</h3></div><div class="momentumNumbers"><strong>'+esc(row.current14)+'</strong><span>latest</span><strong>'+esc(row.previous14)+'</strong><span>previous</span><b>'+esc((row.delta>0?'+':'')+row.delta)+'</b></div></article>').join('');
const vendorRows=vendorActivity.map((row,index)=>'<article class="vendorRow"><span class="vendorRank">'+String(index+1).padStart(2,'0')+'</span><div><strong>'+esc(row.toolName)+'</strong><span>'+esc(row.changeTypes.map(type=>typeMeta[type]?.label||type).join(' · '))+'</span></div><div class="vendorCount"><strong>'+esc(row.count)+'</strong><span>observed</span></div></article>').join('');
const evidenceRows=evidenceHighlights.map(item=>'<article class="evidenceRow"><div class="evidenceMeta">'+esc(item.toolName||'Software')+' · '+esc(fmtDate(item.publishedAt))+'</div><h3>'+esc(item.title)+'</h3><p>'+esc(item.buyerImpact)+'</p><div class="evidenceLinks">'+(item.articleUrl?'<a href="'+esc(item.articleUrl)+'">Read ToolScout update →</a>':'')+'<span>Primary source: '+esc(item.sourceName||'official vendor documentation')+'</span></div></article>').join('');

const citations=[...new Set(updates.map(item=>item.sourceUrl).filter(Boolean))];
const schema={
  '@context':'https://schema.org',
  '@graph':[
    {'@type':'Article',headline:'Software Trends: '+editionLabel,description:'ToolScout analysis of the patterns behind buyer relevant software product changes.',url:PAGE_URL,datePublished:publishedAt.toISOString(),dateModified:publishedAt.toISOString(),author:{'@type':'Organization',name:'ToolScout',url:BASE},publisher:{'@type':'Organization',name:'ToolScout',url:BASE},about:themes.map(theme=>theme.title),citation:citations},
    {'@type':'Dataset',name:'ToolScout Software Trends Index - '+editionLabel,description:'Structured buyer relevant software change data with trend categories, two-window momentum, observed vendor activity, primary sources and editorial evidence.',url:DATA_URL,dateModified:publishedAt.toISOString(),creator:{'@type':'Organization',name:'ToolScout',url:BASE},temporalCoverage:publicData.windowStart+'/'+publicData.windowEnd,measurementTechnique:'ToolScout editorial selection of material official-vendor product changes, buyer-impact classification, and two-window 14-day momentum comparison.',citation:citations,distribution:[{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:DATA_URL},{'@type':'DataDownload',encodingFormat:'text/csv',contentUrl:CSV_URL},{'@type':'DataDownload',encodingFormat:'image/svg+xml',contentUrl:CHART_URL}],variableMeasured:['published date','software vendor','change type','signal share','14-day momentum','observed vendor activity','buyer impact','primary source','verified AI interoperability']}
  ]
};

const css=`
:root{--graphite:#0B0D0C;--off:#F3F5F1;--soft:#F8F9F6;--lime:#B7FF3C;--line:#DDE2DC;--dark-line:rgba(243,245,241,.10);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--graphite);background:var(--off);line-height:1.45}*{box-sizing:border-box}body{margin:0;background:var(--off);color:var(--graphite)}a{color:inherit}.shell{max-width:1440px;margin:auto;padding-left:72px;padding-right:72px}.darkBand{background:var(--graphite);color:var(--off)}.skipLink{position:absolute;left:16px;top:-60px;background:var(--lime);color:var(--graphite);padding:10px 13px;border-radius:6px;font-size:12px;font-weight:850;text-decoration:none;z-index:10}.skipLink:focus{top:12px}.hero{display:grid;grid-template-columns:minmax(0,7fr) minmax(260px,5fr);gap:70px;padding:74px 0 62px}.eyebrow,.kicker{font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:850}.hero .eyebrow{color:var(--lime)}.hero h1{font-size:clamp(58px,6.5vw,92px);line-height:.92;letter-spacing:-.067em;margin:16px 0 25px}.hero h1 span{color:var(--lime)}.heroLead{font-size:18px;line-height:1.55;color:#C8CDC7;max-width:560px}.heroAside{align-self:end;border-top:1px solid rgba(243,245,241,.24);padding-top:18px;color:#AEB5AE;font-size:13px;line-height:1.65}.heroAside strong{display:block;color:#fff;font-size:14px;margin-bottom:6px}.heroLinks{display:flex;gap:18px;flex-wrap:wrap;margin-top:18px}.heroLinks a,.textLink{font-size:10px;font-weight:850;letter-spacing:.07em;text-decoration:none}.heroLinks a:first-child{color:var(--lime)}.metricRail{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--dark-line)}.metric{padding:22px 22px 24px 0;border-right:1px solid var(--dark-line)}.metric+.metric{padding-left:22px}.metric:last-child{border-right:0}.metric strong{display:block;font-size:31px;letter-spacing:-.045em}.metric span{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#8F978F;font-weight:850}.content{padding-top:70px;padding-bottom:90px}.section{margin-bottom:82px}.sectionHead{display:grid;grid-template-columns:5fr 7fr;gap:56px;align-items:end;margin-bottom:26px}.sectionHead h2{font-size:clamp(36px,4.4vw,54px);line-height:1;letter-spacing:-.055em;margin:8px 0 0}.sectionHead p,.method p,.findingRow p,.trendName p,.themeRow p,.evidenceRow p,.resourceCard p,.limits p{color:#646B64;line-height:1.65}.trendBoard,.themeList,.vendorList,.evidenceGrid,.findingList,.momentumList{border-top:1px solid var(--graphite)}.trendRow{display:grid;grid-template-columns:8fr 4fr;gap:44px;padding:25px 0;border-bottom:1px solid var(--line)}.trendName h3,.themeRow h3,.evidenceRow h3,.findingRow h3{font-size:24px;letter-spacing:-.035em;margin:6px 0 8px}.trendName p,.themeRow p,.evidenceRow p,.findingRow p{margin:0;max-width:820px}.trendSignal{align-self:center}.trendSignal strong{display:block;font-size:29px}.trendSignal span{display:block;color:#747B74;font-size:10px;text-transform:uppercase;letter-spacing:.09em}.bar{height:3px;background:#DCE1DA;margin-top:13px}.bar i{display:block;height:100%;background:var(--graphite)}.themeRow,.findingRow{display:grid;grid-template-columns:80px 1fr;gap:20px;padding:27px 0;border-bottom:1px solid var(--line)}.themeNo{font-size:12px;font-weight:900;color:#7C847C}.momentumRow{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;padding:22px 0;border-bottom:1px solid var(--line)}.momentumRow h3{font-size:21px;margin:5px 0}.momentumNumbers{display:grid;grid-template-columns:auto auto auto auto auto;gap:8px;align-items:baseline}.momentumNumbers strong{font-size:22px}.momentumNumbers span{font-size:9px;text-transform:uppercase;color:#737A73}.momentumNumbers b{font-size:15px;margin-left:10px}.aiSnapshot{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--graphite);border-bottom:1px solid var(--line)}.aiMetric{padding:22px;border-right:1px solid var(--line)}.aiMetric:first-child{padding-left:0}.aiMetric:last-child{border-right:0}.aiMetric strong{display:block;font-size:28px}.aiMetric span{font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:#737A73}.vendorList{display:grid;grid-template-columns:1fr 1fr}.vendorRow{display:grid;grid-template-columns:46px 1fr auto;gap:14px;align-items:center;padding:19px 0;border-bottom:1px solid var(--line)}.vendorRow:nth-child(odd){padding-right:28px}.vendorRow:nth-child(even){padding-left:28px;border-left:1px solid var(--line)}.vendorRank{font-size:10px;color:#838B83;font-weight:850}.vendorRow div>strong{display:block;font-size:17px}.vendorRow div>span{display:block;color:#707770;font-size:10px;margin-top:4px;text-transform:uppercase;letter-spacing:.07em}.vendorCount{text-align:right}.vendorCount strong{font-size:22px!important}.evidenceGrid{display:grid;grid-template-columns:1fr 1fr}.evidenceRow{padding:25px 28px 27px 0;border-bottom:1px solid var(--line)}.evidenceRow:nth-child(even){padding-left:28px;border-left:1px solid var(--line)}.evidenceMeta{font-size:9px;text-transform:uppercase;letter-spacing:.1em;font-weight:850;color:#737A73}.evidenceLinks{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px}.citationBox,.limits{border:1px solid var(--line);padding:20px;margin-top:18px;background:#fff}.citationBox code{white-space:normal;word-break:break-word;font-size:12px}.resourceGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.resourceCard{border:1px solid var(--line);padding:20px;border-radius:14px;background:var(--soft)}.resourceCard h3{font-size:18px;margin:0 0 8px}.resourceCard p{font-size:13px}.resourceCard a{font-size:11px;font-weight:850;text-decoration:none}.method{display:grid;grid-template-columns:5fr 7fr;gap:56px;border-top:1px solid var(--graphite);padding-top:43px}.method h2{font-size:36px;line-height:1.05;letter-spacing:-.05em;margin:7px 0}.method p{margin:0 0 14px}@media(max-width:900px){.shell{padding-left:30px;padding-right:30px}.hero{grid-template-columns:1fr;gap:30px}.sectionHead,.method{grid-template-columns:1fr;gap:18px}.vendorList,.evidenceGrid{grid-template-columns:1fr}.vendorRow:nth-child(odd),.vendorRow:nth-child(even),.evidenceRow,.evidenceRow:nth-child(even){padding-left:0;padding-right:0;border-left:0}}@media(max-width:700px){.shell{padding-left:20px;padding-right:20px}.hero{padding:44px 0 38px}.hero h1{font-size:51px}.metricRail{grid-template-columns:1fr 1fr}.metric:nth-child(2){border-right:0}.content{padding-top:45px}.section{margin-bottom:58px}.trendRow,.momentumRow{grid-template-columns:1fr}.themeRow,.findingRow{grid-template-columns:48px 1fr}.resourceGrid,.aiSnapshot{grid-template-columns:1fr}.aiMetric{border-right:0;border-bottom:1px solid var(--line);padding-left:0}}
`;

const html='<!doctype html><html lang="en"><head><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Software Trends Index: '+esc(editionLabel)+' | ToolScout</title><meta name="description" content="ToolScout first-party software trend data, press-ready findings, 14-day momentum and primary-source evidence for buyer-relevant product change."><link rel="canonical" href="'+PAGE_URL+'"><meta name="robots" content="index,follow"><meta property="og:title" content="ToolScout Software Trends Index: '+esc(editionLabel)+'"><meta property="og:description" content="A proprietary rolling dataset of buyer-relevant software change with downloadable data and reusable research assets."><meta property="og:type" content="article"><meta property="og:url" content="'+PAGE_URL+'"><meta property="og:site_name" content="ToolScout"><script type="application/ld+json">'+JSON.stringify(schema).replaceAll('<','\\u003c')+'</script><style>'+css+'</style></head><body><a class="skipLink" href="#main-content">Skip to main content</a><div class="darkBand"><div class="shell"><main id="main-content"><header class="hero"><div><div class="eyebrow">ToolScout proprietary research · '+esc(editionLabel)+'</div><h1>Software change,<br><span>measured.</span></h1><p class="heroLead">A rolling 30-day first-party editorial dataset showing where buyer-relevant software change is clustering, what is accelerating and which signals deserve a closer look.</p></div><aside class="heroAside"><strong>Built to be cited, not just browsed.</strong>The Index separates chronology from analysis, retains primary-source evidence in the public dataset and makes every finding explicit about its limits.<div class="heroLinks"><a href="/software-trends-index.json">JSON DATA →</a><a href="/software-trends-index.csv">CSV →</a><a href="/software-trends-index-share.svg">CHART →</a></div></aside></header><section class="metricRail"><div class="metric"><strong>'+esc(metrics.observedUpdates)+'</strong><span>selected changes</span></div><div class="metric"><strong>'+esc(metrics.vendors)+'</strong><span>vendors observed</span></div><div class="metric"><strong>'+esc(metrics.trendCategories)+'</strong><span>trend categories</span></div><div class="metric"><strong>'+esc(metrics.primarySources)+'</strong><span>primary sources</span></div></section></main></div></div><div class="shell content"><section class="section"><div class="sectionHead"><div><div class="eyebrow">Press findings</div><h2>Four findings worth citing.</h2></div><p>Each statement is generated from the current ToolScout dataset and carries its scope in the wording. These are observations from a selected editorial sample, never claims about the global software market.</p></div><div class="findingList">'+pressRows+'</div><div class="citationBox"><strong>Suggested citation</strong><br><code>ToolScout Software Trends Index, '+esc(editionLabel)+', rolling 30-day first-party editorial dataset, '+esc(metrics.observedUpdates)+' selected changes across '+esc(metrics.vendors)+' observed vendors.</code></div></section><section class="section"><div class="sectionHead"><div><div class="eyebrow">Trend board</div><h2>Where the change is clustering.</h2></div><p>Share of ToolScout selected buyer-relevant changes in the rolling 30-day window. It describes our observed data only and should not be read as market share.</p></div><div class="trendBoard">'+trendRows+'</div></section>'+(momentumRows?'<section class="section"><div class="sectionHead"><div><div class="eyebrow">Momentum</div><h2>What moved in the latest two weeks.</h2></div><p>Latest 14 days compared with the preceding 14 days under the same selection rules. A positive delta means ToolScout selected more material changes in that category, not that adoption accelerated.</p></div><div class="momentumList">'+momentumRows+'</div></section>':'')+(themeRows?'<section class="section"><div class="sectionHead"><div><div class="eyebrow">Patterns to watch</div><h2>What the releases suggest.</h2></div><p>Patterns require multiple supporting changes. ToolScout does not promote a theme from one isolated announcement.</p></div><div class="themeList">'+themeRows+'</div></section>':'')+'<section class="section"><div class="sectionHead"><div><div class="eyebrow">AI interoperability snapshot</div><h2>AI connectivity is becoming comparable.</h2></div><p>This is a current ToolScout catalog verification snapshot. It distinguishes verified integrations from unknown status and does not convert vendor marketing into assumed adoption.</p></div><div class="aiSnapshot"><div class="aiMetric"><strong>'+esc(aiConnectivitySnapshot.catalogTools)+'</strong><span>catalog tools</span></div><div class="aiMetric"><strong>'+esc(aiConnectivitySnapshot.verifiedAiInteroperability)+'</strong><span>AI verified</span></div><div class="aiMetric"><strong>'+esc(aiConnectivitySnapshot.strongAiInteroperability)+'</strong><span>strong AI tier</span></div><div class="aiMetric"><strong>'+esc(aiConnectivitySnapshot.officialMcp)+'</strong><span>official MCP</span></div></div></section>'+(vendorRows?'<section class="section"><div class="sectionHead"><div><div class="eyebrow">Observed activity</div><h2>Products moving most often.</h2></div><p>Frequency inside this selected editorial sample. It indicates observed product activity, not popularity, quality or market leadership.</p></div><div class="vendorList">'+vendorRows+'</div></section>':'')+'<section class="section"><div class="sectionHead"><div><div class="eyebrow">Evidence sample</div><h2>The releases behind the signals.</h2></div><p>Representative changes show the evidence beneath the aggregate findings. The full chronological stream remains in What&#39;s New.</p></div><div class="evidenceGrid">'+evidenceRows+'</div><a class="textLink" href="/whats-new" style="display:inline-block;margin-top:18px">VIEW ALL WHAT&#39;S NEW →</a></section><section class="section"><div class="sectionHead"><div><div class="eyebrow">Publisher resources</div><h2>Reuse the evidence, not just the headline.</h2></div><p>Journalists, analysts and publishers can download the current dataset, reuse the chart with attribution, or pair the Index with ToolScout&#39;s free Finder widget.</p></div><div class="resourceGrid"><article class="resourceCard"><h3>Structured dataset</h3><p>Methodology, findings, momentum, evidence IDs and primary-source URLs.</p><a href="/software-trends-index.json">DOWNLOAD JSON →</a></article><article class="resourceCard"><h3>Analysis-ready CSV</h3><p>One row per selected material software change, including classification and buyer impact.</p><a href="/software-trends-index.csv">DOWNLOAD CSV →</a></article><article class="resourceCard"><h3>Reusable chart</h3><p>SVG of category signal share for articles, reports and newsletters with ToolScout attribution.</p><a href="/software-trends-index-share.svg">OPEN SVG →</a></article></div><p style="margin-top:18px"><a class="textLink" href="/distribution/publisher-kit">PUBLISHER KIT AND FINDER EMBEDS →</a></p></section><section class="method"><div><div class="eyebrow">Method</div><h2>Primary sources first.</h2></div><div><p>ToolScout monitors official vendor documentation, changelogs, release notes and public product announcements, then selects changes that can alter a software buying decision. Routine promotion, duplicate stories and thin announcements are excluded.</p><p>Every selected change is classified by buyer impact. The 30-day trend board counts those observations. The momentum view compares the latest 14 days with the preceding 14 days using the same selection rules, so the comparison is internal to ToolScout&#39;s dataset.</p><p>Vendor activity is simply the count of selected material changes associated with a vendor. AI interoperability is a separate snapshot of ToolScout&#39;s verified catalog metadata. Neither measure is a popularity score, market-share estimate, adoption estimate or proxy for revenue.</p><p>Affiliate relationships do not affect selection, classification, weighting or prominence. Source URLs are retained in the downloadable dataset and in structured citations so journalists and answer engines can trace the evidence without turning this page into a directory of non-commercial outbound links.</p><div class="limits"><h3>Limits of the Index</h3><p>The Index is a bounded first-party editorial dataset. Coverage depends on the official sources ToolScout monitors and on the buyer-relevance threshold. Findings should be cited as ToolScout observations for the stated window, not generalized to the entire software market.</p></div><p style="margin-top:18px">Edition verified '+esc(fmtDate(publishedAt.toISOString()))+'. <a class="textLink" href="/methodology">READ TOOLSCOUT METHODOLOGY →</a></p></div></section></div></body></html>';

fs.writeFileSync(path.join(ROOT,'software-trends-index.html'),html,'utf8');

const distributionAsset={
  generatedAt:publishedAt.toISOString(),
  items:[{
    id:'software-trends-'+edition,
    assetType:'original_research',
    title:'ToolScout Software Trends Index: '+editionLabel,
    url:PAGE_URL,
    dataUrl:DATA_URL,
    csvUrl:CSV_URL,
    chartUrl:CHART_URL,
    claims:pressFindings.map(row=>row.finding),
    distributionPolicy:'Cite findings only with the ToolScout observed-data scope and edition window. Do not restate them as global market-share or adoption claims.',
    citationText:'ToolScout Software Trends Index, '+editionLabel+', rolling 30-day first-party editorial dataset.',
    sourcePolicy:'Official vendor sources and clearly labelled public product updates. The index reports editorial observations, not market share.'
  }]
};
fs.writeFileSync(path.join(ROOT,'reports','linkable-assets.json'),JSON.stringify(distributionAsset,null,2)+'\n');
console.log(JSON.stringify({edition,themes:themes.length,updates:updates.length,trendCategories:trendBreakdown.length,vendors:vendorActivity.length,findings:pressFindings.length,momentum:momentum.length,aiVerified:aiVerified.length,officialMcp:aiOfficialMcp.length,page:'software-trends-index.html',csv:'software-trends-index.csv',chart:'software-trends-index-share.svg'}));
