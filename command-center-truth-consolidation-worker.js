import base from './discovery-attribution-health-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};

function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

async function canonicalCommercialTruth(env){
  if(!env.DB)return {status:'unavailable',source:'D1',definition:'Browser-confirmed outbound only.'};
  const confirmedSql=`WITH confirmed_sessions AS (
    SELECT DISTINCT session_id FROM funnel_events WHERE event_type='page_confirmed'
  )
  SELECT c.tool_slug,
         COUNT(*) clicks,
         SUM(CASE WHEN c.affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized
  FROM click_events c
  JOIN confirmed_sessions confirmed ON confirmed.session_id=c.session_id
  LEFT JOIN sessions s ON s.session_id=c.session_id
  WHERE c.created_at>=datetime('now','-30 days')
    AND COALESCE(s.classification,'unknown/legacy') IN ('likely-human','human')
    AND c.source NOT IN ('internal-test','synthetic','health-check','ci')
  GROUP BY c.tool_slug`;
  const legacySql=`SELECT COUNT(*) outbound,
         SUM(CASE WHEN c.affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized
  FROM click_events c
  LEFT JOIN sessions s ON s.session_id=c.session_id
  WHERE c.created_at>=datetime('now','-30 days')
    AND COALESCE(s.classification,'unknown/legacy') IN ('likely-human','human')
    AND c.source NOT IN ('internal-test','synthetic','health-check','ci')`;
  try{
    const [confirmed,legacy]=await Promise.all([
      env.DB.prepare(confirmedSql).all(),
      env.DB.prepare(legacySql).first()
    ]);
    const byTool={};
    let outbound=0,monetized=0;
    for(const row of confirmed?.results||[]){
      const slug=String(row.tool_slug||'');
      if(!slug)continue;
      const clicks=n(row.clicks),mon=n(row.monetized);
      byTool[slug]={outbound:clicks,monetized:mon};
      outbound+=clicks;monetized+=mon;
    }
    return {
      status:'observed',
      source:'D1',
      trafficTruth:'browser_confirmed',
      windowDays:30,
      definition:'Outbound is counted only when the session has a first-party browser page confirmation. Internal, synthetic, health-check and CI sources are excluded.',
      humanOutbound:outbound,
      monetizedOutbound:monetized,
      unmonetizedOutbound:Math.max(0,outbound-monetized),
      weightedCoverage:outbound?monetized/outbound:null,
      byTool,
      legacyDiagnostic:{
        definition:'Legacy likely-human classification without browser confirmation. Diagnostic only and never used for canonical monetization.',
        humanOutbound:n(legacy?.outbound),
        monetizedOutbound:n(legacy?.monetized)
      },
      generatedAt:new Date().toISOString()
    };
  }catch(error){
    return {status:'unavailable',source:'D1',trafficTruth:'browser_confirmed',definition:'Browser-confirmed outbound only.',reason:String(error?.message||error),generatedAt:new Date().toISOString()};
  }
}

function syncAffiliateStatus(status,truth){
  if(!status||typeof status!=='object'||truth.status!=='observed')return status;
  const syncGroup=group=>{
    const items=(Array.isArray(group?.items)?group.items:[]).map(item=>{
      const t=truth.byTool?.[item.slug]||{outbound:0,monetized:0};
      return {...item,clicks30d:t.outbound,monetizedClicks30d:t.monetized};
    });
    return {...(group||{}),count:items.length,clicks30d:items.reduce((sum,x)=>sum+n(x.clicks30d),0),monetizedClicks30d:items.reduce((sum,x)=>sum+n(x.monetizedClicks30d),0),items};
  };
  return {
    ...status,
    trafficTruth:'browser_confirmed',
    clickDefinition:truth.definition,
    humanOutbound30d:truth.humanOutbound,
    monetizedOutbound30d:truth.monetizedOutbound,
    unmonetizedOutbound30d:truth.unmonetizedOutbound,
    weightedCoverage:truth.weightedCoverage,
    active:syncGroup(status.active),
    pending:syncGroup(status.pending),
    rejected:syncGroup(status.rejected)
  };
}

