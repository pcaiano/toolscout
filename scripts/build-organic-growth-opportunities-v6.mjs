import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const growth=JSON.parse(fs.readFileSync('reports/growth-priority.json','utf8'));
const gapsPath='reports/competitive-gap-signals.json';
const gaps=fs.existsSync(gapsPath)?JSON.parse(fs.readFileSync(gapsPath,'utf8')):{gaps:[]};
const gsc=JSON.parse(fs.readFileSync('reports/gsc-signals.json','utf8'));
const trafficTruthPath='data/traffic-truth.json';
const trafficTruth=fs.existsSync(trafficTruthPath)?JSON.parse(fs.readFileSync(trafficTruthPath,'utf8')):null;
const indexingConfigPath='data/seo-indexing-engine.json';
const indexingConfig=fs.existsSync(indexingConfigPath)?JSON.parse(fs.readFileSync(indexingConfigPath,'utf8')):{};
const indexingPath='reports/gsc-indexing.json';
const indexing=fs.existsSync(indexingPath)?JSON.parse(fs.readFileSync(indexingPath,'utf8')):{items:[],summary:{}};
const barrierStatuses=new Set(indexingConfig.barrierStatuses||['canonical-alternate','crawled-not-indexed','discovered-not-indexed','blocked','redirected','error']);
const threshold=config.thresholds||{},minImpressions=Number(threshold.minimumGscImpressionsForCtrAction||20),firstPageMax=Number(threshold.firstPageMaxPosition||10),strikingMax=Number(threshold.strikingDistanceMaxPosition||20),rows=[];

function normalizeUrl(value){
  let url;
  try{url=new URL(String(value||''));}catch{return null;}
  url.protocol='https:';url.hostname='trytoolscout.org';url.hash='';url.search='';
  let pathname=url.pathname||'/';
  if(/\/index\.html$/i.test(pathname))pathname=pathname.replace(/\/index\.html$/i,'/')||'/';
  else if(/\.html$/i.test(pathname))pathname=pathname.replace(/\.html$/i,'');
  if(pathname.length>1)pathname=pathname.replace(/\/+$/g,'');
  return `https://trytoolscout.org${pathname||'/'}`;
}
const indexingByUrl=new Map((indexing.items||[]).map(item=>[normalizeUrl(item.url),item]).filter(([url])=>url));
const indexingForIntent=intent=>indexingByUrl.get(`https://trytoolscout.org/${intent}`)||null;
const indexingBarrier=signal=>Boolean(signal&&barrierStatuses.has(signal.status));

function executionPlan(lane){
  if(lane==='seo-indexing-recovery')return['preserve-current-url','verify-self-canonical','verify-sitemap-entry','verify-indexability','strengthen-internal-discovery','validate-public-surface','recheck-google-indexing'];
  if(lane==='seo-first-page-observation')return['preserve-current-url','validate-editorial-quality','verify-query-title-alignment','monitor-ranking-and-impressions','recheck-automatically'];
  if(lane==='seo-aeo-snippet')return['protect-current-ranking','sharpen-answer-first-copy','strengthen-query-title-alignment','strengthen-comparison-context','strengthen-internal-links','validate-aeo-geo','publish','measure'];
  if(lane==='seo-striking-distance-observation')return['preserve-current-url','validate-editorial-quality','monitor-ranking-and-impressions','recheck-automatically'];
  if(lane==='seo-striking-distance')return['deepen-decision-context','strengthen-query-title-alignment','strengthen-internal-links','strengthen-entity-context','validate-aeo-geo','publish','measure'];
  if(lane==='seo-authority-depth')return['deepen-evidence-and-relevance','improve-query-intent-match','add-useful-comparison-context','strengthen-internal-links','validate-aeo-geo','publish','measure'];
  if(lane==='commercial-intent')return['improve-existing-decision-surface','strengthen-commercial-intent-context','validate-editorial-neutrality','publish','measure'];
  if(lane==='editorial-safety')return['hold-publication','research-catalog-coverage','revalidate-eligibility','recheck-automatically'];
  return['measure','recheck-automatically'];
}

