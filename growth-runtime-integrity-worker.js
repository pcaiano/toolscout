import base from './command-center-light-theme-worker.js';
import {runAutonomousDistributionCycle} from './distribution-autonomous-worker.js';
import {runDistributionNetworkCycle} from './distribution-network-worker.js';
import {runWithLedger} from './engine-run-ledger.js';

const AUTHORITY_ATTEMPT_MIN_24H=6;
const AUTHORITY_REFERRING_DOMAIN_FLOOR=10;
const RECOVERY_COOLDOWN_MINUTES=90;

const UI_REPAIR=`<style id="toolscout-runtime-integrity-style">
.tsRuntimeHealth{border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:12px 13px;margin-top:10px}
.tsRuntimeHealthHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.tsRuntimeHealthHead b{font-size:12px}.tsRuntimeHealthHead span{font-size:9px;color:var(--muted)}
.tsRuntimeGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:9px}
.tsRuntimeMetric{border:1px solid var(--line);background:var(--card);border-radius:11px;padding:9px;min-width:0}
.tsRuntimeMetric small{display:block;font-size:8px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:800}
.tsRuntimeMetric b{display:block;font-size:18px;margin-top:4px}
.tsRuntimeList{margin-top:10px;border-top:1px solid var(--line);padding-top:8px}
.tsRuntimeAction{padding:7px 0;border-bottom:1px solid var(--line)}
.tsRuntimeAction:last-child{border-bottom:0}
.tsRuntimeAction b{display:block;font-size:10px}.tsRuntimeAction span{display:block;font-size:9px;color:var(--muted);margin-top:2px;line-height:1.35}
@media(max-width:720px){.tsRuntimeGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style><script id="toolscout-runtime-integrity-ui">(function(){
if(window.__toolscoutRuntimeIntegrity)return;window.__toolscoutRuntimeIntegrity=true;
var latest=null,busy=false;
function num(v){var x=Number(v);return Number.isFinite(x)?x:0}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
function dt(v){try{return v?new Date(v).toLocaleString(undefined,{timeZone:'Europe/Lisbon'}):'—'}catch(e){return String(v||'—')}}
function metric(label,value,meta){return '<div class="tsRuntimeMetric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(meta||'')+'</span></div>'}
function renderGsc(d){
 var root=document.getElementById('googleSearchRealityBody'),meta=document.getElementById('googleSearchRealityMeta');if(!root)return;
 var x=d&&d.growthOps&&d.growthOps.googleSearchReality;if(!x||!x.generatedAt)return;
 var p=x.searchPerformance||{},w=p.window28d||{},r=p.recent7||{},idx=x.indexHealth||{},ops=Array.isArray(x.opportunities)?x.opportunities:[];
 if(meta)meta.textContent='Updated '+dt(x.generatedAt);
 root.innerHTML='<div class="tsRuntimeGrid">'+
  metric('Impressions, 28d',num(w.impressions).toLocaleString(),'Google Search Console')+
  metric('Clicks, 28d',num(w.clicks).toLocaleString(),'CTR '+num(w.ctr).toFixed(3)+'%')+
  metric('Impressions, 7d',num(r.impressions).toLocaleString(),'Clicks '+num(r.clicks))+
  metric('Indexed',num(idx.indexed)+' / '+num(idx.inspected),'Inspected canonical URLs')+
 '</div><div class="tsRuntimeHealth"><div class="tsRuntimeHealthHead"><b>Current Google evidence</b><span>'+esc(x.source||'Google Search Console')+'</span></div>'+
 '<div style="font-size:10px;color:var(--muted);line-height:1.45;margin-top:6px">Index recovery: '+num(idx.indexRecoveryCandidates)+' · discovered not indexed: '+num(idx.discoveredNotIndexed)+' · unknown to Google: '+num(idx.unknownToGoogle)+'.</div>'+
 (ops.length?'<div class="tsRuntimeList">'+ops.slice(0,6).map(function(o){return '<div class="tsRuntimeAction"><b>'+esc(o.page||o.url||o.kind)+'</b><span>'+esc(String(o.action||o.kind||'measure').replaceAll('_',' '))+' · '+num(o.impressions)+' imp. · pos '+num(o.position).toFixed(1)+'</span></div>'}).join('')+'</div>':'')+
 '</div>';
}
function renderAuthority(d){
 var a=d&&d.growthOps&&d.growthOps.autonomousGrowth;if(!a)return;
 var widget=document.querySelector('[data-widget="autonomous-growth"]');if(!widget)return;
 var body=widget.querySelector('.widgetBody')||widget;var old=document.getElementById('tsAuthorityExecution');if(old)old.remove();
 var ax=a.authority_execution||{},status=ax.status||a.authority_execution_status||(num(a.backlink_attempts_24h)<num(a.backlink_attempt_min_24h||6)?'underpowered':'executing');
 var items=Array.isArray(a.external_execution_items)?a.external_execution_items.filter(function(x){return x&&x.engine==='distribution'}).slice(0,6):[];
 var html='<div class="tsRuntimeHealth" id="tsAuthorityExecution"><div class="tsRuntimeHealthHead"><b>Authority execution</b><span>'+esc(status)+'</span></div><div class="tsRuntimeGrid">'+
  metric('Referring domains',num(ax.verifiedReferringDomains!=null?ax.verifiedReferringDomains:a.verified_referring_domains)+' / '+num(ax.bootstrapFloor||a.backlink_bootstrap_floor||10),'Verified')+
  metric('Attempts, 24h',num(ax.attempts24!=null?ax.attempts24:a.backlink_attempts_24h),'Minimum '+num(ax.attemptMin24h||a.backlink_attempt_min_24h||6))+
  metric('Authority queue',num(ax.queue!=null?ax.queue:a.backlink_authority_queue),'Execution contract')+
  metric('External actions, 24h',num(a.supervisor_external_executions_24h),'Acquisition throughput')+
 '</div>'+
 '<div style="font-size:10px;color:var(--muted);line-height:1.45;margin-top:8px">'+esc(ax.detail||(status==='failed'?'Authority work is queued but produced no external attempt in the last 24h. This is an execution failure, not a discovery success.':'Authority execution is measured from real external attempts and verified placements.'))+'</div>'+
 (items.length?'<div class="tsRuntimeList">'+items.map(function(x){return '<div class="tsRuntimeAction"><b>'+esc(x.label||x.type||'Distribution action')+'</b><span>'+esc(x.status||'')+' · '+dt(x.at)+(x.detail?' · '+esc(x.detail):'')+'</span></div>'}).join('')+'</div>':'<div class="tsRuntimeList"><div class="tsRuntimeAction"><b>No recent executed authority action</b><span>Queued opportunities are not presented as execution.</span></div></div>')+
 '</div>';
 body.insertAdjacentHTML('beforeend',html);
}
async function load(){
 if(busy)return;busy=true;
 try{
  var r=await fetch('/analytics/api/stats',{credentials:'same-origin',cache:'no-store'});
  if(r.ok){latest=await r.json();renderGsc(latest);renderAuthority(latest)}
 }catch(e){}finally{busy=false}
}
function boot(){load();setTimeout(load,1200);setInterval(load,30000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`;

