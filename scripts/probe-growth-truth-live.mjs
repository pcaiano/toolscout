const BASE='https://trytoolscout.org';
const MAX_GSC_AGE_HOURS=30;
const MAX_AUTHORITY_AGE_HOURS=48;

async function json(path){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(BASE+path,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:controller.signal});
    const text=await r.text();
    if(!r.ok)throw new Error(path+':http_'+r.status+':'+text.slice(0,240));
    return JSON.parse(text);
  }finally{clearTimeout(timer)}
}
function ageHours(value){
  const t=Date.parse(String(value||''));
  return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):Infinity;
}
function requireTrue(ok,code,evidence){
  if(!ok)throw new Error(code+':'+JSON.stringify(evidence));
}

const [closure,authority,gsc,trend]=await Promise.all([
  json('/api/runtime/closure-health'),
  json('/data/se-ranking-backlink-truth.json'),
  json('/data/gsc-search-reality.json'),
  json('/data/gsc-daily-trend.json')
]);

requireTrue(
  closure.release==='toolscout-2.0-final'
    &&Number(closure.releasePhase)===260
    &&closure.deploymentFingerprint==='toolscout-2.0-final-phase-260',
  'toolscout_final_release_not_live',
  {release:closure.release,releasePhase:closure.releasePhase,fingerprint:closure.deploymentFingerprint}
);
requireTrue(ageHours(authority.observedAt)<=MAX_AUTHORITY_AGE_HOURS,'authority_snapshot_stale',{observedAt:authority.observedAt,ageHours:ageHours(authority.observedAt)});
requireTrue(Number(authority?.metrics?.backlinks)>=95,'authority_backlinks_not_refreshed',authority.metrics);
requireTrue(Number(authority?.metrics?.referringDomains)>=29,'authority_refdomains_not_refreshed',authority.metrics);
requireTrue(Number(authority?.metrics?.domainAuthority)===2,'authority_metric_unexpected',authority.metrics);

requireTrue(ageHours(gsc.generatedAt)<=MAX_GSC_AGE_HOURS,'gsc_reality_stale',{generatedAt:gsc.generatedAt,ageHours:ageHours(gsc.generatedAt)});
requireTrue(Number(gsc?.searchPerformance?.window28d?.impressions)>0,'gsc_reality_empty',gsc?.searchPerformance?.window28d||null);
requireTrue(ageHours(trend.generatedAt)<=MAX_GSC_AGE_HOURS,'gsc_daily_trend_stale',{generatedAt:trend.generatedAt,ageHours:ageHours(trend.generatedAt)});
requireTrue(Array.isArray(trend.daily)&&trend.daily.length>=7,'gsc_daily_trend_empty',{days:trend?.daily?.length||0});

console.log(JSON.stringify({
  ok:true,
  release:{phase:closure.releasePhase,fingerprint:closure.deploymentFingerprint},
  authority:{observedAt:authority.observedAt,backlinks:authority.metrics.backlinks,referringDomains:authority.metrics.referringDomains,domainAuthority:authority.metrics.domainAuthority},
  gsc:{generatedAt:gsc.generatedAt,clicks:gsc.searchPerformance.window28d.clicks,impressions:gsc.searchPerformance.window28d.impressions,position:gsc.searchPerformance.window28d.position},
  trend:{generatedAt:trend.generatedAt,finalizedThroughDate:trend.finalizedThroughDate,days:trend.daily.length}
},null,2));