for(const item of growth.items||[]){
  const s=item.searchSignal,meaningful=Boolean(s?.meaningfulSample??(Number(s?.impressions||0)>=minImpressions||Number(s?.clicks||0)>0)),position=Number(s?.position||0),firstPage=position>0&&position<=firstPageMax,striking=position>firstPageMax&&position<=strikingMax,indexingSignal=indexingForIntent(item.intent);
  let lane='measure',action='measure-and-recheck',reason='No strong observed-search trigger yet. Continue automatic measurement.';
  if(item.action==='catalog-gap'){lane='editorial-safety';action='hold-publication-and-research-catalog';reason='Catalog evidence is insufficient for a credible ranking. Hold publication and improve catalog coverage automatically.';}
  else if(indexingBarrier(indexingSignal)){lane='seo-indexing-recovery';action='repair-indexing';reason=`Google indexing state is ${indexingSignal.status}. Fix technical discovery and canonical signals before changing editorial content.`;}
  else if(firstPage&&!meaningful){lane='seo-first-page-observation';action='protect-and-measure';reason='First-page visibility is strategically valuable even with a small sample. Preserve the URL and ranking, validate quality, and gather more evidence before aggressive rewriting.';}
  else if(striking&&!meaningful){lane='seo-striking-distance-observation';action='protect-and-measure';reason='Near-first-page visibility is strategically valuable but the sample is small. Preserve and measure before aggressive rewriting.';}
  else if(meaningful&&firstPage){lane='seo-aeo-snippet';action='optimize-existing';reason=Number(s?.clicks||0)>0?'Observed first-page traffic: protect the ranking and improve qualified click capture.':'Meaningful first-page visibility without clicks: improve query, title, snippet and answer alignment automatically.';}
  else if(meaningful&&striking){lane='seo-striking-distance';action='optimize-existing';reason='Meaningful near-first-page ranking: deepen decision context, query alignment and internal authority automatically.';}
  else if(meaningful&&position>20){lane='seo-authority-depth';action='deepen-existing';reason='Meaningful visibility with weak ranking: improve intent match, capability relevance, depth, evidence and authority. Impressions are not traffic.';}
  else if(!s&&item.priorityScore>=75){lane='commercial-intent';action='invest-existing';reason='High commercial/readiness score without observed search evidence. Improve conservatively and measure.';}
  rows.push({intent:item.intent,priorityScore:item.priorityScore,lane,action,reason,strategicOpportunity:firstPage||striking,evidenceConfidence:s?.evidenceConfidence||(meaningful?'meaningful':s?'low':'none'),indexingSignal:indexingSignal||null,indexingBarrier:indexingBarrier(indexingSignal),autonomy:'fully-autonomous',ownerActionRequired:false,executionPlan:executionPlan(lane),qualityGates:['indexing-safety','canonical-safety','non-duplication','strict-category-fit','capability-fit','semantic-tool-fit','factual-evidence','editorial-neutrality','useful-decision-context','public-surface-validation'],monetizationReadiness:item.monetizationReadiness,searchSignal:s||null,topTools:item.topTools||[]});
}

