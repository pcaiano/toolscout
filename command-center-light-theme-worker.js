import base from './command-center-final-integrity-worker.js';
import resilientFallback from './command-center-resilient-worker.js';

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
var latest=null,busy=false;
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
  return '<div class="tsCountryBlock" data-ts-country-bars="1"><div class="tsCountryHead"><strong>Visitor countries</strong><span>Country share among browser-confirmed human visitors. Cloudflare network location is used. Raw IP is not stored. VPNs or proxies can affect the reported country.</span></div><div class="tsCountryGridRepair">'+countryColumn('Today',c.today)+countryColumn('Last 24h',c.last24)+countryColumn('MTD',c.monthToDate)+'</div></div>';
}
function render(d){
  latest=d||latest;if(!latest)return;
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var forecast=root.querySelector('.tsTruthForecast');if(!forecast)return;
  var v=latest.visitors||{},t=latest.traffic||{},commercial=latest.canonicalCommercialTruth||{},countries=latest.trafficCountries||{};
  var html='<div class="tsTrafficDetail" data-repair="1"><div class="tsTrafficDetailHead"><strong>Traffic detail</strong><span>Human Sessions is the canonical headline metric. Unique Human Visitors remains a supporting exact first-party metric.</span></div><div class="tsDetailGrid">'+
    card('Unique human visitors, last 24h',fmt(v.last24),windowMeta(v,'last24'))+
    card('Unique human visitors today',fmt(v.today),windowMeta(v,'today'))+
    card('Unique human visitors this month',fmt(v.monthToDate),windowMeta(v,'month'))+
    card('Unique visitors since exact tracking',fmt(v.sinceTracking),'First-party human browser IDs observed since exact visitor tracking began')+
    card('Verified outbound clicks',fmt(commercial.humanOutbound),'First-party verified outbound clicks')+
    card('Monetized outbound clicks, 30d',fmt(commercial.monetizedOutbound),'Human outbound clicks routed through active monetized affiliate paths')+
    card('Browser sessions this month',fmt(t.monthToDate),'Canonical browser-confirmed month-to-date sessions')+
    card('Average sessions per day MTD',fmt(t.dailyAverageMTD,1),'Browser-confirmed sessions per calendar day')+
    '</div>'+countriesBlock(countries)+'</div>';
  var old=root.querySelector('.tsTrafficDetail');
  if(old)old.remove();
  forecast.insertAdjacentHTML('afterend',html);
}
async function refresh(){
  if(busy||document.hidden)return;busy=true;
  try{var r=await fetch('/analytics/api/stats',{cache:'no-store'});if(r.ok){var d=await r.json();render(d)}}catch(e){}finally{busy=false}
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
  setTimeout(function(){if(!latest)refresh()},900);
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

async function resilientStatsResponse(request, env, ctx) {
  let primary = null;
  try {
    primary = await base.fetch(request, env, ctx);
    if (primary.status < 500) return primary;
  } catch {}
  try {
    const fallback = await resilientFallback.fetch(request, env, ctx);
    if (!fallback.ok) return fallback;
    const headers = new Headers(fallback.headers);
    headers.set('X-ToolScout-Stats-Mode', 'resilient-fallback');
    headers.set('Cache-Control', 'private, no-store');
    return new Response(fallback.body, {status:fallback.status,statusText:fallback.statusText,headers});
  } catch (error) {
    if (primary) return primary;
    return Response.json(
      {error:'command_center_stats_unavailable',message:String(error&&error.message||error)},
      {status:503,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'}}
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isStats = request.method === 'GET' && url.pathname === '/analytics/api/stats';
    const response = isStats
      ? await resilientStatsResponse(request, env, ctx)
      : await base.fetch(request, env, ctx);
    if (request.method === 'GET' && ANALYTICS_PATHS.has(url.pathname)) {
      return applyLightTheme(response);
    }
    return response;
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};