function jsonHeaders(response){
  const h=new Headers(response.headers);
  h.set('Content-Type','application/json; charset=UTF-8');
  h.set('Cache-Control','private, no-store, max-age=0');
  h.delete('Content-Length');h.delete('Content-Encoding');
  return h;
}
function htmlHeaders(response){
  const h=new Headers(response.headers);
  h.set('Content-Type','text/html; charset=UTF-8');
  h.set('Cache-Control','private, no-store, max-age=0');
  h.delete('Content-Length');h.delete('Content-Encoding');
  return h;
}
async function safeFirst(env,sql){try{return await env.DB.prepare(sql).first()}catch{return null}}
async function safeAll(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
async function assetJson(request,env,path,fallback=null){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}
}
async function authorityState(env){
  const [m,placements,lastActions]=await Promise.all([
    safeFirst(env,`SELECT
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-24 hours'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-24 hours')) attempts24,
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-7 days'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-7 days')) attempts7,
      (SELECT COUNT(*) FROM growth_execution_contract WHERE action IN ('backlink_reference_outreach','verify_backlink_acquisition','publisher_contact_discovery','execute_alternate_routes') AND status IN ('pending','claimed','attempted','deferred','stalled')) queue,
      (SELECT MAX(first_verified_at) FROM distribution_placements WHERE placement_verified=1 AND backlink_verified=1 AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')) last_verified_at,
      (SELECT MAX(started_at) FROM engine_runs WHERE engine='distribution' AND mission='authority_execution_recovery') last_recovery_at`),
    safeAll(env,`SELECT public_url FROM distribution_placements WHERE placement_verified=1 AND backlink_verified=1 AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')`),
    safeAll(env,`SELECT event_type,status,detail,created_at FROM distribution_events
      WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent','authority_execution_gap','authority_execution_recovered','autonomous_distribution_qualification','distribution_network_cycle')
      ORDER BY created_at DESC LIMIT 8`)
  ]);
  const domains=new Set();
  for(const row of placements){try{const h=new URL(String(row.public_url||'')).hostname.toLowerCase().replace(/^www\./,'');if(h&&h!=='trytoolscout.org'&&!h.endsWith('.trytoolscout.org'))domains.add(h)}catch{}}
  const attempts24=Number(m?.attempts24||0),attempts7=Number(m?.attempts7||0),queue=Number(m?.queue||0),verifiedReferringDomains=domains.size;
  const required=verifiedReferringDomains<AUTHORITY_REFERRING_DOMAIN_FLOOR;
  const throughputGap=required&&attempts24<AUTHORITY_ATTEMPT_MIN_24H;
  const status=required&&queue>0&&attempts24===0?'failed':throughputGap?'underpowered':required?'executing':'healthy';
  return {status,required,throughputGap,verifiedReferringDomains,bootstrapFloor:AUTHORITY_REFERRING_DOMAIN_FLOOR,attempts24,attempts7,attemptMin24h:AUTHORITY_ATTEMPT_MIN_24H,queue,lastVerifiedAt:m?.last_verified_at||null,lastRecoveryAt:m?.last_recovery_at||null,lastActions,detail:status==='failed'?'Authority work is queued but produced zero external attempts in 24h. Recovery must execute qualified work before expanding discovery.':status==='underpowered'?'Authority execution is below the minimum external-attempt floor.':'Authority execution is producing measurable external throughput.'};
}
async function systemHealth(env,authority){
  const rows=await safeAll(env,`SELECT engine,status,directive,strict_humans_24h,strict_humans_7d,external_executions_24h,external_executions_7d,last_evaluated_at FROM growth_supervisor_state WHERE engine IN ('growth_brain','distribution','content','audience','seo_geo_aio') ORDER BY engine`);
  const growth=rows.find(x=>x.engine==='growth_brain')||null;
  const strict24=Number(growth?.strict_humans_24h||0),exec24=Number(growth?.external_executions_24h||0);
  const status=(strict24<=2||authority.status==='failed')?'critical':(exec24<10||authority.status==='underpowered')?'underpowered':'operational';
  return {status,strictHumans24h:strict24,strictHumans7d:Number(growth?.strict_humans_7d||0),externalExecutions24h:exec24,externalExecutions7d:Number(growth?.external_executions_7d||0),authorityStatus:authority.status,engines:rows,localIncidentResolutionIsNotOverallHealth:true};
}
async function augmentStats(request,response,env){
  if(!response?.ok||(response.headers.get('Content-Type')||'').toLowerCase().indexOf('application/json')<0)return response;
  let data;try{data=await response.json()}catch{return response}
  data.growthOps=data.growthOps||{};
  if(!data.growthOps.googleSearchReality?.generatedAt){
    const gsc=await assetJson(request,env,'/data/gsc-search-reality.json',null);
    if(gsc?.generatedAt)data.growthOps.googleSearchReality=gsc;
  }
  const authority=await authorityState(env);
  const health=await systemHealth(env,authority);
  const prior=data.growthOps.autonomousGrowth||{};
  data.growthOps.autonomousGrowth={...prior,authority_execution:authority,authority_execution_status:authority.status,operational_health:health.status,backlink_attempts_24h:authority.attempts24,backlink_attempts_7d:authority.attempts7,backlink_authority_queue:authority.queue,verified_referring_domains:authority.verifiedReferringDomains,backlink_bootstrap_floor:authority.bootstrapFloor,backlink_attempt_min_24h:authority.attemptMin24h};
  data.growthOps.systemHealth=health;
  data.runtimeIntegrity={version:'authority-throughput-v1',gscFallback:true,authorityExecutionContract:true,localResolvedDoesNotMeanHealthy:true};
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:jsonHeaders(response)});
}
async function augmentHealth(response,env){
  if(!response?.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const authority=await authorityState(env),health=await systemHealth(env,authority);
  data.runtimeIntegrity='authority-throughput-v1';
  data.overallHealth=health;
  data.authorityExecution=authority;
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:jsonHeaders(response)});
}
async function injectUi(response){
  if(!response?.ok||(response.headers.get('Content-Type')||'').toLowerCase().indexOf('text/html')<0)return response;
  let html=await response.text();
  if(!html.includes('id="toolscout-runtime-integrity-ui"'))html=html.includes('</body>')?html.replace('</body>',UI_REPAIR+'</body>'):html+UI_REPAIR;
  return new Response(html,{status:response.status,statusText:response.statusText,headers:htmlHeaders(response)});
}
async function recoveryCoolingDown(env){
  const row=await safeFirst(env,`SELECT started_at FROM engine_runs WHERE engine='distribution' AND mission='authority_execution_recovery' ORDER BY started_at DESC LIMIT 1`);
  if(!row?.started_at)return false;
  const t=Date.parse(String(row.started_at).replace(' ','T')+'Z');
  return Number.isFinite(t)&&(Date.now()-t)<RECOVERY_COOLDOWN_MINUTES*60000;
}
async function recordAuthorityEvent(env,type,status,detail){
  try{await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`authority_runtime_${crypto.randomUUID()}`,type,status,'backlink_acquisition',String(detail||'').slice(0,1800)).run()}catch{}
}
async function runAuthorityExecutionRecovery(env){
  const before=await authorityState(env);
  if(!before.required||!before.throughputGap||before.queue<=0)return {ok:true,skipped:true,reason:'authority_recovery_not_required',before};
  const network=await runDistributionNetworkCycle(env);
  const autonomous=await runAutonomousDistributionCycle(env);
  const after=await authorityState(env);
  const produced=after.attempts24>before.attempts24;
  if(!produced){
    await recordAuthorityEvent(env,'authority_execution_gap','failed',`Authority recovery executed network and autonomous batches but external attempts did not increase. Queue ${after.queue}; attempts24 ${after.attempts24}/${after.attemptMin24h}; referring domains ${after.verifiedReferringDomains}/${after.bootstrapFloor}. Discovery alone is not counted as authority execution.`);
    return {ok:false,reason:'authority_queue_without_external_throughput',before,after,network,autonomous};
  }
  await recordAuthorityEvent(env,'authority_execution_recovered','completed',`Authority recovery increased external attempts from ${before.attempts24} to ${after.attempts24} in the rolling 24h window.`);
  return {ok:true,before,after,network,autonomous};
}

function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/analytics-v2'||path==='/analytics-v2/'||path==='/analytics-v2.html'}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return augmentStats(request,response,env);
    if(request.method==='GET'&&url.pathname==='/api/autonomous-growth-health')return augmentHealth(response,env);
    if(request.method==='GET'&&analyticsPath(url.pathname))return injectUi(response);
    return response;
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    const hourly=trigger==='15 * * * *';
    if(hourly){
      const task=(async()=>{
        const state=await authorityState(env);
        if(!state.required||!state.throughputGap||state.queue<=0)return;
        if(await recoveryCoolingDown(env))return;
        await runWithLedger(env,{engine:'distribution',mission:'authority_execution_recovery',triggerName:trigger,singleFlightMinutes:75},()=>runAuthorityExecutionRecovery(env));
      })().catch(()=>{});
      if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
    }
    if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);
  }
};