const competitorCandidates=(gaps.gaps||[]).slice(0,100).map(gap=>({candidate:gap.slug,competitorMentions:gap.mentions,sources:gap.sources,action:'auto-research-only',ownerActionRequired:false,publishGate:'Require distinct observed intent, verified catalog evidence, non-duplication, semantic eligibility and useful decision context before autonomous publication.',reason:'Competitor patterns are research signals, not publication evidence.'}));
const actionRank={'repair-indexing':7,'optimize-existing':6,'deepen-existing':6,'protect-and-measure':5,'invest-existing':4,'hold-publication-and-research-catalog':3,'measure-and-recheck':1};
rows.sort((a,b)=>(actionRank[b.action]||0)-(actionRank[a.action]||0)||b.priorityScore-a.priorityScore||Number(b.searchSignal?.impressions||0)-Number(a.searchSignal?.impressions||0));
const actionable=rows.filter(x=>x.action!=='measure-and-recheck'),indexingRecovery=rows.filter(x=>x.lane==='seo-indexing-recovery').length,firstPageMeaningful=rows.filter(x=>x.lane==='seo-aeo-snippet').length,firstPageLowSample=rows.filter(x=>x.lane==='seo-first-page-observation').length,strikingMeaningful=rows.filter(x=>x.lane==='seo-striking-distance').length,strikingLowSample=rows.filter(x=>x.lane==='seo-striking-distance-observation').length,authority=rows.filter(x=>x.lane==='seo-authority-depth').length;
const siteTotals=gsc.siteTotals||{clicks:(gsc.items||[]).reduce((n,x)=>n+Number(x.clicks||0),0),impressions:(gsc.items||[]).reduce((n,x)=>n+Number(x.impressions||0),0)},organicClicks=Number(siteTotals.clicks||0),organicImpressions=Number(siteTotals.impressions||0);
let organicAcquisitionStatus='no-observed-search-visibility';if(organicClicks>=10)organicAcquisitionStatus='observed-search-acquisition';else if(organicClicks>0)organicAcquisitionStatus='early-search-acquisition';else if(organicImpressions>=500)organicAcquisitionStatus='visibility-without-traffic';else if(organicImpressions>0)organicAcquisitionStatus='early-visibility-without-traffic';
const pages=Array.isArray(gsc.pages)?gsc.pages:[];
const pageOpportunities=pages.filter(x=>Number(x.impressions||0)>0).map(x=>{const position=Number(x.position||0),meaningful=Number(x.impressions||0)>=minImpressions||Number(x.clicks||0)>0,indexingSignal=indexingByUrl.get(normalizeUrl(x.page))||null;return{page:x.page,pathname:x.pathname,type:x.type,clicks:Number(x.clicks||0),impressions:Number(x.impressions||0),ctr:Number(x.ctr||0),position,topQueries:(x.topQueries||[]).slice(0,5),indexingSignal,indexingBarrier:indexingBarrier(indexingSignal),meaningfulSample:meaningful,strategicOpportunity:position>0&&position<=strikingMax,evidenceConfidence:meaningful?'meaningful':'low',opportunityScore:Number((Number(x.impressions||0)*(x.clicks>0?1.2:1)/Math.max(1,position||100)).toFixed(3)),outcome:x.clicks>0?'traffic-observed':'visibility-only'};}).sort((a,b)=>Number(b.indexingBarrier)-Number(a.indexingBarrier)||Number(b.strategicOpportunity)-Number(a.strategicOpportunity)||Number(b.meaningfulSample)-Number(a.meaningfulSample)||b.opportunityScore-a.opportunityScore||b.impressions-a.impressions).slice(0,50);
const indexingSummary=indexing.summary||{};
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/organic-growth-opportunities.json',JSON.stringify({generatedAt:new Date().toISOString(),engine:'ToolScout Search and Answer Opportunity Engine v6',objective:'Autonomously pursue sustainable search rankings and qualified clicks while separating indexing failures from content-performance failures.',acquisitionTruth:{status:organicAcquisitionStatus,searchClicks:organicClicks,searchImpressions:organicImpressions,ctr:organicImpressions?Number((organicClicks/organicImpressions*100).toFixed(4)):0,gscStartDate:gsc.startDate||null,gscEndDate:gsc.endDate||null,gscDataState:gsc.dataState||'legacy-partial',trafficTruthStatus:trafficTruth?.status||'unavailable',rule:'Impressions are visibility, not traffic. A known indexing barrier blocks editorial intervention until technical recovery is confirmed.'},indexingTruth:{available:Boolean((indexing.items||[]).length),generatedAt:indexing.generatedAt||null,total:Number(indexingSummary.total||indexing.items?.length||0),indexed:Number(indexingSummary.indexed||0),barriers:Number(indexingSummary.barriers||0)},autonomyDirective:'The engine owns observation, indexing triage, prioritization, optimization, validation, publication, measurement and rechecking. The owner is not required to edit content.',dailyDecisionRules:['Check indexing state before interpreting weak search performance as a content problem.','Do not rewrite a page while Google reports a canonical or indexation barrier.','Treat every first-page result as a strategic opportunity.','Protect low-sample first-page rankings and gather evidence instead of rewriting aggressively.','Use meaningful Search Console samples for CTR and ranking interventions.','Never fill a ranking with a wrong-category, capability-mismatched or semantically weak tool.','Measure every intervention and re-evaluate from fresh Search Console and indexing data.'],summary:{observedGscIntents:(gsc.items||[]).filter(x=>Number(x.impressions||0)>0).length,observedGscPages:pages.filter(x=>Number(x.impressions||0)>0).length,searchClicks:organicClicks,searchImpressions:organicImpressions,organicAcquisitionStatus,indexingRecovery,actionableOpportunities:actionable.length,firstPageOpportunities:firstPageMeaningful+firstPageLowSample,firstPageMeaningful,firstPageLowSample,strikingDistanceOpportunities:strikingMeaningful+strikingLowSample,strikingMeaningful,strikingLowSample,authorityDepthOpportunities:authority,competitorResearchCandidates:competitorCandidates.length},opportunities:rows,pageOpportunities,autonomousActionQueue:rows.map(x=>({intent:x.intent,priorityScore:x.priorityScore,lane:x.lane,action:x.action,indexingSignal:x.indexingSignal,ownerActionRequired:false,executionPlan:x.executionPlan,qualityGates:x.qualityGates})),competitorResearchCandidates:competitorCandidates},null,2)+'\n');
console.log(JSON.stringify({organicAcquisitionStatus,searchClicks:organicClicks,searchImpressions:organicImpressions,indexingRecovery,actionable:actionable.length,firstPageMeaningful,firstPageLowSample,strikingMeaningful,strikingLowSample,authority,competitorCandidates:competitorCandidates.length,top:rows.slice(0,10)},null,2));
