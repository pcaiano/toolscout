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
  if(data.affiliateCoverageStatus&&Array.isArray(audit.outboundByTool)){
    const byTool=new Map(audit.outboundByTool.map(x=>[String(x.tool_slug||''),{outbound:Number(x.humanOutbound||0),monetized:Number(x.monetizedOutbound||0)}]));
    const syncGroup=group=>{
      const items=(Array.isArray(group?.items)?group.items:[]).map(item=>{const t=byTool.get(String(item.slug||''))||{outbound:0,monetized:0};return {...item,clicks30d:t.outbound,monetizedClicks30d:t.monetized}});
      return {...(group||{}),count:items.length,clicks30d:items.reduce((s,x)=>s+Number(x.clicks30d||0),0),monetizedClicks30d:items.reduce((s,x)=>s+Number(x.monetizedClicks30d||0),0),items};
    };
    data.affiliateCoverageStatus={...data.affiliateCoverageStatus,trafficTruth:'first_party_verified_navigation',clickDefinition:'First-party verified /go/ outbound navigation only. Pre-integrity clicks are diagnostic only.',humanOutbound30d:out.humanOutbound,monetizedOutbound30d:out.monetizedOutbound,unmonetizedOutbound30d:out.unmonetizedOutbound,weightedCoverage:out.weightedCoverage,active:syncGroup(data.affiliateCoverageStatus.active),pending:syncGroup(data.affiliateCoverageStatus.pending),rejected:syncGroup(data.affiliateCoverageStatus.rejected)};
  }

  const gsc=audit.sources?.gsc||{status:'unknown',generated_at:null},ga4=audit.sources?.ga4||{status:'unknown',generated_at:null};
  data.growthOps=data.growthOps||{};
  data.growthOps.engines=data.growthOps.engines||{};
  data.growthOps.health=data.growthOps.health||{};

  const canonicalEngines=data.commandCenterIntegrity?.engines||audit.engines||{};
  for(const key of ['distribution','affiliate']){
    if(canonicalEngines[key])data.growthOps.engines[key]={...(data.growthOps.engines[key]||{}),...canonicalEngines[key]};
  }
  for(const key of ['content','audience']){
    if(canonicalEngines[key])data.growthOps.health[key]={...(data.growthOps.health[key]||{}),...canonicalEngines[key]};
  }

  const gscHours=gsc.age_minutes!=null?Math.round(gsc.age_minutes/60):null,ga4Hours=ga4.age_minutes!=null?Math.round(ga4.age_minutes/60):null;
  data.growthOps.health.seo_geo_aio={
    status:statusFromSource(gsc),
    last_event_at:gsc.generated_at||null,
    detail:`GSC: ${gsc.status||'unknown'}${gscHours!=null?` (${gscHours}h old)`:''}. GA4: ${ga4.status||'unknown'}${ga4Hours!=null?` (${ga4Hours}h old)`:''}.`
  };

  const rawIssues=[...((data.growthOps.health.issues)||[])];
  const normalized=[];
  const seen=new Set();
  for(const issue of rawIssues){
    if(!issue||typeof issue!=='object')continue;
    const metric=String(issue.metric||'').trim(),engine=String(issue.engine||'').trim(),reason=String(issue.reason||'').trim(),detail=String(issue.detail||'').trim(),title=String(issue.title||issue.code||'').trim();
    let item=null;
    if(metric==='gsc'){
      item={engine:'SEO / GEO / AIO',metric,title:'GSC data refresh overdue',detail:gscHours!=null?`Imported GSC evidence is ${gscHours}h old. Refresh the GSC snapshot before treating search visibility as current.`:'Current GSC freshness evidence is unavailable.',severity:'warning',reason:reason||gsc.status||'stale'};
    }else if(metric==='ga4'){
      item={engine:'SEO / GEO / AIO',metric,title:'GA4 freshness unavailable',detail:ga4Hours!=null?`Imported GA4 evidence is ${ga4Hours}h old.`:'No current GA4 freshness evidence is available.',severity:'warning',reason:reason||ga4.status||'unknown'};
    }else if(metric.startsWith('engine:')){
      const key=metric.slice(7),health=canonicalEngines[key]||{},label=key==='content'?'Content Engine':key==='audience'?'Audience Engine':key==='affiliate'?'Affiliate Coverage Engine':key==='distribution'?'Distribution Engine':key;
      const missing=Array.isArray(health.missing_stages)&&health.missing_stages.length?` Missing: ${health.missing_stages.join(', ')}.`:'';
      item={engine:label,metric,title:`${label} ${health.status||reason||'warning'}`,detail:`${health.detail||health.proof||'Operational evidence requires attention.'}${missing}`.trim(),severity:issue.severity||'warning',reason:reason||health.status||'warning'};
    }else if(engine||metric||title||reason||detail){
      item={...issue,engine:engine||metric||'System',title:title||reason||'Operational warning',detail:detail||reason||'No additional detail supplied.'};
    }
    if(!item)continue;
    const key=[item.engine,item.metric,item.title,item.detail,item.severity].join('|');
    if(seen.has(key))continue;
    seen.add(key);normalized.push(item);
  }
  data.growthOps.health.issues=normalized;

  if(data.growthOps.footprint?.search){
    const s=data.growthOps.footprint.search;
    s.freshness=gsc.status||'unknown';
    s.generated_at=gsc.generated_at||s.generated_at||null;
    s.note=`${s.note||''} Snapshot freshness: ${gsc.status||'unknown'}${gsc.generated_at?` (${gsc.generated_at})`:''}.`.trim();
  }
  return data;
}

