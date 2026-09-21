import base from './command-center-final-integrity-worker.js';
import resilientFallback from './command-center-resilient-worker.js';
import {runAutonomousDistributionCycle} from './distribution-autonomous-worker.js';
import {runDistributionNetworkCycle} from './distribution-network-worker.js';
import {runWithLedger,reapStaleEngineRuns} from './engine-run-ledger.js';
import {runAuditedAffiliateCoverageCycle} from './affiliate-coverage-entry-worker.js';
import {verifyBatch as verifyCatalogBatch,admitTrustedCandidates,verifyNewsSources,publicMergedTools,publicRuntimeToolResponse,publicQualityEnhancedToolResponse,publicMergedSitemap,publicRuntimeRankingResponse} from './catalog-autonomy-worker.js';
import {runContentSocialIntelligenceCycle} from './content-engine-intelligence-worker.js';
import {rebalanceDistributionPriorities} from './distribution-priority-worker.js';
import {growthSupervisorDirective} from './growth-supervisor.js';

const STATS_CACHE_TTL_SECONDS = 30;

const ANALYTICS_PATHS = new Set([
  '/analytics',
  '/analytics/',
  '/analytics.html',
  '/analytics-v2',
  '/analytics-v2/',
  '/analytics-v2.html'
]);

const LIGHT_THEME = `<style id="toolscout-command-center-light-theme">
:root{
  --bg:#f5f7fb;
  --card:#ffffff;
  --card2:#f8fafc;
  --ink:#101828;
  --muted:#667085;
  --line:#e4e8ee;
  --good:#067647;
  --warn:#b54708;
  --bad:#b42318;
  --accent:#6d5efc;
  --radius:18px;
}
html{background:var(--bg)!important}
body{
  background:
    radial-gradient(circle at 8% 0,rgba(109,94,252,.11),transparent 31%),
    radial-gradient(circle at 92% 7%,rgba(42,174,255,.10),transparent 25%),
    var(--bg)!important;
  color:var(--ink)!important;
}
.wrap{max-width:1500px}
.eyebrow,.widgetKicker{color:#667085!important}
h1,.widgetTitle,.rowName,.name,.value,.metric b,.card b,.panel h2,.section h2{color:#101828!important}
.sub,.widgetMeta,.rowMeta,.meta,.note,.empty,.metric small,.metric span,.card small,.card span{color:#667085!important}
.controls .btn,.btn{
  border-color:#e3e7ed!important;
  background:#ffffff!important;
  color:#101828!important;
  box-shadow:0 7px 20px rgba(16,24,40,.05)!important;
}
.controls .btn:hover,.btn:hover{background:#f8fafc!important}
.controls .btn.primary,.btn.primary{
  background:#101828!important;
  color:#ffffff!important;
  border-color:#101828!important;
  box-shadow:0 8px 24px rgba(16,24,40,.14)!important;
}
.statusbar{
  border-color:#e4e8ee!important;
  background:rgba(255,255,255,.90)!important;
  color:#667085!important;
  box-shadow:0 9px 26px rgba(16,24,40,.035)!important;
}
.statusbar strong{color:#101828!important}
.widget{
  background:rgba(255,255,255,.94)!important;
  border-color:#e4e8ee!important;
  box-shadow:0 12px 34px rgba(16,24,40,.06)!important;
}
.widget[data-dragging="1"]{outline-color:#6d5efc!important}
.metric,.tsDetailCard{
  background:#f8fafc!important;
  border-color:#e4e8ee!important;
  box-shadow:none!important;
}
.row,.task,.ledgerItem{border-color:#e7ebf0!important}
.taskReason{color:#475467!important}
.taskAfter{color:#667085!important}
.pill{
  border-color:#dfe4ea!important;
  background:#ffffff!important;
  color:#667085!important;
}
.pill.good{color:#067647!important;border-color:#abefc6!important;background:#ecfdf3!important}
.pill.warn{color:#b54708!important;border-color:#fedf89!important;background:#fffaeb!important}
.pill.bad{color:#b42318!important;border-color:#fecdca!important;background:#fef3f2!important}
.pill.info{color:#4f46e5!important;border-color:#c7d7fe!important;background:#eef4ff!important}
.bug{border-color:#fecdca!important;background:#fef3f2!important;color:#7a271a!important}
.bug b{color:#b42318!important}
.bug.warning{border-color:#fedf89!important;background:#fffaeb!important;color:#93370d!important}
.bug.warning b{color:#b54708!important}
.progress,.bar{background:#edf0f4!important}
.progress>i,.bar>i{background:#101828!important}
.resizeHandle:after{border-color:#98a2b3!important}
.modalBackdrop{background:rgba(16,24,40,.34)!important}
.modal{
  background:#ffffff!important;
  border-color:#e4e8ee!important;
  box-shadow:0 24px 90px rgba(16,24,40,.22)!important;
}
.panel,.card{
  background:#ffffff!important;
  color:#101828!important;
  border:1px solid #e4e8ee!important;
  box-shadow:0 9px 26px rgba(16,24,40,.045)!important;
}
.sectionHead span{color:#667085!important}
.trafficDot{background:#067647!important}
.trafficTrend.up,.good,[data-state="good"]{color:#067647!important}
.trafficTrend.down,.bad,[data-state="bad"]{color:#b42318!important}
.warn,[data-state="warn"]{color:#b54708!important}
a{color:inherit}
@media(max-width:720px){
  .widget{box-shadow:0 8px 22px rgba(16,24,40,.05)!important}
}
</style>`;


