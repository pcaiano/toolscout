import fs from 'node:fs';
import path from 'node:path';
import {editorialAuthorityForPath,authorityGapPriority} from './editorial-authority-model.mjs';

const ROOT=process.cwd();
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback;}};
const gsc=read('data/gsc-search-reality.json',{opportunities:[],searchPerformance:{window28d:{}}});
const updates=read('data/software-updates.json',{items:[]}).items||[];
const config=read('data/organic-growth-engine.json',{editorialAuthority:{}});
const policy=config.editorialAuthority||{};
const target=Number(policy.targetScore||70);
const minImpressions=Number(policy.minimumObservedImpressionsForAuthorityIntervention||20);
const weight=Number(policy.authorityGapPriorityWeight||0.15);
const maxItems=Number(policy.priorityPortfolioSize||15);

const seen=new Set(),rows=[];
for(const opp of gsc.opportunities||[]){
  const page=String(opp.page||'');
  if(!page||seen.has(page))continue;
  seen.add(page);
  const authority=editorialAuthorityForPath(ROOT,page,updates);
  const impressions=Number(opp.impressions||0),clicks=Number(opp.clicks||0),position=Number(opp.position||0);
  const priority=authorityGapPriority({impressions,position,authorityScore:authority.score,weight});
  let action='observe';
  if(position>0&&position<=10&&authority.score>=target)action='protect_and_amplify';
  else if(authority.pageType==='news'&&clicks>0)action='convert_news_to_decision_flywheel';
  else if(impressions>=minImpressions&&authority.score<target)action='deepen_editorial_evidence';
  else if(position>0&&position<=40)action='authority_and_internal_links';
  rows.push({
    page,
    pageType:authority.pageType,
    exists:authority.exists,
    editorialAuthorityScore:authority.score,
    targetScore:target,
    primarySourceLinks:authority.sourceLinks||0,
    wordCount:authority.wordCount||0,
    hasAnalysis:Boolean(authority.hasAnalysis),
    hasTradeoffs:Boolean(authority.hasTradeoffs),
    hasVerification:Boolean(authority.hasVerification),
    hasFreshUpdate:Boolean(authority.hasFreshUpdate),
    impressions,
    clicks,
    position,
    searchOpportunityKind:opp.kind||null,
    priorityScore:priority,
    action
  });
}
rows.sort((a,b)=>{
  const rank={convert_news_to_decision_flywheel:5,deepen_editorial_evidence:4,authority_and_internal_links:3,protect_and_amplify:2,observe:1};
  return (rank[b.action]||0)-(rank[a.action]||0)||b.priorityScore-a.priorityScore||b.impressions-a.impressions;
});
const portfolioRows=rows.filter(x=>x.exists&&x.action!=='observe').slice(0,maxItems);
const report={
  generatedAt:new Date().toISOString(),
  model:'toolscout-editorial-authority-v1',
  objective:'Concentrate work on observed-demand pages where stronger primary-source evidence, buyer trade-offs and information gain can improve authority.',
  targetScore:target,
  priorityPortfolioSize:maxItems,
  preservationRule:'No URL, canonical, indexed page or existing backlink is removed by this audit.',
  summary:{
    evaluated:rows.length,
    belowTarget:rows.filter(x=>x.exists&&x.editorialAuthorityScore<target).length,
    protectAndAmplify:rows.filter(x=>x.action==='protect_and_amplify').length,
    deepen:rows.filter(x=>x.action==='deepen_editorial_evidence').length,
    newsFlywheel:rows.filter(x=>x.action==='convert_news_to_decision_flywheel').length
  },
  portfolio:portfolioRows,
  all:rows
};
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','editorial-authority-portfolio.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:true,...report.summary,portfolio:portfolioRows.map(x=>({page:x.page,score:x.editorialAuthorityScore,impressions:x.impressions,position:x.position,action:x.action}))},null,2));
