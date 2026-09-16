import fs from 'node:fs/promises';
import { editorialTrust } from './editorial-trust.mjs';

const readJson=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}};
const config=await readJson('data/comparison-engine.json',{});
const tools=await readJson('data/tools.json',[]);
const freshness=await readJson('data/catalog-freshness-state.json',{tools:{}});
let pairs=await readJson('data/comparisons.json',[]);
const bySlug=new Map(tools.map(t=>[t.slug,t]));
const slugs=[...bySlug.keys()].sort((a,b)=>b.length-a.length);
const existing=new Set(pairs.map(([a,b])=>[a,b].sort().join('|')));
const report={generatedAt:new Date().toISOString(),status:'observed',source:config.statsUrl||'https://trytoolscout.org/api/stats',threshold:Number(config.minimumPairViewsForPromotion||3),promoted:[],held:[],observed:[]};

function resolvePair(intent){
  const raw=String(intent||'');
  for(const left of slugs){
    const prefix=`${left}-vs-`;
    if(!raw.startsWith(prefix))continue;
    const right=raw.slice(prefix.length);
    if(bySlug.has(right)&&right!==left)return[left,right];
  }
  return null;
}
function trusted(tool){
  if(config.requireEditorialTrust===false)return{trusted:true,reasons:[]};
  return editorialTrust(tool,freshness?.tools?.[tool.slug]||null,{maxFactualAgeDays:45,strictSource:false});
}

if(config.enabled===false){
  report.status='disabled';
}else{
  try{
    const res=await fetch(`${config.statsUrl||'https://trytoolscout.org/api/stats'}?comparisonDemand=${Date.now()}`,{headers:{'user-agent':'ToolScout Comparison Demand/1.0 (+https://trytoolscout.org)'}});
    if(!res.ok)throw new Error(`stats_http_${res.status}`);
    const stats=await res.json();
    const rows=Array.isArray(stats?.funnel?.byIntent)?stats.funnel.byIntent:[];
    const demand=new Map();
    for(const row of rows){
      if(row?.event_type!=='comparison_viewed')continue;
      const pair=resolvePair(row.intent_slug);
      if(!pair)continue;
      const key=pair.join('|');
      demand.set(key,(demand.get(key)||0)+Number(row.events||0));
    }
    const candidates=[...demand.entries()].map(([key,views])=>({pair:key.split('|'),views})).sort((a,b)=>b.views-a.views||a.pair.join('|').localeCompare(b.pair.join('|')));
    report.observed=candidates.map(x=>({left:x.pair[0],right:x.pair[1],views:x.views}));
    const threshold=Number(config.minimumPairViewsForPromotion||3),cap=Number(config.maxNewPairsPerCycle||3);
    for(const item of candidates){
      const [left,right]=item.pair,key=[left,right].sort().join('|');
      if(existing.has(key))continue;
      if(item.views<threshold){report.held.push({left,right,views:item.views,reason:'below_demand_threshold'});continue;}
      if(report.promoted.length>=cap){report.held.push({left,right,views:item.views,reason:'cycle_promotion_cap'});continue;}
      const a=bySlug.get(left),b=bySlug.get(right);
      if(!a||!b){report.held.push({left,right,views:item.views,reason:'tool_missing_from_catalog'});continue;}
      if(config.requireComparisonEligible!==false&&(a.comparisonEligible===false||b.comparisonEligible===false)){
        report.held.push({left,right,views:item.views,reason:'comparison_eligibility_gate'});continue;
      }
      const ta=trusted(a),tb=trusted(b);
      if(!ta.trusted||!tb.trusted){report.held.push({left,right,views:item.views,reason:'editorial_trust_gate',leftReasons:ta.reasons,rightReasons:tb.reasons});continue;}
      pairs.push([left,right]);existing.add(key);report.promoted.push({left,right,views:item.views,reason:'observed_user_comparison_demand'});
    }
    if(report.promoted.length)await fs.writeFile('data/comparisons.json',JSON.stringify(pairs,null,2)+'\n');
  }catch(error){
    report.status='unavailable';
    report.error=String(error?.message||error);
  }
}
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/comparison-demand.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,observed:report.observed.length,promoted:report.promoted.length,held:report.held.length},null,2));
