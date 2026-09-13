import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('data/organic-growth-engine.json','utf8'));
const growth=JSON.parse(fs.readFileSync('reports/organic-growth-opportunities.json','utf8'));
const gsc=JSON.parse(fs.readFileSync('reports/gsc-signals.json','utf8'));
const previous=fs.existsSync('reports/organic-growth-state.json')?JSON.parse(fs.readFileSync('reports/organic-growth-state.json','utf8')):{pages:{}};
const loop=config.closedLoop||{};
const maxNew=Number(loop.maxNewInterventionsPerCycle||3);
const cooldownMs=Number(loop.minimumDaysBetweenInterventions||7)*86400000;
const minImpressions=Number(loop.minimumImpressionsForIntervention||40);
const now=new Date();
const byIntent=new Map((gsc.items||[]).map(x=>[x.intent,x]));
const pages={...(previous.pages||{})};
const candidates=[];

for(const item of growth.opportunities||[]){
  const signal=byIntent.get(item.intent);
  if(!signal)continue;
  const current=pages[item.intent]||{};
  const since=current.lastInterventionAt?now-new Date(current.lastInterventionAt):Infinity;
  const eligible=Boolean(item.searchSignal?.meaningfulSample)&&Number(signal.impressions||0)>=minImpressions&&since>=cooldownMs;
  const variant=item.lane==='seo-aeo-snippet'?'answer-alignment-v1':item.lane==='seo-striking-distance'?'striking-distance-v1':item.lane==='seo-authority-depth'?'decision-depth-v1':null;
  pages[item.intent]={...current,intent:item.intent,latest:{clicks:Number(signal.clicks||0),impressions:Number(signal.impressions||0),ctr:Number(signal.ctr||0),position:Number(signal.position||0)},lastSeenAt:now.toISOString()};
  if(eligible&&variant&&!current.activeVariant)candidates.push({intent:item.intent,variant,lane:item.lane,priorityScore:Number(item.priorityScore||0),impressions:Number(signal.impressions||0),position:Number(signal.position||0)});
}

candidates.sort((a,b)=>b.priorityScore-a.priorityScore||b.impressions-a.impressions);
const selected=candidates.slice(0,maxNew);
for(const action of selected){
  pages[action.intent].activeVariant=action.variant;
  pages[action.intent].lastInterventionAt=now.toISOString();
  pages[action.intent].baseline=pages[action.intent].latest;
}
const active=Object.values(pages).filter(x=>x.activeVariant);
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/organic-growth-state.json',JSON.stringify({version:3,updatedAt:now.toISOString(),pages},null,2)+'\n');
fs.writeFileSync('reports/organic-growth-actions.json',JSON.stringify({generatedAt:now.toISOString(),engine:'ToolScout Organic Growth Engine v3',newInterventions:selected,activeOptimizations:active,ownerActionRequired:false},null,2)+'\n');
console.log(JSON.stringify({newInterventions:selected,activeOptimizations:active.length},null,2));
