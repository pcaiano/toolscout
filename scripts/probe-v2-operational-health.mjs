const BASE=(process.env.TOOLSCOUT_BASE_URL||"https://trytoolscout.org").replace(/\/$/,"");
const now=Date.now();

function ageMinutes(value){
  if(!value)return null;
  const raw=String(value);
  const ms=Date.parse(raw.includes("T")?raw:raw.replace(" ","T")+"Z");
  return Number.isFinite(ms)?Math.max(0,Math.round((now-ms)/60000)):null;
}

async function read(path){
  const started=Date.now();
  try{
    const r=await fetch(BASE+path,{headers:{"User-Agent":"ToolScout-2.0-Operational-Proof/1.0","Cache-Control":"no-cache","Pragma":"no-cache"}});
    const text=await r.text();
    let data=null;
    try{data=JSON.parse(text)}catch{}
    return {ok:r.ok,status:r.status,latencyMs:Date.now()-started,data,error:data?null:text.slice(0,240)};
  }catch(error){
    return {ok:false,status:0,latencyMs:Date.now()-started,data:null,error:String(error?.message||error)};
  }
}

const paths={
  closure:"/api/runtime/closure-health",
  growth:"/api/autonomous-growth-health",
  authority:"/api/distribution/authority/closed-loop-health?fresh=1",
  content:"/api/content-engine/intelligence/metrics",
  audience:"/api/audience/platform-capabilities",
  bluesky:"/api/audience/bluesky-reply/health",
  commandCenter:"/api/command-center-resilient-health",
  discovery:"/api/distribution/discovery-health",
  schedule:"/api/runtime/schedule-contract"
};

const entries=await Promise.all(Object.entries(paths).map(async ([name,path])=>[name,await read(path)]));
const probes=Object.fromEntries(entries);
const hardFailures=[];
const alerts=[];

for(const [name,p] of Object.entries(probes)){
  if(!p.ok||!p.data)hardFailures.push({code:name+"_unavailable",status:p.status,error:p.error});
}

const closure=probes.closure.data||{};
if(probes.closure.ok&&(closure.architecture!=="toolscout-2.0"||Number(closure.phase)!==107||Number(closure.legacyEdges)!==0||Number(closure.routeOwnership?.directCoveragePct)!==100)){
  hardFailures.push({code:"architecture_closure_regressed",closure});
}

const overall=probes.growth.data?.overallHealth||{};
const engines=Array.isArray(overall.engines)?overall.engines.map(x=>({
  engine:x.engine,
  status:x.status||null,
  directive:x.directive||null,
  strictHumans24h:Number(x.strict_humans_24h||0),
  externalExecutions24h:Number(x.external_executions_24h||0),
  lastEvaluatedAt:x.last_evaluated_at||null,
  ageMinutes:ageMinutes(x.last_evaluated_at)
})):[];
if(["critical","underpowered"].includes(String(overall.status||""))){
  alerts.push({severity:overall.status,code:"growth_system_"+overall.status});
}
for(const engine of engines){
  if(engine.ageMinutes!==null&&engine.ageMinutes>180)alerts.push({severity:"critical",code:"engine_supervisor_stale",engine:engine.engine,ageMinutes:engine.ageMinutes});
  if(["failed","critical","stalled"].includes(String(engine.status||"").toLowerCase()))alerts.push({severity:"critical",code:"engine_state_unhealthy",engine:engine.engine,status:engine.status,directive:engine.directive});
}

const authority=probes.authority.data||{};
if(["failed","critical","underpowered","handoff_reconciliation_required"].includes(String(authority.status||"").toLowerCase())){
  alerts.push({severity:"underpowered",code:"authority_attention",status:authority.status});
}

const content=probes.content.data||{};
const briefTimes=Object.values(content.briefs||{}).map(x=>x?.lastCreatedAt).filter(Boolean);
const lastBriefAt=briefTimes.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
if(lastBriefAt&&ageMinutes(lastBriefAt)>10080)alerts.push({severity:"underpowered",code:"content_brief_stale",ageMinutes:ageMinutes(lastBriefAt)});

const audience=probes.audience.data||{};
const bluesky=probes.bluesky.data||{};
if(probes.bluesky.ok&&(bluesky.requiresPrepareBeforePublish!==true||bluesky.blocksInternalControlText!==true)){
  hardFailures.push({code:"bluesky_guard_regressed"});
}

const cc=probes.commandCenter.data||{};
if(probes.commandCenter.ok&&(cc.ok!==true||Number(cc.version)<6))hardFailures.push({code:"command_center_resilient_regressed"});

const report={
  ok:hardFailures.length===0,
  operationalStatus:hardFailures.length?"invalid":alerts.some(x=>x.severity==="critical")?"critical":alerts.length?"underpowered":"operational",
  checkedAt:new Date().toISOString(),
  architecture:{phase:closure.phase||null,legacyEdges:closure.legacyEdges??null,directCoveragePct:closure.routeOwnership?.directCoveragePct??null,fingerprint:closure.deploymentFingerprint||null},
  growth:{status:overall.status||null,strictHumans24h:Number(overall.strictHumans24h||0),strictHumans7d:Number(overall.strictHumans7d||0),externalExecutions24h:Number(overall.externalExecutions24h||0),externalExecutions7d:Number(overall.externalExecutions7d||0),authorityStatus:overall.authorityStatus||null,engines},
  authority:{status:authority.status||null,senderClaimed:Number(authority.senderClaimed||0),senderDispatchReady:Number(authority.senderDispatchReady||0)},
  content:{lastBriefAt,profiles:content.profiles||{},briefs:content.briefs||{}},
  audience:{health:audience.health||null,platformCount:Array.isArray(audience.platforms)?audience.platforms.length:0,blueskyGuardVersion:bluesky.version||null},
  commandCenter:{ok:cc.ok===true,version:cc.version||null,preparedEditorialCount:Number(cc.preparedEditorialCount||0)},
  endpointLatencyMs:Object.fromEntries(Object.entries(probes).map(([k,v])=>[k,v.latencyMs])),
  alerts,
  hardFailures
};

console.log(JSON.stringify(report,null,2));
if(hardFailures.length)process.exitCode=1;