const TRAFFIC_DETAIL_REPAIR = `<style id="toolscout-traffic-detail-repair-style">
#trafficTruthBody .tsTrafficDetail[data-repair="1"]{margin-top:12px}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsTrafficDetailHead{margin-bottom:9px}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsTrafficDetailHead strong{display:block;font-size:12px;letter-spacing:.02em}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsTrafficDetailHead span{display:block;color:var(--muted);font-size:10px;line-height:1.4;margin-top:3px}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsDetailGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsDetailCard{border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:12px 13px;min-width:0}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsDetailCard small{display:block;color:var(--muted);font-size:8.5px;font-weight:850;letter-spacing:.075em;text-transform:uppercase;line-height:1.35}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsDetailCard b{display:block;font-size:25px;letter-spacing:-.04em;line-height:1.05;margin-top:6px}
#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsDetailCard span{display:block;color:var(--muted);font-size:9px;line-height:1.35;margin-top:5px}
#trafficTruthBody .tsCountryBlock[data-ts-country-bars="1"]{margin-top:12px;border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:12px 13px}
#trafficTruthBody .tsCountryBlock[data-ts-country-bars="1"] .tsCountryHead strong{display:block;font-size:12px}
#trafficTruthBody .tsCountryBlock[data-ts-country-bars="1"] .tsCountryHead span{display:block;color:var(--muted);font-size:9px;line-height:1.35;margin-top:3px}
#trafficTruthBody .tsCountryGridRepair{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}
#trafficTruthBody .tsCountryColRepair{min-width:0;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:11px}
#trafficTruthBody .tsCountryLabelRepair{font-size:9px;font-weight:850;letter-spacing:.075em;text-transform:uppercase;color:var(--muted)}
#trafficTruthBody .tsCountrySummaryRepair{font-size:9px;color:var(--muted);line-height:1.4;margin-top:3px;margin-bottom:9px}
#trafficTruthBody .tsCountryBarRowRepair{margin-top:9px}
#trafficTruthBody .tsCountryBarTopRepair{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;line-height:1.25}
#trafficTruthBody .tsCountryBarTopRepair span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#trafficTruthBody .tsCountryBarTopRepair b{font-size:10px;white-space:nowrap}
#trafficTruthBody .tsCountryBarTrackRepair{height:7px;margin-top:5px;background:var(--line);border-radius:999px;overflow:hidden}
#trafficTruthBody .tsCountryBarFillRepair{display:block;height:100%;background:var(--accent);border-radius:999px}
#trafficTruthBody .tsCountryMoreRepair{margin-top:8px;font-size:9px;color:var(--muted)}
@media(max-width:900px){#trafficTruthBody .tsCountryGridRepair{grid-template-columns:1fr}}
@media(max-width:430px){#trafficTruthBody .tsTrafficDetail[data-repair="1"] .tsDetailGrid{grid-template-columns:1fr 1fr;gap:8px}}
</style><script id="toolscout-traffic-detail-repair">(function(){
if(window.__toolscoutTrafficDetailRepair)return;
window.__toolscoutTrafficDetailRepair=true;
var latest=null;
function num(v){var x=Number(v);return Number.isFinite(x)?x:0}
function fmt(v,d){var x=num(v);return d==null?x.toLocaleString():x.toFixed(d)}
function escHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
function region(code){try{var dn=new Intl.DisplayNames([document.documentElement.lang||'en'],{type:'region'});return dn.of(code)||code}catch(e){return code}}
function card(label,value,meta){return '<div class="tsDetailCard"><small>'+escHtml(label)+'</small><b>'+escHtml(value)+'</b><span>'+escHtml(meta)+'</span></div>'}
function windowMeta(v,key){var c=v&&v.coverage||{};var ok=key==='last24'?!!c.last24Complete:key==='today'?!!c.todayComplete:!!c.monthToDateComplete;return ok?'Complete exact measurement window':'Partial exact tracking window'}
function countryColumn(label,data){
  if(!data)return '<div class="tsCountryColRepair"><div class="tsCountryLabelRepair">'+escHtml(label)+'</div><div class="tsCountrySummaryRepair">Unavailable</div></div>';
  var all=Array.isArray(data.countries)?data.countries:[],rows=all.slice(0,6),total=num(data.total),unknown=num(data.unknown),dominant=rows[0]||null;
  var dominantPct=dominant&&total?Math.round(num(dominant.visitors)/total*100):0;
  var cov=data.coverage==null?null:Math.round(Number(data.coverage)*100);
  var summary=total?all.length+' '+(all.length===1?'country':'countries')+(dominant?' · '+region(String(dominant.country||''))+' '+dominantPct+'%':'')+(cov==null?'':' · '+cov+'% located'):'No visitors yet';
  var body=rows.map(function(x){var pct=total?Math.round(num(x.visitors)/total*100):0;return '<div class="tsCountryBarRowRepair"><div class="tsCountryBarTopRepair"><span>'+escHtml(region(String(x.country||'')))+'</span><b>'+fmt(x.visitors)+' · '+pct+'%</b></div><div class="tsCountryBarTrackRepair"><i class="tsCountryBarFillRepair" style="width:'+Math.max(0,Math.min(100,pct))+'%"></i></div></div>'}).join('');
  if(unknown){var upct=total?Math.round(unknown/total*100):0;body+='<div class="tsCountryBarRowRepair"><div class="tsCountryBarTopRepair"><span>Country unavailable</span><b>'+fmt(unknown)+' · '+upct+'%</b></div><div class="tsCountryBarTrackRepair"><i class="tsCountryBarFillRepair" style="width:'+Math.max(0,Math.min(100,upct))+'%;opacity:.35"></i></div></div>'}
  if(!body)body='<div class="tsCountryMoreRepair">No country data yet.</div>';
  if(all.length>rows.length)body+='<div class="tsCountryMoreRepair">+'+fmt(all.length-rows.length)+' more</div>';
  return '<div class="tsCountryColRepair"><div class="tsCountryLabelRepair">'+escHtml(label)+'</div><div class="tsCountrySummaryRepair">'+escHtml(summary)+'</div>'+body+'</div>';
}
function countriesBlock(c){
  if(!c||c.status!=='observed')return '<div class="tsCountryBlock" data-ts-country-bars="1"><div class="tsCountryHead"><strong>Visitor countries</strong><span>Country data is currently unavailable.</span></div></div>';
  return '<div class="tsCountryBlock" data-ts-country-bars="1"><div class="tsCountryHead"><strong>Visitor countries</strong><span>Country share among strict verified human visitors only. Cloudflare network location is used. Raw IP is not stored. VPNs or proxies can affect the reported country.</span></div><div class="tsCountryGridRepair">'+countryColumn('Today',c.today)+countryColumn('Last 24h',c.last24)+countryColumn('MTD',c.monthToDate)+'</div></div>';
}
function render(d){
  latest=d||latest;if(!latest)return;
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var forecast=root.querySelector('.tsTruthForecast');if(!forecast)return;
  var v=latest.visitors||{},t=latest.traffic||{},commercial=latest.canonicalCommercialTruth||{},countries=latest.trafficCountries||{};
  var html='<div class="tsTrafficDetail" data-repair="1"><div class="tsTrafficDetailHead"><strong>Traffic detail</strong><span>Strict Verified Human Sessions is the canonical business traffic metric. Browser-validated sessions are diagnostic only and never enter this KPI.</span></div><div class="tsDetailGrid">'+
    card('Strict human visitors, last 24h',fmt(v.last24),windowMeta(v,'last24'))+
    card('Strict human visitors today',fmt(v.today),windowMeta(v,'today'))+
    card('Strict human visitors this month',fmt(v.monthToDate),windowMeta(v,'month'))+
    card('Strict human visitors since baseline',fmt(v.sinceTracking),'First-party visitor IDs attached to positive human evidence since strict-human-v1 began')+
    card('Verified outbound clicks',fmt(commercial.humanOutbound),'First-party verified outbound clicks')+
    card('Monetized outbound clicks, 30d',fmt(commercial.monetizedOutbound),'Human outbound clicks routed through active monetized affiliate paths')+
    card('Strict human sessions this month',fmt(t.monthToDate),'Positive-evidence human sessions only')+
    card('Average strict sessions / day MTD',fmt(t.dailyAverageMTD,1),'Strict verified human sessions per calendar day')+
    '</div>'+countriesBlock(countries)+'</div>';
  var old=root.querySelector('.tsTrafficDetail');
  if(old)old.remove();
  forecast.insertAdjacentHTML('afterend',html);
}
function ensure(){
  var root=document.getElementById('trafficTruthBody');
  if(!root||!latest)return;
  var current=root.querySelector('.tsTrafficDetail[data-repair="1"]');
  if(!current)render(latest);
}
function installRenderHook(){
  if(window.__toolscoutTrafficDetailRenderHook)return;
  var previous=window.render;
  if(typeof previous!=='function')return;
  window.__toolscoutTrafficDetailRenderHook=true;
  window.render=function(d){var result=previous(d);latest=d;setTimeout(function(){render(d)},0);return result};
}
function boot(){
  installRenderHook();
  setTimeout(installRenderHook,150);
  var root=document.getElementById('trafficTruthBody');
  if(root)new MutationObserver(function(){setTimeout(ensure,0)}).observe(root,{childList:true,subtree:false});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`;

