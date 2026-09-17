import base from './mission-integrity-v2-worker.js';

function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/analytics-v2'||path==='/analytics-v2/'||path==='/analytics-v2.html'}
function statsPath(path){return path==='/api/stats'||path==='/analytics/api/stats'}
function statusFromSource(source){const s=String(source?.status||'unknown');return s==='fresh'?'observed':s}

function normalizeStats(data){
  const audit=data?.measurementAudit;
  if(!audit)return data;
  const sessions=audit.sessions||{},out=audit.outbound||{},definition='Browser Guard allowed sessions plus first-party verified outbound navigation. Unavailable means unavailable, never zero.';
  data.tracking={...(data.tracking||{}),status:sessions.status,humanSessionsLast24Hours:sessions.last24,definition};
  data.funnel={...(data.funnel||{}),outboundClicks:out.humanOutbound,sessionToOutboundCtr:null,definition};
  data.commercial={...(data.commercial||{}),monetizedOutbound:out.monetizedOutbound,totals:{...(data.commercial?.totals||{}),outbound:out.humanOutbound,monetizedOutbound:out.monetizedOutbound},trafficDefinition:definition};
  const gsc=audit.sources?.gsc||{status:'unknown',generated_at:null},ga4=audit.sources?.ga4||{status:'unknown',generated_at:null};
  data.growthOps=data.growthOps||{};data.growthOps.health=data.growthOps.health||{};
  data.growthOps.health.seo_geo_aio={status:statusFromSource(gsc),last_event_at:gsc.generated_at||null,detail:`GSC source is ${gsc.status||'unknown'}${gsc.age_minutes!=null?` (${Math.round(gsc.age_minutes/60)}h old)`:''}. GA4 source is ${ga4.status||'unknown'}${ga4.age_minutes!=null?` (${Math.round(ga4.age_minutes/60)}h old)`:''}.`};
  if(data.growthOps.footprint?.search){const s=data.growthOps.footprint.search;s.freshness=gsc.status||'unknown';s.generated_at=gsc.generated_at||s.generated_at||null;s.note=`${s.note||''} Snapshot freshness: ${gsc.status||'unknown'}${gsc.generated_at?` (${gsc.generated_at})`:''}.`.trim()}
  return data;
}