function consolidateData(data,truth){
  if(truth.status!=='observed')return {...data,canonicalCommercialTruth:truth};
  const outbound=truth.humanOutbound,monetized=truth.monetizedOutbound,unmonetized=truth.unmonetizedOutbound,coveragePct=truth.weightedCoverage==null?null:truth.weightedCoverage*100;
  const affiliateEngine=data?.growthOps?.engines?.affiliate||{};
  return {
    ...data,
    canonicalCommercialTruth:truth,
    funnel:{...(data?.funnel||{}),outboundClicks:outbound},
    commercial:{...(data?.commercial||{}),monetizedOutbound:monetized,totals:{...(data?.commercial?.totals||{}),outbound,monetizedOutbound:monetized},trafficDefinition:truth.definition},
    trafficIntegrity:{...(data?.trafficIntegrity||{}),confirmedHumanOutbound30d:outbound,confirmedMonetizedOutbound30d:monetized,commercialTruth:'browser_confirmed'},
    affiliateCoverage:{...(data?.affiliateCoverage||{}),humanOutboundClicks:outbound,monetizedLikelyHumanClicks:monetized,unmonetizedLikelyHumanClicks:unmonetized,weightedCoverage:truth.weightedCoverage,trafficTruth:'browser_confirmed'},
    affiliateCoverageStatus:syncAffiliateStatus(data?.affiliateCoverageStatus,truth),
    growthOps:{...(data?.growthOps||{}),engines:{...(data?.growthOps?.engines||{}),affiliate:{...affiliateEngine,human_outbound_30d:outbound,monetized_outbound_30d:monetized,unmonetized_outbound_30d:unmonetized,weighted_coverage_pct:coveragePct,traffic_truth:'browser_confirmed'}}},
    trafficTruth:{...(data?.trafficTruth||{}),primaryMetric:'D1 exact visitors plus browser-confirmed commercial actions',d1:{...(data?.trafficTruth?.d1||{}),humanOutbound:outbound,monetizedOutbound:monetized,unmonetizedOutbound:unmonetized,weightedCoverage:truth.weightedCoverage,commercialTruth:'browser_confirmed',commercialDefinition:truth.definition}}
  };
}

async function consolidateStats(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const truth=await canonicalCommercialTruth(env);
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify(consolidateData(data,truth)),{status:response.status,statusText:response.statusText,headers});
}

