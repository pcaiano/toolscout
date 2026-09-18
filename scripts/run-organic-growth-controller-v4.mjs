import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const growth=JSON.parse(fs.readFileSync('reports/organic-growth-opportunities.json','utf8'));
const gsc=JSON.parse(fs.readFileSync('reports/gsc-signals.json','utf8'));
const previous=fs.existsSync('reports/organic-growth-state.json')?JSON.parse(fs.readFileSync('reports/organic-growth-state.json','utf8')):{pages:{}};
if(!fs.existsSync('reports/runtime-growth-directives.json'))throw new Error('shared_growth_directives_required');
const shared=JSON.parse(fs.readFileSync('reports/runtime-growth-directives.json','utf8'));
if(shared?.brain!=='shared-growth-v3')throw new Error('shared_growth_brain_mismatch');
const directives=new Map((shared.directives||[]).map(x=>[x.intent,x]));
const loop=config.closedLoop||{};
const maxNew=Number(loop.maxNewInterventionsPerCycle||3);
const cooldownMs=Number(loop.minimumDaysBetweenInterventions||7)*86400000;
const evaluationMs=Number(loop.minimumEvaluationAgeDays||14)*86400000;
const minImpressions=Number(loop.minimumImpressionsForIntervention||40);
const minRollbackImpressions=Number(loop.minimumImpressionsForRollback||100);
const winDelta=Number(loop.minimumPositionImprovementForWin||5);
const lossDelta=Number(loop.minimumPositionWorseningForRollback||10);
const now=new Date();
const nowIso=now.toISOString();
const byIntent=new Map((gsc.items||[]).map(x=>[x.intent,x]));
const pages={...(previous.pages||{})};
const candidates=[];
const evaluations=[];
const rollbacks=[];
const indexingRecovery=[];

for(const item of growth.opportunities||[]){
  const signal=byIntent.get(item.intent)||null,directive=directives.get(item.intent)||null;
  const current=pages[item.intent]||{};
  const latest={clicks:Number(signal?.clicks||0),impressions:Number(signal?.impressions||0),ctr:Number(signal?.ctr||0),position:Number(signal?.position||0)};
  const indexingSignal=item.indexingSignal||null;

  if(item.lane==='seo-indexing-recovery'||item.indexingBarrier){
    if(!directive||!Array.isArray(directive.actions)||!directive.actions.some(x=>/index|repair/i.test(String(x))))continue;
    pages[item.intent]={...current,intent:item.intent,latest,indexing:indexingSignal,lastSeenAt:nowIso,contentOptimizationSuspended:true};
    indexingRecovery.push({intent:item.intent,status:indexingSignal?.status||'unknown',coverageState:indexingSignal?.coverageState||null,lastCrawlTime:indexingSignal?.lastCrawlTime||null,action:'repair-indexing',executionPlan:item.executionPlan||[]});
    continue;
  }

  if(!signal||!directive)continue;
  current.contentOptimizationSuspended=false;
  current.indexing=indexingSignal;
  const since=current.lastInterventionAt?now-new Date(current.lastInterventionAt):Infinity;

  if(current.activeVariant&&current.baseline&&since>=evaluationMs&&latest.impressions>=minRollbackImpressions){
    const positionChange=latest.position-Number(current.baseline.position||0);
    const clickGain=latest.clicks-Number(current.baseline.clicks||0);
    const outcome=clickGain>0||positionChange<=-winDelta?'winner':clickGain<=0&&positionChange>=lossDelta?'loser':'neutral';
    evaluations.push({intent:item.intent,variant:current.activeVariant,outcome,positionChange:Number(positionChange.toFixed(3)),clickGain});
    if(outcome==='loser'){
      rollbacks.push({intent:item.intent,variant:current.activeVariant,positionChange:Number(positionChange.toFixed(3))});
      current.previousVariant=current.activeVariant;
      current.activeVariant=null;
      current.lastRollbackAt=nowIso;
      current.lastInterventionAt=nowIso;
      current.baseline=latest;
    }
  }

  const sinceUpdated=current.lastInterventionAt?now-new Date(current.lastInterventionAt):Infinity;
  const eligible=Boolean(item.searchSignal?.meaningfulSample)&&latest.impressions>=minImpressions&&sinceUpdated>=cooldownMs&&Array.isArray(directive.actions)&&directive.actions.some(x=>['content_amplification','search_measurement','seo_content_refresh','improve-answer-alignment','improve-decision-depth'].includes(String(x)));
  const variant=item.lane==='seo-aeo-snippet'?'answer-alignment-v1':item.lane==='seo-striking-distance'?'striking-distance-v1':item.lane==='seo-authority-depth'?'decision-depth-v1':null;
  pages[item.intent]={...current,intent:item.intent,latest,indexing:indexingSignal,lastSeenAt:nowIso};
  if(eligible&&variant&&!current.activeVariant)candidates.push({intent:item.intent,variant,lane:item.lane,priorityScore:Number(directive.priority_score??item.priorityScore??0),impressions:latest.impressions,position:latest.position,brainOpportunity:directive.opportunity_key,brainActions:directive.actions});
}

candidates.sort((a,b)=>b.priorityScore-a.priorityScore||b.impressions-a.impressions);
const selected=candidates.slice(0,maxNew);
for(const action of selected){
  pages[action.intent].activeVariant=action.variant;
  pages[action.intent].lastInterventionAt=nowIso;
  pages[action.intent].baseline=pages[action.intent].latest;
}
const active=Object.values(pages).filter(x=>x.activeVariant);
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/organic-growth-state.json',JSON.stringify({version:4,updatedAt:nowIso,pages},null,2)+'\n');
fs.writeFileSync('reports/organic-growth-actions.json',JSON.stringify({generatedAt:nowIso,engine:'ToolScout Organic Growth Engine v4',brain:'shared-growth-v3',brainDirectivesGeneratedAt:shared.generatedAt,newInterventions:selected,activeOptimizations:active,indexingRecovery,evaluations,rollbacks,ownerActionRequired:false},null,2)+'\n');
console.log(JSON.stringify({newInterventions:selected,activeOptimizations:active.length,indexingRecovery:indexingRecovery.length,evaluations,rollbacks},null,2));