function isHtml(response) {
  return (response.headers.get('Content-Type') || '').toLowerCase().includes('text/html');
}

async function applyLightTheme(response) {
  if (!response.ok || !isHtml(response)) return response;
  let html = await response.text();
  if (!html.includes('id="toolscout-command-center-light-theme"')) {
    html = html.includes('</body>')
      ? html.replace('</body>', LIGHT_THEME + '</body>')
      : html + LIGHT_THEME;
  }
  if (!html.includes('id="toolscout-traffic-detail-repair"')) {
    html = html.includes('</body>')
      ? html.replace('</body>', TRAFFIC_DETAIL_REPAIR + '</body>')
      : html + TRAFFIC_DETAIL_REPAIR;
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function augmentEntrypointHealth(response) {
  if (!response.ok) return response;
  let data;
  try { data = await response.json(); } catch { return response; }
  data.entrypoint = 'command-center-light-theme-worker';
  data.entrypointVersion = 14;
  data.commandCenterComposition = 'canonical-growth-v2';
  data.autonomousGrowthBrain = 'shared-growth-v3';
  data.affiliateEngineVersion = '2.1';
  data.catalogGrowthVersion = '1.0';
  data.catalogRuntimeAutonomy = true;
  data.affiliateReplyReconciliation = true;
  data.affiliateReplyPayloadEncoding = 'base64-v1';
  data.commandCenterCompositionOwner = 'growth-command-center-v2-worker';
  data.runtimeVersionCards = true;
  data.autonomousGrowthSurface = true;
  data.seoExecutionBrainGated = true;
  data.whatsNewBrainIntegrated = true;
  data.growthRndAutonomy = 'bounded-v1';
  data.affiliateCanonicalTruth = 'verified-outbound-v1';
  data.trafficTruthVersion = 'strict-human-v1';
  data.humanAcquisitionSprint = {id:'human-acquisition-sprint-2026-09',status:'active',northStar:'strict_verified_human_sessions',endAt:'2026-09-28T23:00:00.000Z'};
  data.browserValidatedIsDiagnosticOnly = true;
  data.stats503Fallback = true;
  data.statsSnapshotCacheSeconds = STATS_CACHE_TTL_SECONDS;
  data.trafficDetailBackgroundPolling = false;
  data.trafficDetailIndependentFetch = false;
  return Response.json(data, {headers:{'Cache-Control':'no-store'}});
}

function clientNoStore(response, cacheState) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-ToolScout-Stats-Cache', cacheState);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(response.body, {status:response.status,statusText:response.statusText,headers});
}

const truthNum=v=>Number.isFinite(Number(v))?Number(v):0;

async function canonicalAutonomousGrowthTruth(env) {
  const first=async(sql)=>{
    try{return await env.DB.prepare(sql).first()}catch{return null}
  };
  const all=async(sql)=>{
    try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}
  };
  const blueskyUrl=uri=>{
    const m=String(uri||'').match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
    return m?`https://bsky.app/profile/${m[1]}/post/${m[2]}`:null;
  };
  const [supervisor,growth,routes,routeActions,contract,loop,cycles,humanEvents,proof,backlinks,backlinkRows,distributionActions,distributionSubmissions,contentPublishes,contentActions,audienceReplies]=await Promise.all([
    first(`SELECT status,directive,directive_json,strict_humans_24h,strict_humans_7d,attributed_humans_7d,external_executions_24h,external_executions_7d,correction_count,last_correction_at,last_evaluated_at
      FROM growth_supervisor_state WHERE engine='growth_brain' LIMIT 1`),
    first(`SELECT COUNT(*) active,
      SUM(CASE WHEN subject_type='tool' THEN 1 ELSE 0 END) tools,
      SUM(CASE WHEN subject_type='surface' THEN 1 ELSE 0 END) surfaces,
      SUM(CASE WHEN subject_type='search' THEN 1 ELSE 0 END) search,
      SUM(CASE WHEN subject_type='affiliate' THEN 1 ELSE 0 END) affiliate,
      SUM(CASE WHEN subject_type LIKE 'catalog_%' THEN 1 ELSE 0 END) catalog,
      SUM(CASE WHEN subject_type='news_update' THEN 1 ELSE 0 END) news,
      MAX(last_evaluated_at) last_evaluated_at
      FROM growth_opportunity_state WHERE status='active'`),
    first(`SELECT COUNT(*) routes,COUNT(DISTINCT surface_slug) surfaces FROM distribution_contact_routes`),
    first(`SELECT COUNT(*) total,
      SUM(CASE WHEN status IN ('queued','retry_due') THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN status IN ('researching','qualified_auto','executed_waiting_verification','issued_to_content') THEN 1 ELSE 0 END) in_progress,
      SUM(CASE WHEN status='verified_human_impact' THEN 1 ELSE 0 END) verified_human,
      SUM(CASE WHEN status='verified_placement' THEN 1 ELSE 0 END) verified_placement,
      SUM(CASE WHEN status='human_action_required' THEN 1 ELSE 0 END) human,
      SUM(CASE WHEN status='auth_required' THEN 1 ELSE 0 END) auth,
      SUM(CASE WHEN status='stalled' THEN 1 ELSE 0 END) stalled,
      SUM(CASE WHEN status IN ('policy_blocked','exhausted') THEN 1 ELSE 0 END) exhausted
      FROM distribution_contact_route_actions`),
    first(`SELECT
      SUM(CASE WHEN status='executor_missing' THEN 1 ELSE 0 END) missing,
      SUM(CASE WHEN status='stalled' THEN 1 ELSE 0 END) stalled,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='claimed' THEN 1 ELSE 0 END) claimed,
      SUM(CASE WHEN status='attempted' THEN 1 ELSE 0 END) attempted,
      SUM(CASE WHEN status='deferred' THEN 1 ELSE 0 END) deferred,
      MIN(CASE WHEN status='pending' THEN updated_at END) oldest_pending,
      MIN(CASE WHEN status='claimed' THEN claimed_at END) oldest_claimed,
      MIN(CASE WHEN status='attempted' THEN attempted_at END) oldest_attempted
      FROM growth_execution_contract`),
    first(`SELECT
      MAX(CASE WHEN engine='growth' AND mission='opportunity_coordination' AND status='completed' THEN completed_at END) last_completed_at,
      (
        SELECT COUNT(*)
        FROM engine_runs f
        WHERE f.started_at>=datetime('now','-24 hours')
          AND f.status='failed'
          AND ((f.engine='growth' AND f.mission IN ('opportunity_coordination','rnd_audit'))
            OR (f.engine='distribution' AND f.mission IN ('network_cycle','autonomous_cycle','economic_learning'))
            OR (f.engine='content' AND f.mission='social_intelligence'))
          AND NOT EXISTS (
            SELECT 1 FROM engine_runs c
            WHERE c.engine=f.engine AND c.mission=f.mission
              AND c.status='completed' AND c.started_at>f.started_at
          )
      ) failed_core
      FROM engine_runs`),
    first(`SELECT COUNT(*) n FROM engine_runs WHERE started_at>=datetime('now','-7 days') AND status='completed'`),
    first(`SELECT COUNT(*) n FROM distribution_events WHERE created_at>=datetime('now','-7 days') AND event_type IN ('human_gate_resolved','editorial_human_resolved')`),
    first(`SELECT COUNT(*) placements FROM (
      SELECT surface_slug FROM distribution_placements WHERE placement_verified=1
      UNION
      SELECT r.surface_slug FROM distribution_contact_route_actions a
        JOIN distribution_contact_routes r ON r.route_id=a.route_id
        WHERE a.status IN ('verified_placement','verified_human_impact')
      UNION
      SELECT surface_slug FROM distribution_opportunities WHERE status IN ('verified','live')
    ) p WHERE surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')`),
    first(`SELECT COUNT(DISTINCT surface_slug) backlinks FROM distribution_placements
      WHERE placement_verified=1 AND backlink_verified=1
        AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')`),
    all(`SELECT surface_slug,public_url,link_rel,first_verified_at FROM distribution_placements
      WHERE placement_verified=1 AND backlink_verified=1
        AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')`),
    all(`SELECT g.action_id,g.opportunity_key,g.engine,g.channel,g.target_url,g.status,g.created_at,
        CASE WHEN g.action_id LIKE 'vendor:%' THEN substr(g.action_id,8) ELSE NULL END tool_slug,
        (SELECT v.contact_email FROM distribution_vendor_amplification v WHERE v.tool_slug=substr(g.action_id,8) ORDER BY v.outreach_sent_at DESC LIMIT 1) contact_email,
        (SELECT v.suggested_subject FROM distribution_vendor_amplification v WHERE v.tool_slug=substr(g.action_id,8) ORDER BY v.outreach_sent_at DESC LIMIT 1) suggested_subject,
        (SELECT v.asset_url FROM distribution_vendor_amplification v WHERE v.tool_slug=substr(g.action_id,8) ORDER BY v.outreach_sent_at DESC LIMIT 1) asset_url
      FROM growth_action_events g
      WHERE g.created_at>=datetime('now','-7 days')
        AND g.status IN ('sent','verified','completed','attributed')
        AND (g.engine='vendor_amplification' OR g.engine LIKE 'distribution%')
      ORDER BY g.created_at DESC`),
    all(`SELECT submission_id,surface_slug,submission_type,status,attempts,COALESCE(last_attempt_at,created_at) created_at,response_url,error
      FROM distribution_submissions
      WHERE surface_slug<>'indexnow' AND attempts>0
        AND COALESCE(last_attempt_at,created_at)>=datetime('now','-7 days')
      ORDER BY COALESCE(last_attempt_at,created_at) DESC`),
    all(`SELECT event_id,platform,event_type,status,post_uri,parent_uri,content_id,source,created_at
      FROM audience_events
      WHERE created_at>=datetime('now','-7 days') AND status='published' AND event_type='content_published'
      ORDER BY created_at DESC`),
    all(`SELECT action_id,opportunity_key,engine,channel,target_url,status,created_at
      FROM growth_action_events
      WHERE created_at>=datetime('now','-7 days') AND status IN ('sent','verified','completed','attributed') AND engine='content'
      ORDER BY created_at DESC`),
    all(`SELECT event_id,platform,event_type,status,post_uri,parent_uri,source,created_at
      FROM audience_events
      WHERE created_at>=datetime('now','-7 days') AND status='published' AND event_type='outbound_reply'
      ORDER BY created_at DESC`)
  ]);
  let supervisorConfig={};
  try{supervisorConfig=JSON.parse(supervisor?.directive_json||'{}')}catch{}
  const backlinkDomains=new Set();
  for(const row of backlinkRows||[]){
    try{const host=new URL(String(row.public_url||'')).hostname.replace(/^www\./,'').toLowerCase();if(host&&host!=='trytoolscout.org'&&!host.endsWith('.trytoolscout.org'))backlinkDomains.add(host)}catch{}
  }
  const verifiedReferringDomains=backlinkDomains.size;
  const backlinkBootstrapFloor=10;
  const backlinkAcquisitionRequired=verifiedReferringDomains<backlinkBootstrapFloor;
  const executionItems=[
    ...distributionActions.map(x=>({
      id:x.action_id,engine:'distribution',type:x.engine==='vendor_amplification'?'vendor_email':x.engine,
      channel:x.channel||null,status:x.status,at:x.created_at,
      label:x.tool_slug?`Vendor outreach: ${x.tool_slug}`:(x.opportunity_key||x.action_id),
      detail:x.contact_email?`${x.suggested_subject||'Vendor outreach'} → ${x.contact_email}`:null,
      target_url:x.target_url||x.asset_url||null,external_url:null
    })),
    ...distributionSubmissions.map(x=>({
      id:x.submission_id,engine:'distribution',type:'external_submission',channel:x.submission_type||null,status:x.status,at:x.created_at,
      label:`External submission: ${x.surface_slug}`,
      detail:x.error||(`Attempt ${truthNum(x.attempts)}`),target_url:x.response_url||null,external_url:x.response_url||null
    })),
    ...contentPublishes.map(x=>({
      id:x.event_id,engine:'content',type:'content_published',channel:x.platform||null,status:x.status,at:x.created_at,
      label:x.content_id?`Published content: ${x.content_id}`:'Published content',
      detail:x.source||null,target_url:blueskyUrl(x.post_uri),external_url:blueskyUrl(x.post_uri)
    })),
    ...contentActions.map(x=>({
      id:x.action_id,engine:'content',type:'content_action',channel:x.channel||null,status:x.status,at:x.created_at,
      label:x.opportunity_key||x.action_id,detail:null,target_url:x.target_url||null,external_url:null
    })),
    ...audienceReplies.map(x=>({
      id:x.event_id,engine:'audience',type:'outbound_reply',channel:x.platform||null,status:x.status,at:x.created_at,
      label:'Outbound audience reply',detail:x.source||null,
      target_url:blueskyUrl(x.parent_uri),external_url:blueskyUrl(x.post_uri)
    }))
  ].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  const ageHours=loop?.last_completed_at?Math.max(0,(Date.now()-Date.parse(String(loop.last_completed_at).replace(' ','T')+'Z'))/36e5):null;
  const contractAgeHours=value=>{if(!value)return null;const t=Date.parse(String(value).replace(' ','T')+'Z');return Number.isFinite(t)?Math.max(0,(Date.now()-t)/36e5):null};
  const missing=truthNum(contract?.missing),stalled=truthNum(contract?.stalled),failed=truthNum(loop?.failed_core);
  const ready=truthNum(contract?.pending),claimed=truthNum(contract?.claimed),attempted=truthNum(contract?.attempted),deferred=truthNum(contract?.deferred);
  const oldestPendingAgeHours=contractAgeHours(contract?.oldest_pending),oldestClaimedAgeHours=contractAgeHours(contract?.oldest_claimed),oldestAttemptedAgeHours=contractAgeHours(contract?.oldest_attempted);
  const activeBacklog=ready+claimed+attempted;
  const loopStatus=missing>0||failed>0||(ageHours!=null&&ageHours>4)?'failed':(stalled>0||(oldestClaimedAgeHours!=null&&oldestClaimedAgeHours>6)||(oldestAttemptedAgeHours!=null&&oldestAttemptedAgeHours>24)?'warning':'healthy');
  return {
    source:'entrypoint_canonical_growth_truth_v3',
    active_opportunities:truthNum(growth?.active),
    tool_opportunities:truthNum(growth?.tools),
    surface_opportunities:truthNum(growth?.surfaces),
    affiliate_opportunities:truthNum(growth?.affiliate),
    catalog_opportunities:truthNum(growth?.catalog),
    news_opportunities:truthNum(growth?.news),
    search_opportunities:truthNum(growth?.search),
    last_evaluated_at:growth?.last_evaluated_at||supervisor?.last_evaluated_at||null,
    external_executions_7d:truthNum(supervisor?.external_executions_7d),
    autonomous_actions_7d:truthNum(supervisor?.external_executions_7d),
    internal_cycles_7d:truthNum(cycles?.n),
    human_interventions_7d:truthNum(humanEvents?.n),
    contact_routes:truthNum(routes?.routes),
    contact_route_surfaces:truthNum(routes?.surfaces),
    route_actions_total:truthNum(routeActions?.total),
    route_actions_queued:truthNum(routeActions?.queued),
    route_actions_in_progress:truthNum(routeActions?.in_progress),
    route_actions_verified_human:truthNum(routeActions?.verified_human),
    route_actions_verified_placement:truthNum(routeActions?.verified_placement),
    route_actions_human:truthNum(routeActions?.human),
    route_actions_auth:truthNum(routeActions?.auth),
    route_actions_stalled:truthNum(routeActions?.stalled),
    route_actions_exhausted:truthNum(routeActions?.exhausted),
    supervisor_status:supervisor?.status||'unavailable',
    supervisor_directive:supervisor?.directive||null,
    operating_mode:supervisorConfig?.operating_mode||null,
    critical_strict_humans_24h_max:truthNum(supervisorConfig?.critical_strict_humans_24h_max),
    external_execution_min_24h:truthNum(supervisorConfig?.external_execution_min_24h),
    external_execution_target_24h:truthNum(supervisorConfig?.external_execution_target_24h),
    external_execution_max_24h:truthNum(supervisorConfig?.external_execution_max_24h),
    verified_outbound_24h:truthNum(supervisorConfig?.verified_outbound_24h),
    verified_outbound_7d:truthNum(supervisorConfig?.verified_outbound_7d),
    monetized_outbound_24h:truthNum(supervisorConfig?.monetized_outbound_24h),
    monetized_outbound_7d:truthNum(supervisorConfig?.monetized_outbound_7d),
    supervisor_strict_humans_24h:truthNum(supervisor?.strict_humans_24h),
    supervisor_strict_humans_7d:truthNum(supervisor?.strict_humans_7d),
    supervisor_attributed_humans_7d:truthNum(supervisor?.attributed_humans_7d),
    supervisor_external_executions_24h:truthNum(supervisor?.external_executions_24h),
    supervisor_external_executions_7d:truthNum(supervisor?.external_executions_7d),
    supervisor_corrections:truthNum(supervisor?.correction_count),
    supervisor_last_correction_at:supervisor?.last_correction_at||null,
    supervisor_last_evaluated_at:supervisor?.last_evaluated_at||null,
    loop_status:loopStatus,
    loop_last_completed_at:loop?.last_completed_at||null,
    loop_age_hours:ageHours,
    loop_failed_core_runs_24h:failed,
    verified_placements:proof?.placements==null?null:truthNum(proof.placements),
    verified_backlinks:backlinks?.backlinks==null?null:truthNum(backlinks.backlinks),
    verified_referring_domains:verifiedReferringDomains,
    backlink_bootstrap_floor:backlinkBootstrapFloor,
    backlink_acquisition_required:backlinkAcquisitionRequired,
    backlink_quality_only:true,
    execution_contract_integrity:'task-specific-bounded-v3',
    execution_contract_missing:missing,
    execution_contract_stalled:stalled,
    execution_contract_ready:ready,
    execution_contract_claimed:claimed,
    execution_contract_attempted:attempted,
    execution_contract_in_flight:claimed+attempted,
    execution_contract_deferred:deferred,
    execution_contract_active_backlog:activeBacklog,
    execution_contract_oldest_pending_age_hours:oldestPendingAgeHours,
    execution_contract_oldest_claimed_age_hours:oldestClaimedAgeHours,
    execution_contract_oldest_attempted_age_hours:oldestAttemptedAgeHours,
    external_execution_items:executionItems,
    external_execution_items_count:executionItems.length
  };
}