function consolidatedScript(){return `<script data-toolscout-command-truth="1">(function(){
function metricValue(v){return Number(v||0).toLocaleString()}
function drawTraffic(d){
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var v=d&&d.visitors||{},tr=d&&d.tracking||{},t=d&&d.trafficTruth||{},d1=t.d1||{},c=d&&d.canonicalCommercialTruth||{},r=d&&d.revenue||{},g=t.ga4||{},s=t.googleSearchConsole||{},a=d&&d.discoveryAttribution||{};
  var mtdComplete=!!(v.coverage&&v.coverage.monthToDateComplete),mtdLabel=mtdComplete?'Unique visitors MTD':'Unique visitors since tracking',mtdValue=mtdComplete?v.monthToDate:v.sinceTracking;
  var coverage=c.weightedCoverage==null?'No sample':(Number(c.weightedCoverage)*100).toFixed(1)+'%';
  var ai=((a.today&&a.today.buckets)||[]).find(function(x){return x.key==='ai_referral'}),search=((a.today&&a.today.buckets)||[]).find(function(x){return x.key==='search'}),deep=((a.today&&a.today.buckets)||[]).find(function(x){return x.key==='dark_direct_deep'});
  root.innerHTML='<div class="metricGrid">'+
    metric('Unique visitors today',metricValue(v.today),'First-party anonymous browser IDs')+
    metric('Unique visitors 24h',metricValue(v.last24),'First-party anonymous browser IDs')+
    metric(mtdLabel,metricValue(mtdValue),'Exact visitor tracking')+
    metric('Browser sessions 24h',metricValue(tr.humanSessionsLast24Hours),'Behaviour diagnostic, not visitors')+
    metric('Human outbound 30d',metricValue(c.humanOutbound),'Verified D1')+
    metric('Monetized outbound 30d',metricValue(c.monetizedOutbound),'Verified D1')+
    metric('Affiliate coverage',coverage,'Monetized share of confirmed outbound')+
    metric('Confirmed revenue',r.confirmedRevenue==null?'Unknown':money(r.confirmedRevenue,r.currency),r.reportingStatus==='connected'?'Vendor evidence connected':'No confirmed vendor evidence')+
    metric('Search today',metricValue(search&&search.visitors),'Known referrer or campaign')+
    metric('AI referrals today',metricValue(ai&&ai.visitors),'Known referrer or campaign only')+
    metric('Unattributed deep today',metricValue(deep&&deep.visitors),'Dark direct pattern, source not proven')+
    metric('GSC impressions 28d',metricValue(s.impressions),'Settled search visibility')+
  '</div><div class="note" style="margin-top:10px"><strong>Canonical commercial truth:</strong> '+esc(c.definition||'Verified D1 only.')+(c.legacyDiagnostic&&Number(c.legacyDiagnostic.humanOutbound||0)>0?'<br><br>Legacy diagnostic excluded from headline metrics: '+metricValue(c.legacyDiagnostic.humanOutbound)+' likely-human outbound, '+metricValue(c.legacyDiagnostic.monetizedOutbound)+' monetized, without browser confirmation.':'')+(g.status?'<br><br>GA4 remains a consent-based audit layer. Current status: '+esc(g.status)+'.':'')+'</div>';
}
function drawAffiliateStatus(d){
  var root=document.getElementById('affiliateCoverageStatusBody');if(!root)return;
  var s=d&&d.affiliateCoverageStatus||{},c=d&&d.canonicalCommercialTruth||{};if(s.status!=='observed'){root.innerHTML='<div class="empty">Affiliate coverage status is temporarily unavailable.</div>';return}
  var groups=[['active',s.active],['pending',s.pending],['rejected',s.rejected]],rows=[];groups.forEach(function(pair){(pair[1]&&pair[1].items||[]).forEach(function(x){rows.push({name:x.name||x.slug,status:x.status||pair[0],clicks:Number(x.clicks30d||0),monetized:Number(x.monetizedClicks30d||0),group:pair[0]})})});
  var order={active:0,pending:1,rejected:2};rows.sort(function(a,b){return order[a.group]-order[b.group]||b.monetized-a.monetized||b.clicks-a.clicks||a.name.localeCompare(b.name)});
  var summary='<div class="affiliateStatusSummary"><span class="pill good">Active '+metricValue(s.active&&s.active.count)+'</span><span class="pill info">Confirmed outbound '+metricValue(c.humanOutbound)+'</span><span class="pill good">Monetized '+metricValue(c.monetizedOutbound)+'</span><span class="pill '+(c.weightedCoverage==null?'info':'good')+'">Coverage '+(c.weightedCoverage==null?'No sample':(Number(c.weightedCoverage)*100).toFixed(1)+'%')+'</span></div>';
  var table=rows.length?'<table class="affiliateStatusTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Confirmed clicks</th><th>Monetized</th></tr></thead><tbody>'+rows.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td>'+esc(String(x.status||'').replaceAll('_',' '))+'</td><td>'+metricValue(x.clicks)+'</td><td>'+metricValue(x.monetized)+'</td></tr>'}).join('')+'</tbody></table>':'<div class="empty">No active, pending or rejected affiliate programmes found.</div>';
  root.innerHTML=summary+table;
}
function drawAffiliateEngine(d){
  var root=document.getElementById('affiliateBody'),meta=document.getElementById('affiliateMeta');if(!root)return;var x=d&&d.growthOps&&d.growthOps.engines&&d.growthOps.engines.affiliate||{},c=d&&d.canonicalCommercialTruth||{};
  if(meta)meta.textContent='Verified D1';
  root.innerHTML='<div class="metricGrid">'+metric('Weighted coverage',c.weightedCoverage==null?'No sample':(Number(c.weightedCoverage)*100).toFixed(1)+'%','Canonical verified outbound')+metric('Monetized outbound 30d',metricValue(c.monetizedOutbound),metricValue(c.humanOutbound)+' confirmed human outbound')+metric('Revenue leakage 30d',metricValue(c.unmonetizedOutbound),'Confirmed outbound not monetized')+metric('Recoverable queue',metricValue(x.recoverable_queue),'Demand-prioritized candidates')+'</div><div class="note" style="margin-top:10px">Affiliate Coverage and Traffic Truth now use the same D1 verified commercial source.</div>';
}
var previous=window.render;if(typeof previous==='function')window.render=function(d){previous(d);drawTraffic(d);drawAffiliateEngine(d);setTimeout(function(){drawAffiliateStatus(d)},0)};
try{if(typeof snapshot!=='undefined'&&snapshot){drawTraffic(snapshot);drawAffiliateEngine(snapshot);setTimeout(function(){drawAffiliateStatus(snapshot)},0)}}catch(e){}
})();</script>`}

async function decorateAnalytics(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  html=html.replace(/<section class="widget" data-widget="northstar"[\s\S]*?<\/section>\s*/i,'');
  html=html.replace(/data-widget="traffic-truth" style="--w:[^;]+;--h:[^"]+"/i,'data-widget="traffic-truth" style="--w:12;--h:7"');
  if(!html.includes('data-toolscout-command-truth="1"'))html=html.replace(/<\/body>/i,consolidatedScript()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-truth-health')return Response.json({ok:true,service:'toolscout-command-center-truth',version:1,canonicalCommercialTruth:'D1 browser-confirmed',northStar:'removed_as_redundant',trafficTruth:'consolidated'},{headers:JSON_H});
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')response=await consolidateStats(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))response=await decorateAnalytics(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
