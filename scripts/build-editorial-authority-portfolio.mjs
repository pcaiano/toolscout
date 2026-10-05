import fs from 'node:fs';
import path from 'node:path';
import {editorialAuthorityForPath,authorityGapPriority} from './editorial-authority-model.mjs';

const ROOT=process.cwd();
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const gsc=read('data/gsc-search-reality.json',{opportunities:[],searchPerformance:{window28d:{}}});
const updates=read('data/software-updates.json',{items:[]}).items||[];
const config=read('data/organic-growth-engine.json',{editorialAuthority:{}});
const policy=config.editorialAuthority||{};
const hardFloor=Number(policy.hardFloorScore||90);
const target=Number(policy.targetScore||95);
const excellence=Number(policy.excellenceScore||98);
const minImpressions=Number(policy.minimumObservedImpressionsForAuthorityIntervention||20);
const weight=Number(policy.authorityGapPriorityWeight||0.2);
const maxItems=Number(policy.priorityPortfolioSize||30);

function normalizePage(value){
  let raw=String(value||'').trim();
  if(!raw)return'';
  try{if(/^https?:\/\//i.test(raw))raw=new URL(raw).pathname||'/';}catch{return''}
  raw=raw.split('?')[0].split('#')[0]||'/';
  if(/\/index\.html$/i.test(raw))raw=raw.replace(/\/index\.html$/i,'/')||'/';
  else if(/\.html$/i.test(raw))raw=raw.replace(/\.html$/i,'');
  if(!raw.startsWith('/'))raw='/'+raw;
  if(raw.length>1)raw=raw.replace(/\/+$/,'');
  return raw||'/';
}
function sitemapPages(){
  const file=path.join(ROOT,'sitemap.xml');
  if(!fs.existsSync(file))return[];
  const xml=fs.readFileSync(file,'utf8');
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map(m=>normalizePage(m[1]))
    .filter(Boolean);
}
function qualityBand(score){
  const n=Number(score||0);
  if(n>=excellence)return'excellent';
  if(n>=target)return'healthy';
  if(n>=hardFloor)return'improvement';
  return'priority_remediation';
}

const opportunityByPage=new Map();
for(const opp of gsc.opportunities||[]){
  const page=normalizePage(opp.page);
  if(!page)continue;
  const current=opportunityByPage.get(page);
  if(!current||Number(opp.impressions||0)>Number(current.impressions||0))opportunityByPage.set(page,opp);
}
const sitemapSurface=sitemapPages();
const sitemapSet=new Set(sitemapSurface);
const surface=[...new Set([...sitemapSurface,...opportunityByPage.keys()])];
const rows=[];
for(const page of surface){
  const opp=opportunityByPage.get(page)||{};
  const authority=editorialAuthorityForPath(ROOT,page,updates);
  const impressions=Number(opp.impressions||0),clicks=Number(opp.clicks||0),position=Number(opp.position||0);
  const priority=authorityGapPriority({impressions,position,authorityScore:authority.score,targetScore:target,hardFloorScore:hardFloor,weight});
  const band=qualityBand(authority.score);
  let action='observe';
  let diagnosis='quality_healthy_no_strong_search_trigger';
  if(!authority.exists){action='repair_public_surface';diagnosis='indexable_surface_missing_public_file';}
  else if(authority.score<hardFloor){action='remediate_editorial_quality';diagnosis='below_editorial_hard_floor';}
  else if(authority.score<target){action='close_editorial_gap';diagnosis='below_editorial_target';}
  else if(authority.pageType==='news'&&clicks>0){action='convert_news_to_decision_flywheel';diagnosis='quality_healthy_news_with_observed_clicks';}
  else if(impressions>=minImpressions&&position>20){action='diagnose_search_fit_and_offpage_authority';diagnosis='on_page_quality_healthy_search_performance_problem';}
  else if(position>10&&position<=40){action='strengthen_internal_links_and_distribution';diagnosis='on_page_quality_healthy_near_first_page';}
  else if(position>0&&position<=10){action='protect_and_amplify';diagnosis='quality_healthy_first_page';}
  rows.push({
    page,
    pageType:authority.pageType,
    exists:authority.exists,
    indexedSurface:sitemapSet.has(page),
    observedInGsc:opportunityByPage.has(page),
    editorialAuthorityScore:authority.score,
    hardFloorScore:hardFloor,
    targetScore:target,
    excellenceScore:excellence,
    qualityBand:band,
    gapToTarget:Number(Math.max(0,target-Number(authority.score||0)).toFixed(2)),
    primarySourceLinks:authority.sourceLinks||0,
    wordCount:authority.wordCount||0,
    hasAnalysis:Boolean(authority.hasAnalysis),
    hasTradeoffs:Boolean(authority.hasTradeoffs),
    hasVerification:Boolean(authority.hasVerification),
    verificationDate:authority.verificationDate||null,
    hasRecentVerification:Boolean(authority.hasRecentVerification),
    hasFreshUpdate:Boolean(authority.hasFreshUpdate),
    impressions,
    clicks,
    position,
    searchOpportunityKind:opp.kind||null,
    priorityScore:priority,
    diagnosis,
    action
  });
}
const actionRank={repair_public_surface:9,remediate_editorial_quality:8,close_editorial_gap:7,diagnose_search_fit_and_offpage_authority:6,strengthen_internal_links_and_distribution:5,convert_news_to_decision_flywheel:4,protect_and_amplify:3,observe:1};
rows.sort((a,b)=>(actionRank[b.action]||0)-(actionRank[a.action]||0)||b.priorityScore-a.priorityScore||b.impressions-a.impressions||a.editorialAuthorityScore-b.editorialAuthorityScore);
const existingRows=rows.filter(x=>x.exists);
const portfolioRows=rows.filter(x=>x.action!=='observe').slice(0,maxItems);
const averageScore=existingRows.length?Number((existingRows.reduce((sum,row)=>sum+Number(row.editorialAuthorityScore||0),0)/existingRows.length).toFixed(1)):null;
const report={
  generatedAt:new Date().toISOString(),
  model:'toolscout-editorial-authority-v2',
  objective:'Keep the full indexable ToolScout surface at a minimum editorial floor of 90, target 95 by default, and use Search Console demand to prioritize work. Once on-page quality is healthy, diagnose search fit, internal authority and off-page authority instead of adding content indefinitely.',
  hardFloorScore:hardFloor,
  targetScore:target,
  excellenceScore:excellence,
  priorityPortfolioSize:maxItems,
  surfacePolicy:'All sitemap-indexable pages are audited. Google Search Console demand controls priority, not eligibility for quality.',
  preservationRule:'No URL, canonical, indexed page or existing backlink is removed by this audit.',
  summary:{
    evaluated:rows.length,
    existing:existingRows.length,
    averageScore,
    belowHardFloor:existingRows.filter(x=>x.editorialAuthorityScore<hardFloor).length,
    improvement:existingRows.filter(x=>x.editorialAuthorityScore>=hardFloor&&x.editorialAuthorityScore<target).length,
    belowTarget:existingRows.filter(x=>x.editorialAuthorityScore<target).length,
    healthy95Plus:existingRows.filter(x=>x.editorialAuthorityScore>=target).length,
    excellent98Plus:existingRows.filter(x=>x.editorialAuthorityScore>=excellence).length,
    missingPublicSurface:rows.filter(x=>!x.exists).length,
    searchFitDiagnosis:rows.filter(x=>x.action==='diagnose_search_fit_and_offpage_authority').length,
    protectAndAmplify:rows.filter(x=>x.action==='protect_and_amplify').length,
    newsFlywheel:rows.filter(x=>x.action==='convert_news_to_decision_flywheel').length
  },
  portfolio:portfolioRows,
  all:rows
};
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','editorial-authority-portfolio.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:true,...report.summary,targetScore:target,hardFloorScore:hardFloor,excellenceScore:excellence,portfolio:portfolioRows.map(x=>({page:x.page,score:x.editorialAuthorityScore,band:x.qualityBand,impressions:x.impressions,position:x.position,action:x.action}))},null,2));