async function enforceCanonicalAutonomousGrowth(response,env,mode='primary') {
  if(!response?.ok||!(response.headers.get('content-type')||'').toLowerCase().includes('application/json'))return response;
  let data;
  try{data=await response.json()}catch{return response}
  const truth=await canonicalAutonomousGrowthTruth(env);
  const prior=data?.growthOps?.autonomousGrowth||{};
  const external7=truth.external_executions_7d;
  const human7=truth.human_interventions_7d;
  data.growthOps={...(data.growthOps||{}),autonomousGrowth:{
    ...prior,
    ...truth,
    status:'observed',
    autonomy_rate_pct:(external7+human7)>0?Number((external7/(external7+human7)*100).toFixed(1)):0
  }};
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=UTF-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-ToolScout-Growth-Truth','entrypoint-canonical-v3');
  headers.set('X-ToolScout-Stats-Origin',mode);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return Response.json(data,{status:response.status,headers});
}

async function cachedStatsResponse(request, env, ctx) {
  if (typeof caches === 'undefined' || !caches.default) return resilientStatsResponse(request, env, ctx);
  const url = new URL(request.url);
  const cacheKey = new Request(url.origin + '/__toolscout_internal/command-center-stats-v8', {method:'GET'});
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return clientNoStore(cached, 'hit');
  } catch {}
  const fresh = await resilientStatsResponse(request, env, ctx);
  if (!fresh.ok || !(fresh.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return clientNoStore(fresh, 'bypass');
  }
  try {
    const cacheHeaders = new Headers(fresh.headers);
    cacheHeaders.set('Cache-Control', 'public, max-age=' + STATS_CACHE_TTL_SECONDS);
    cacheHeaders.delete('Set-Cookie');
    const cacheCopy = new Response(fresh.clone().body, {status:fresh.status,statusText:fresh.statusText,headers:cacheHeaders});
    ctx.waitUntil(caches.default.put(cacheKey, cacheCopy));
  } catch {}
  return clientNoStore(fresh, 'miss');
}

