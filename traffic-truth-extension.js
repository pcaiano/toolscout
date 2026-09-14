async function assetJson(request,env,path,fallback){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}
}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function hoursOld(value){const t=Date.parse(String(value||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):null}
function dateEnd(value){const t=Date.parse(`${String(value||'')}T23:59:59Z`);return Number.isFinite(t)?t:0}

export async function augmentTrafficTruthStats(data,request,env){
  const [legacy,external]=await Promise.all([
    assetJson(request,env,'/data/traffic-truth.json',{status:'unavailable'}),
    assetJson(request,env,'/data/external-analytics-truth.json',{status:'unavailable'})
  ]);
  const tracking=data?.tracking||{},traffic=data?.traffic||{},funnel=data?.funnel||{},commercial=data?.commercial||{};
  const d1={
    status:'live',
    metric:'browser-confirmed likely-human sessions',
    last24:n(tracking.humanSessionsLast24Hours),
    today:n(traffic.today),
    monthToDate:n(traffic.monthToDate),
    dailyAverageMTD:Number.isFinite(Number(traffic.dailyAverageMTD))?Number(traffic.dailyAverageMTD):null,
    projectedMonth:n(traffic.projectedMonth),
    humanOutbound:n(funnel.outboundClicks||commercial?.totals?.outbound),
    monetizedOutbound:n(commercial?.totals?.monetizedOutbound||commercial?.monetizedOutbound)
  };
  const ga4=external?.ga4||{status:'unavailable'},gsc=external?.gsc||legacy?.googleSearchConsole||{status:'unavailable'};
  const externalAge=hoursOld(external?.generatedAt);
  const launchAt=Date.parse(String(ga4?.installedAt||''));
  const settledEnd=dateEnd(ga4?.settled28d?.endDate);
  const hasSettledPostLaunch=Number.isFinite(launchAt)&&launchAt>0&&settledEnd>=launchAt;
  const checks=[];
  let status='healthy',note='First-party operations, consent analytics and search visibility are available as separate truth layers.';
  if(!external?.generatedAt||externalAge===null){status='unavailable';note='External analytics snapshot is unavailable.';}
  else if(externalAge>36){status='stale';note='GA4 and GSC snapshot is older than 36 hours. D1 remains live, but external validation is stale.';}
  else if(ga4.status==='warming_up'||!hasSettledPostLaunch){status='warming_up';note='GA4 launched after the current settled reporting window. D1 is live; GA4 validation is collecting its first comparable data.';}
  const gscClicks=n(gsc?.clicks),googleSessions=n(ga4?.settled28d?.googleOrganicSessions);
  if(status==='healthy'&&gscClicks>=3&&googleSessions===0){status='warning';note='GSC reports Google Search clicks but GA4 reports no Google organic sessions in the comparable settled window.';}
  checks.push({id:'d1-primary',state:'healthy',label:'D1 operational truth',detail:'Browser-confirmed likely-human sessions and outbound monetization remain primary.'});
  checks.push({id:'ga4-readiness',state:ga4.status==='warming_up'||!hasSettledPostLaunch?'warming_up':ga4.status||'unavailable',label:'GA4 consent audit',detail:ga4.note||'Consent-based acquisition and engagement validation.'});
  checks.push({id:'gsc-search',state:gsc.status==='observed'?'healthy':gsc.status||'unavailable',label:'GSC search truth',detail:`${gscClicks} clicks and ${n(gsc?.impressions)} impressions in the settled window.`});
  checks.push({id:'gsc-ga4-organic',state:!hasSettledPostLaunch?'warming_up':(gscClicks>=3&&googleSessions===0?'warning':'healthy'),label:'Google click to session bridge',detail:!hasSettledPostLaunch?'Waiting for a settled GA4 window after launch.':`${gscClicks} GSC clicks versus ${googleSessions} GA4 Google organic sessions.`});
  const reconciliation={status,note,generatedAt:new Date().toISOString(),externalGeneratedAt:external?.generatedAt||null,externalAgeHours:externalAge,hasSettledPostLaunchData:hasSettledPostLaunch,checks};
  const truth={...legacy,version:2,generatedAt:new Date().toISOString(),primaryMetric:'D1 browser-confirmed likely-human sessions',d1,ga4,googleSearchConsole:gsc,reconciliation,status:'observed'};
  return {...data,trafficTruth:truth,trafficIntegrity:{...(data?.trafficIntegrity||{}),crossSourceStatus:status,d1Status:'live',ga4Status:ga4.status||'unavailable',googleSearchConsoleStatus:gsc.status||'unavailable',externalSnapshotAgeHours:externalAge,truthGeneratedAt:truth.generatedAt}};
}

function widget(){
  return `<section class="widget" data-widget="traffic-truth" style="--w:8;--h:5"><div class="widgetHead"><div><div class="widgetKicker">D1 + GA4 + GSC</div><div class="widgetTitle">Traffic Truth</div></div><div class="widgetMeta" id="trafficTruthMeta">Cross-source audit</div></div><div class="widgetBody" id="trafficTruthBody"><div class="empty">Refresh to reconcile traffic sources.</div></div><div class="resizeHandle"></div></section>`;
}
function script(){
  return `<script>(function(){function stateClass(s){return s==='healthy'?'good':s==='warning'||s==='stale'?'warn':s==='unavailable'?'bad':'info'}function checkRow(x){return '<div class="row"><div><div class="rowName">'+esc(x.label||'Check')+'</div><div class="rowMeta">'+esc(x.detail||'')+'</div></div><div class="rowValue">'+pill(x.state||'unknown',stateClass(x.state))+'</div></div>'}function renderTrafficTruth(d){const t=d?.trafficTruth||{},r=t.reconciliation||{},d1=t.d1||{},g=t.ga4||{},s=t.googleSearchConsole||{},root=document.getElementById('trafficTruthBody'),meta=document.getElementById('trafficTruthMeta');if(!root)return;if(meta)meta.innerHTML=pill(r.status||'unavailable',stateClass(r.status));const gt=g.today||{};root.innerHTML='<div class="metricGrid">'+metric('D1 human sessions 24h',num(d1.last24||0),'Live first-party')+metric('D1 human sessions MTD',num(d1.monthToDate||0),'Live first-party')+metric('GA4 sessions today',num(gt.sessions||0),g.consentBased?'Consent-based':'Analytics')+metric('GA4 engagement today',pct(Number(gt.engagementRate||0)*100),'Consent-based')+metric('GSC clicks 28d',num(s.clicks||0),(s.startDate||'')+' to '+(s.endDate||''))+metric('GSC impressions 28d',num(s.impressions||0),'Settled search data')+metric('Human outbound',num(d1.humanOutbound||0),'D1 operational')+metric('Monetized outbound',num(d1.monetizedOutbound||0),'D1 operational')+'</div><div class="note" style="margin-top:10px">'+esc(r.note||'')+'</div><div style="margin-top:8px">'+(r.checks||[]).map(checkRow).join('')+'</div>'}const original=window.render;if(typeof original==='function')window.render=function(d){original(d);renderTrafficTruth(d)};const grid=document.getElementById('grid');if(grid)grid.addEventListener('click',function(e){const w=e.target.closest('.widget[data-widget="traffic-truth"]');if(!w||e.target.closest('a,button,.resizeHandle'))return;const t=(typeof snapshot!=='undefined'?snapshot:{})?.trafficTruth||{},r=t.reconciliation||{},d1=t.d1||{},g=t.ga4||{},s=t.googleSearchConsole||{};modalRows('Traffic Truth','D1 + GA4 + GSC',row('Reconciliation',r.status||'unavailable',r.note||'')+row('D1 24h',num(d1.last24||0),'Primary operational truth')+row('GA4 today',num(g.today?.sessions||0),'Consent-based sessions')+row('GSC clicks',num(s.clicks||0),(s.startDate||'')+' to '+(s.endDate||''))+row('GSC impressions',num(s.impressions||0),'Search source of truth')+row('External snapshot',r.externalGeneratedAt?dt(r.externalGeneratedAt):'Unavailable',r.externalAgeHours==null?'':Number(r.externalAgeHours).toFixed(1)+' hours old')+(r.checks||[]).map(x=>row(x.label,x.state,x.detail)).join(''))})})();</script>`;
}
export async function decorateTrafficTruthPage(response){
  if(!response.ok||!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  let html=await response.text();
  const anchor='<section class="widget" data-widget="northstar"';
  if(!html.includes('data-widget="traffic-truth"'))html=html.replace(anchor,widget()+'\n\n    '+anchor);
  if(!html.includes('renderTrafficTruth'))html=html.replace('</body>',script()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