const UI_INTEGRITY=`<script>
(function(){
  const fmtCount=v=>v===null||v===undefined||v===''?'Unavailable':Number.isFinite(Number(v))?Number(v).toLocaleString():'Unavailable';
  const statusLabel=s=>({healthy:'Healthy',running:'Running',completed:'Completed',observed:'Observed',partial:'Partial',degraded:'Degraded',failed:'Failed',stale:'Stale',unknown:'Unknown',unavailable:'Unavailable',warning:'Warning',no_evidence:'No evidence'}[String(s||'').toLowerCase()]||s||'Unknown');
  const when=x=>x&&x.last_completed_at||x&&x.last_run_at||x&&x.last_event_at||x&&x.last_activity_at||null;
  const proof=x=>{if(!x)return'';const bits=[];if(x.detail)bits.push(x.detail);else if(x.proof)bits.push(x.proof);if(Array.isArray(x.missing_stages)&&x.missing_stages.length)bits.push('Missing: '+x.missing_stages.join(', '));if(when(x))bits.push('Last evidence '+dt(when(x)));return bits.join(' | ')};
  const auditIssues=d=>{const h=d.growthOps&&d.growthOps.health||{};return Array.isArray(h.issues)?h.issues.filter(x=>x&&(x.engine||x.metric||x.title||x.reason||x.detail)):[]};
  const healthRow=(name,value,meta='')=>'<div class="row"><div><div class="rowName">'+esc(name)+'</div>'+(meta?'<div class="rowMeta">'+esc(meta)+'</div>':'')+'</div><div class="rowValue">'+esc(value)+'</div></div>';
  const issueHtml=x=>{const sev=x.severity==='warning'?'warning':'',name=x.engine||x.metric||'System',title=x.title||x.code||x.reason||'Operational warning',detail=x.detail||x.reason||'No additional detail supplied.';return '<div class="bug '+sev+'"><b>'+(x.severity==='warning'?'Warning':'Engine bug')+' | '+esc(name)+':</b> '+esc(title)+(detail&&detail!==title?' | '+esc(detail):'')+'</div>'};

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
    let html=healthRow('Tracking',statusLabel(tr.status),fmtCount(tr.humanSessionsLast24Hours)+' human sessions | 24h')+
      healthRow('Affiliate Coverage Engine',statusLabel(aff.status),proof(aff)||'No canonical engine evidence recorded.')+
      healthRow('Distribution Engine',statusLabel(dist.status),proof(dist)||'No canonical engine evidence recorded.')+
      healthRow('Content Engine',statusLabel(content.status),proof(content)||'No canonical publication heartbeat recorded.')+
      healthRow('Audience Engine',statusLabel(audience.status),proof(audience)||'No canonical audience heartbeat recorded.')+
      healthRow('SEO / GEO / AIO',statusLabel(seo.status),(seo.detail||'No current search analytics freshness evidence.')+(seo.last_event_at?' | Last evidence '+dt(seo.last_event_at):''))+
      healthRow('Broken Chairman links',fmtCount(broken),broken?'Detailed below; suppressed from action queue':'None detected');
    if(issues.length)html+=issues.map(issueHtml).join('');
    document.getElementById('healthBody').innerHTML=html;
  };

  const priorDetailFor=detailFor;
  detailFor=function(id){
    if(id!=='health')return priorDetailFor(id);
    if(!snapshot)return;
    const g=snapshot.growthOps||{},h=g.health||{},eng=g.engines||{},issues=auditIssues(snapshot),content=h.content||{},audience=h.audience||{},seo=h.seo_geo_aio||{};
    let html=healthRow('Affiliate Coverage Engine',statusLabel(eng.affiliate&&eng.affiliate.status),proof(eng.affiliate||{}))+healthRow('Distribution Engine',statusLabel(eng.distribution&&eng.distribution.status),proof(eng.distribution||{}))+healthRow('Content Engine',statusLabel(content.status),proof(content))+healthRow('Audience Engine',statusLabel(audience.status),proof(audience))+healthRow('SEO / GEO / AIO',statusLabel(seo.status),seo.detail||'');
    html+=issues.length?issues.map(x=>healthRow(x.engine||x.metric||'System',x.severity||'issue',x.detail||x.reason||x.title||x.code||'')).join(''):'<div class="note">No engine-health issues detected in this snapshot.</div>';
    modalRows('Engine & Data Health','NO SILENT FAILURES',html);
  };

  const priorRender=render;
  render=function(d){priorRender(d);renderHealth(d);const a=d.measurementAudit||{},state=statusLabel(a.status||'unknown');statusEl.innerHTML='<strong>Updated '+esc(new Date().toLocaleString(undefined,{timeZone:'Europe/Lisbon'}))+'.</strong> Integrity: '+esc(state)+'. Values marked Unavailable are not zero.';};
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