const UI_INTEGRITY=`<script>
(function(){
  const fmtCount=v=>v===null||v===undefined||v===''?'Unavailable':Number.isFinite(Number(v))?Number(v).toLocaleString():'Unavailable';
  const statusLabel=s=>({healthy:'Healthy',running:'Running',completed:'Completed',observed:'Observed',partial:'Partial',degraded:'Degraded',failed:'Failed',stale:'Stale',unknown:'Unknown',unavailable:'Unavailable',warning:'Warning',no_evidence:'No evidence'}[String(s||'').toLowerCase()]||s||'Unknown');
  const when=x=>x&&x.last_completed_at||x&&x.last_run_at||x&&x.last_event_at||x&&x.last_activity_at||null;
  const proof=x=>{if(!x)return'';const bits=[];if(x.proof)bits.push(x.proof);else if(x.detail)bits.push(x.detail);if(Array.isArray(x.missing_stages)&&x.missing_stages.length)bits.push('Missing: '+x.missing_stages.join(', '));if(when(x))bits.push(dt(when(x)));return bits.join(' | ')};
  const auditIssues=d=>{const h=d.growthOps&&d.growthOps.health||{};return Array.isArray(h.issues)?h.issues:[]};
  const issueHtml=x=>{const sev=x.severity==='warning'?'warning':'',name=x.engine||x.metric||'system',title=x.title||x.code||x.reason||'issue',detail=x.detail||x.reason||'';return '<div class="bug '+sev+'"><b>'+(x.severity==='warning'?'Warning':'Engine bug')+' | '+esc(name)+':</b> '+esc(title)+(detail&&detail!==title?' | '+esc(detail):'')+'</div>'};

  renderNorthStar=function(d){
    const r=d.revenue||{},ac=d.affiliateCoverage||{},tr=d.tracking||{},t=d.traffic||{},canon=d.canonicalCommercialTruth||{},out=canon.humanOutbound??ac.humanOutboundClicks??null,mon=canon.monetizedOutbound??ac.monetizedLikelyHumanClicks??null;
    const mtdDaily=first(t.dailyAverageMTD);
    document.getElementById('northstarBody').innerHTML='<div class="metricGrid">'+
      metric('Human sessions | 24h',fmtCount(tr.humanSessionsLast24Hours),'Rolling last 24 hours')+
      metric('Avg human sessions / day | MTD',mtdDaily===null?'Unavailable':Number(mtdDaily).toFixed(1),'Month-to-date daily average')+
      metric('Human sessions | today',fmtCount(t.today),'Since 00:00 Europe/Lisbon')+
      metric('Human outbound',fmtCount(out),'First-party verified navigation')+
      metric('Monetized outbound',fmtCount(mon),mon===null||out===null?'Unavailable, not zero':pct(out?mon/out*100:0)+' of human outbound')+
      metric('Confirmed revenue',r.confirmedRevenue==null?'Unknown':money(r.confirmedRevenue,r.currency),r.reportingStatus==='connected'?'Vendor evidence connected':'No confirmed vendor evidence')+
      metric('Human sessions | MTD',fmtCount(t.monthToDate),'Total month-to-date')+
      metric('Month projection',fmtCount(t.projectedMonth),'Human sessions | current pace')+
    '</div>';
  };

  renderDistribution=function(d){
    const x=d.growthOps&&d.growthOps.engines&&d.growthOps.engines.distribution||{},last=when(x),success=x.events_24h?x.successful_24h/x.events_24h*100:null;
    document.getElementById('distributionMeta').textContent=statusLabel(x.status)+(last?' | '+dt(last):'');
    document.getElementById('distributionBody').innerHTML='<div class="metricGrid">'+
      metric('Actions | 24h',fmtCount(x.events_24h),success===null?'No comparable action total':pct(success)+' successful')+
      metric('Failed | 24h',fmtCount(x.failed_24h),'Failures must surface')+
      metric('Human sessions | 30d',fmtCount(x.attributed_human_sessions_30d),'Attributed to distribution')+
      metric('Monetized outbound | 30d',fmtCount(x.attributed_monetized_outbound_30d),fmtCount(x.attributed_outbound_30d)+' total outbound')+
      '</div><div class="note" style="margin-top:9px">Status proof: '+esc(proof(x)||'No canonical proof recorded.')+'</div><div style="margin-top:10px">'+stateEntries(x.opportunity_status).slice(0,7).map(([k,v])=>row(k,fmtCount(v),'distribution opportunities')).join('')+'</div>';
  };

  renderAffiliate=function(d){
    const x=d.growthOps&&d.growthOps.engines&&d.growthOps.engines.affiliate||{},last=when(x),cov=x.weighted_coverage_pct;
    document.getElementById('affiliateMeta').textContent=statusLabel(x.status)+(last?' | '+dt(last):'');
    document.getElementById('affiliateBody').innerHTML='<div class="metricGrid">'+
      metric('Weighted coverage',pct(cov),x.coverage_change_7d_pp==null?'7d comparison unavailable':(x.coverage_change_7d_pp>=0?'+':'')+x.coverage_change_7d_pp.toFixed(1)+' pp / 7d')+
      metric('Monetized outbound | 30d',fmtCount(x.monetized_outbound_30d),fmtCount(x.human_outbound_30d)+' human outbound')+
      metric('Revenue leakage | 30d',fmtCount(x.unmonetized_outbound_30d),'Human outbound not monetized')+
      metric('Recoverable queue',fmtCount(x.recoverable_queue),'Demand-prioritized candidates')+
      '</div><div class="progress"><i style="width:'+Math.max(0,Math.min(100,Number(cov||0)))+'%"></i></div><div class="note">Status proof: '+esc(proof(x)||'No canonical proof recorded.')+'</div><div style="margin-top:8px">'+stateEntries(x.workflow_status).slice(0,7).map(([k,v])=>row(k,fmtCount(v),'affiliate tools')).join('')+'</div>';
  };

  renderFootprint=function(d){
    const f=d.growthOps&&d.growthOps.footprint||{},s=f.search||{},dist=f.distribution||{},fresh=s.freshness||d.measurementAudit&&d.measurementAudit.sources&&d.measurementAudit.sources.gsc&&d.measurementAudit.sources.gsc.status||'unknown';
    document.getElementById('footprintBody').innerHTML='<div class="metricGrid">'+
      metric('Google observed pages',fmtCount(s.observed_pages),fmtCount(s.impressions)+' impressions | '+statusLabel(fresh))+
      metric('Sitemap URLs',fmtCount(s.sitemap_urls),'Published crawlable inventory')+
      metric('Live / verified surfaces',fmtCount(dist.live_verified),'Externally verified distribution')+
      metric('Submitted / pending',fmtCount(dist.submitted_pending),'Awaiting external outcome')+
      '</div><div class="note" style="margin-top:9px">'+esc(s.note||'Search visibility evidence is not a complete index count.')+'</div><div style="margin-top:8px">'+(dist.surfaces||[]).slice(0,8).map(x=>row(x.name||x.slug,x.status,(x.type||'surface')+(x.url?' | URL recorded':''))).join('')+'</div>';
  };

  renderHealth=function(d){
    const tr=d.tracking||{},g=d.growthOps||{},q=g.chairmanQueue||{},eng=g.engines||{},h=g.health||{},issues=auditIssues(d),broken=(q.broken_links||[]).length;
    const dist=eng.distribution||{},aff=eng.affiliate||{},content=h.content||{},audience=h.audience||{},seo=h.seo_geo_aio||{};
    let html=row('Tracking',statusLabel(tr.status),fmtCount(tr.humanSessionsLast24Hours)+' human sessions | 24h')+
      row('Affiliate Coverage Engine',statusLabel(aff.status),proof(aff))+
      row('Distribution Engine',statusLabel(dist.status),proof(dist))+
      row('Content Engine',statusLabel(content.status),proof(content))+
      row('Audience Engine',statusLabel(audience.status),proof(audience))+
      row('SEO / GEO / AIO',statusLabel(seo.status),(seo.detail||'')+(seo.last_event_at?' | '+dt(seo.last_event_at):''))+
      row('Broken Chairman links',fmtCount(broken),broken?'Detailed below; suppressed from action queue':'None detected');
    if(issues.length)html+=issues.map(issueHtml).join('');
    document.getElementById('healthBody').innerHTML=html;
  };

  const priorDetailFor=detailFor;
  detailFor=function(id){
    if(id!=='health')return priorDetailFor(id);
    if(!snapshot)return;
    const g=snapshot.growthOps||{},h=g.health||{},eng=g.engines||{},issues=auditIssues(snapshot),content=h.content||{},audience=h.audience||{},seo=h.seo_geo_aio||{};
    let html=row('Affiliate Coverage Engine',statusLabel(eng.affiliate&&eng.affiliate.status),proof(eng.affiliate||{}))+row('Distribution Engine',statusLabel(eng.distribution&&eng.distribution.status),proof(eng.distribution||{}))+row('Content Engine',statusLabel(content.status),proof(content))+row('Audience Engine',statusLabel(audience.status),proof(audience))+row('SEO / GEO / AIO',statusLabel(seo.status),seo.detail||'');
    html+=issues.length?issues.map(x=>row(x.engine||x.metric||'system',x.severity||'issue',x.detail||x.reason||x.title||x.code||'')).join(''):'<div class="note">No engine-health issues detected in this snapshot.</div>';
    modalRows('Engine & Data Health','NO SILENT FAILURES',html);
  };

  const priorRender=render;
  render=function(d){priorRender(d);const a=d.measurementAudit||{},state=statusLabel(a.status||'unknown');statusEl.innerHTML='<strong>Updated '+esc(new Date().toLocaleString(undefined,{timeZone:'Europe/Lisbon'}))+'.</strong> Integrity: '+esc(state)+'. Values marked Unavailable are not zero.';};
})();
</script>`;

async function normalizeJsonResponse(response){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  data=normalizeStats(data);
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

async function injectUi(response){
  if(!response.ok||!(response.headers.get('Content-Type')||'').toLowerCase().includes('text/html'))return response;
  let html=await response.text();html=html.includes('</body>')?html.replace('</body>',UI_INTEGRITY+'</body>'):html+UI_INTEGRITY;
  const headers=new Headers(response.headers);headers.set('Content-Type','text/html; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){const url=new URL(request.url);const response=await base.fetch(request,env,ctx);if(request.method==='GET'&&statsPath(url.pathname))return normalizeJsonResponse(response);if(request.method==='GET'&&analyticsPath(url.pathname))return injectUi(response);return response},
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