async function resilientStatsResponse(request, env, ctx) {
  let primary = null;
  try {
    primary = await base.fetch(request, env, ctx);
    if (primary.status < 500) return enforceCanonicalAutonomousGrowth(primary,env,'primary');
  } catch {}
  try {
    const fallback = await resilientFallback.fetch(request, env, ctx);
    if (!fallback.ok) return fallback;
    const headers = new Headers(fallback.headers);
    headers.set('X-ToolScout-Stats-Mode', 'resilient-fallback');
    headers.set('Cache-Control', 'private, no-store');
    const wrapped=new Response(fallback.body, {status:fallback.status,statusText:fallback.statusText,headers});
    return enforceCanonicalAutonomousGrowth(wrapped,env,'resilient-fallback');
  } catch (error) {
    if (primary) return enforceCanonicalAutonomousGrowth(primary,env,'primary-error');
    return Response.json(
      {error:'command_center_stats_unavailable',message:String(error&&error.message||error)},
      {status:503,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'}}
    );
  }
}

async function missionNeedsRecovery(env,engine,mission){
  try{
    await reapStaleEngineRuns(env,45);
    const row=await env.DB.prepare(`SELECT status,started_at FROM engine_runs WHERE engine=? AND mission=? ORDER BY started_at DESC LIMIT 1`).bind(engine,mission).first();
    if(!row)return true;
    return row.status==='failed'||row.status==='degraded';
  }catch{return false}
}
async function catalogQualityNeedsRecovery(env){
  try{
    const row=await env.DB.prepare(`SELECT evidence_json FROM engine_runs WHERE engine='catalog' AND mission='runtime_quality' AND status='completed' ORDER BY started_at DESC LIMIT 1`).first();
    const evidence=JSON.parse(row?.evidence_json||'{}');
    const checked=Number(evidence?.checked||0),warnings=Number(evidence?.warnings||0);
    return checked>0&&warnings>=checked;
  }catch{return false}
}


function canonicalSeoPath(pathname){
  const p=String(pathname||'/');
  if(p==='/index.html')return'/';
  return p.replace(/\.html$/i,'')||'/';
}
function canonicalizeOwnedMarkup(value){
  return String(value||'')
    .replace(/https:\/\/www\.trytoolscout\.org/gi,'https://trytoolscout.org')
    .replace(/https:\/\/trytoolscout\.org(\/[^"'<>\\\s?#]*?)\.html(?=([?#"'<>\\\s]|$))/gi,'https://trytoolscout.org$1')
    .replace(/(["'=])((?:\.\/|\/)[^"'<>\\\s?#]*?)\.html(?=([?#"'<>\\\s]|$))/gi,'$1$2');
}
async function canonicalizeHtmlResponse(response){
  if(!response||!response.ok)return response;
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('text/html'))return response;
  const body=canonicalizeOwnedMarkup(await response.text());
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('X-ToolScout-SEO-Canonical','extensionless-v1');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
async function canonicalizeSitemapResponse(response){
  if(!response||!response.ok)return response;
  let xml=canonicalizeOwnedMarkup(await response.text());
  const seen=new Set();
  xml=xml.replace(/<url>([\s\S]*?)<\/url>/gi,(block,inner)=>{
    const m=String(inner).match(/<loc>([^<]+)<\/loc>/i);if(!m)return block;
    const loc=String(m[1]||'').trim();if(seen.has(loc))return'';seen.add(loc);return block;
  });
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('Content-Type','application/xml; charset=UTF-8');headers.set('X-ToolScout-SEO-Sitemap','canonical-extensionless-v1');
  return new Response(xml,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if((request.method==='GET'||request.method==='HEAD')&&/\.html$/i.test(url.pathname)){
      const target=new URL(url.toString());target.pathname=canonicalSeoPath(url.pathname);
      return Response.redirect(target.toString(),308);
    }
    if(request.method==='GET'&&url.pathname==='/api/autonomous-growth-health'){
      let assetStatus=null,assetLocation=null;
      try{
        const probe=await env.ASSETS.fetch(new Request(new URL('/analytics-v2',request.url).toString(),{method:'GET'}));
        assetStatus=probe.status;assetLocation=probe.headers.get('Location')||null;
      }catch{}
      const autonomousGrowthTruth=await canonicalAutonomousGrowthTruth(env).catch(()=>null);
      return Response.json({ok:true,brain:'shared-growth-v3',selfAudit:'strict-human-supervisor-v2',operatingMode:'always_on_acquisition',criticalStrictHumans24hMax:2,businessFunnel:['strict_verified_human_sessions','verified_outbound_clicks','monetized_verified_outbound_clicks'],selfCorrection:true,supervisedEngines:['distribution','content','audience','seo_geo_aio','affiliate','catalog'],affiliate:'2.1',catalog:'1.0',catalogRuntimeAutonomy:true,affiliateReplyReconciliation:true,affiliateReplyPayloadEncoding:'base64-v1',commandCenterComposition:'canonical-growth-v2',commandCenterAsset:{path:'/analytics-v2',status:assetStatus,location:assetLocation},seoExecutionBrainGated:true,whatsNewBrainIntegrated:true,growthRndAutonomy:'bounded-v1',affiliateCanonicalTruth:'verified-outbound-v1',trafficTruth:'strict-human-v1',browserValidatedIsDiagnosticOnly:true,d1WritePolicy:'material-change-only-v3',humanAcquisitionSprint:{id:'human-acquisition-sprint-2026-09',status:'active',northStar:'strict_verified_human_sessions',endAt:'2026-09-28T23:00:00.000Z',gscTargets:[{cluster:'project_management',path:'/best-project-management-tools'},{cluster:'seo_agencies',path:'/best-seo-tools-for-agencies'},{cluster:'no_code_automation',path:'/best-no-code-automation-tools'},{cluster:'semrush_airtable_profiles',paths:['/tools/semrush','/tools/airtable']},{cluster:'funnel_builders',path:'/best-funnel-builder'}]},autonomousGrowthTruth,buildContract:'2026-09-20.8'},{headers:{'Cache-Control':'no-store'}});
    }
    if(request.method==='GET'&&url.pathname==='/data/tools.json'){
      return Response.json(await publicMergedTools(env),{headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'public, max-age=60'}});
    }
    if(request.method==='GET'&&/^\/tools\/[a-z0-9][a-z0-9-]*(?:\.html)?\/?$/i.test(url.pathname)){
      const slug=(url.pathname.match(/^\/tools\/([a-z0-9][a-z0-9-]*)/i)||[])[1]?.toLowerCase()||'';
      const runtimeResponse=await publicRuntimeToolResponse(env,slug);
      if(runtimeResponse)return canonicalizeHtmlResponse(runtimeResponse);
      return canonicalizeHtmlResponse(await publicQualityEnhancedToolResponse(await base.fetch(request,env,ctx),env,slug));
    }
    if(request.method==='GET'&&url.pathname==='/sitemap.xml'){
      return canonicalizeSitemapResponse(await publicMergedSitemap(await base.fetch(request,env,ctx),env));
    }
    if(request.method==='GET'&&/^\/best-[a-z0-9-]+(?:\.html)?\/?$/i.test(url.pathname)){
      const rankingResponse=await publicRuntimeRankingResponse(env,url.pathname);
      if(rankingResponse)return canonicalizeHtmlResponse(rankingResponse);
    }
        const isStats = request.method === 'GET' && url.pathname === '/analytics/api/stats';
    const response = isStats
      ? await cachedStatsResponse(request, env, ctx)
      : await base.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/command-center-resilient-health') {
      return augmentEntrypointHealth(response);
    }
    let finalResponse=response;
    if(request.method==='GET')finalResponse=await canonicalizeHtmlResponse(finalResponse);
    if (request.method === 'GET' && ANALYTICS_PATHS.has(url.pathname)) {
      return applyLightTheme(finalResponse);
    }
    return finalResponse;
  },
  async scheduled(event, env, ctx) {
    const trigger=event?.cron||'scheduled';
    const hourly=trigger==='15 * * * *';
    const daily=trigger==='35 3 * * *';
    const scheduledHour=new Date(Number(event?.scheduledTime)||Date.now()).getUTCHours();
    const twoHourly=hourly&&scheduledHour%2===0;
    const sixHourly=hourly&&scheduledHour%6===0;
    const twelveHourly=hourly&&scheduledHour%12===0;
    const [affiliateSupervisor,catalogSupervisor]=await Promise.all([
      growthSupervisorDirective(env,'affiliate').catch(()=>null),
      growthSupervisorDirective(env,'catalog').catch(()=>null)
    ]);
    const affiliateMaintenance=affiliateSupervisor?.config?.mode==='maintenance_only';
    const catalogDemandLed=catalogSupervisor?.config?.mode==='demand_led_quality';

    if(hourly){
      ctx.waitUntil(runWithLedger(env,{engine:'distribution',mission:'autonomous_cycle',triggerName:trigger},()=>runAutonomousDistributionCycle(env)).catch(()=>{}));
      const prioritiesRecovery=await missionNeedsRecovery(env,'distribution','operating_priorities');
      if(twoHourly){
        ctx.waitUntil(runWithLedger(env,{engine:'distribution',mission:'network_cycle',triggerName:trigger},()=>runDistributionNetworkCycle(env)).catch(()=>{}));
        const affiliateRecovery=await missionNeedsRecovery(env,'affiliate','coverage_cycle');
        if(!affiliateMaintenance||twelveHourly||affiliateRecovery)ctx.waitUntil(runAuditedAffiliateCoverageCycle(env,affiliateRecovery?trigger+':recovery':trigger).catch(()=>{}));
      }
      if(twoHourly||prioritiesRecovery){
        ctx.waitUntil(runWithLedger(env,{engine:'distribution',mission:'operating_priorities',triggerName:prioritiesRecovery?trigger+':recovery':trigger},()=>rebalanceDistributionPriorities(env)).catch(()=>{}));
      }
      if(sixHourly){
        if(!catalogDemandLed||twelveHourly)ctx.waitUntil(runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:trigger},()=>verifyCatalogBatch(env)).catch(()=>{}));
        ctx.waitUntil(runWithLedger(env,{engine:'content',mission:'social_intelligence',triggerName:trigger},()=>runContentSocialIntelligenceCycle(env)).catch(()=>{}));
      }
    }

    if(daily){
      ctx.waitUntil((async()=>{
        try{await runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:trigger},()=>admitTrustedCandidates(env))}catch{}
        try{await runWithLedger(env,{engine:'content',mission:'software_news_source_watch',triggerName:trigger},()=>verifyNewsSources(env))}catch{}
      })());
    }else if(hourly){
      const [recoverCoverage,recoverNews,recoverQuality]=await Promise.all([
        missionNeedsRecovery(env,'catalog','runtime_coverage'),
        missionNeedsRecovery(env,'content','software_news_source_watch'),
        catalogQualityNeedsRecovery(env)
      ]);
      if(recoverCoverage||recoverNews||recoverQuality)ctx.waitUntil((async()=>{
        if(recoverQuality){try{await runWithLedger(env,{engine:'catalog',mission:'runtime_quality',triggerName:trigger+':recovery'},()=>verifyCatalogBatch(env))}catch{}}
        if(recoverCoverage){try{await runWithLedger(env,{engine:'catalog',mission:'runtime_coverage',triggerName:trigger+':recovery'},()=>admitTrustedCandidates(env))}catch{}}
        if(recoverNews){try{await runWithLedger(env,{engine:'content',mission:'software_news_source_watch',triggerName:trigger+':recovery'},()=>verifyNewsSources(env))}catch{}}
      })());
    }
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};
