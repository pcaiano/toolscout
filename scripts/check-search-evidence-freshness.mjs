import fs from 'node:fs';

const files={
  gsc:'reports/gsc-signals.json',
  trend:'reports/gsc-daily-trend.json',
  organic:'reports/organic-growth-opportunities.json'
};
const MAX_GSC_AGE_HOURS=30;
const MAX_TREND_AGE_HOURS=30;
const MAX_ORGANIC_AGE_HOURS=36;
const MAX_ORGANIC_LAG_HOURS=6;

function readJson(path){
  if(!fs.existsSync(path))return null;
  try{return JSON.parse(fs.readFileSync(path,'utf8'))}catch{return null}
}
function stamp(value){
  const t=Date.parse(String(value||''));
  return Number.isFinite(t)?t:null;
}
function ageHours(t,now){
  return t==null?null:Math.max(0,(now-t)/3600000);
}

const now=Date.now();
const gsc=readJson(files.gsc),trend=readJson(files.trend),organic=readJson(files.organic);
const gscAt=stamp(gsc?.generatedAt),trendAt=stamp(trend?.generatedAt),organicAt=stamp(organic?.generatedAt);
const gscAgeHours=ageHours(gscAt,now),trendAgeHours=ageHours(trendAt,now),organicAgeHours=ageHours(organicAt,now);
const organicLagHours=gscAt!=null&&organicAt!=null?Math.max(0,(gscAt-organicAt)/3600000):null;
const reasons=[];
if(gscAt==null)reasons.push('gsc_missing_or_invalid');
else if(gscAgeHours>MAX_GSC_AGE_HOURS)reasons.push('gsc_stale');
if(trendAt==null)reasons.push('gsc_trend_missing_or_invalid');
else if(trendAgeHours>MAX_TREND_AGE_HOURS)reasons.push('gsc_trend_stale');
if(organicAt==null)reasons.push('organic_missing_or_invalid');
else if(organicAgeHours>MAX_ORGANIC_AGE_HOURS)reasons.push('organic_stale');
if(organicLagHours!=null&&organicLagHours>MAX_ORGANIC_LAG_HOURS)reasons.push('organic_lags_gsc');
const refresh=reasons.length>0;
const state={
  checkedAt:new Date(now).toISOString(),
  refresh,
  reasons,
  thresholds:{maxGscAgeHours:MAX_GSC_AGE_HOURS,maxTrendAgeHours:MAX_TREND_AGE_HOURS,maxOrganicAgeHours:MAX_ORGANIC_AGE_HOURS,maxOrganicLagHours:MAX_ORGANIC_LAG_HOURS},
  gsc:{generatedAt:gsc?.generatedAt||null,ageHours:gscAgeHours},
  trend:{generatedAt:trend?.generatedAt||null,finalizedThroughDate:trend?.finalizedThroughDate||null,ageHours:trendAgeHours},
  organic:{generatedAt:organic?.generatedAt||null,ageHours:organicAgeHours,lagBehindGscHours:organicLagHours}
};
console.log(JSON.stringify(state));

if(process.argv.includes('--github-output')&&process.env.GITHUB_OUTPUT){
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'refresh='+(refresh?'true':'false')+'\n');
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'reasons='+reasons.join(',')+'\n');
}
if(process.argv.includes('--require-fresh')&&refresh)process.exit(1);
