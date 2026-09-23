export function commandCenterHtml(){
return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ToolScout Command Center</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--ink:#17212b;--muted:#667085;--line:#e3e8ef;--soft:#f8fafc;--good:#087443;--warn:#9a6700;--bad:#b42318;--info:#175cd3;--shadow:0 8px 28px rgba(16,24,40,.06)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,a{font:inherit}.wrap{max-width:1460px;margin:0 auto;padding:28px 22px 60px}.top{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:14px}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:850;color:var(--muted)}h1{font-size:38px;line-height:1;margin:7px 0 7px;letter-spacing:-.045em}.sub{margin:0;color:var(--muted);font-size:14px;line-height:1.5;max-width:850px}
.btn{border:1px solid #cfd7e3;background:#fff;color:var(--ink);border-radius:10px;padding:9px 12px;font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}.btn:hover{background:#f8fafc}.btn.primary{background:#17212b;color:#fff;border-color:#17212b}.btn.danger{color:var(--bad)}
.statusbar{display:flex;justify-content:space-between;gap:14px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 13px;margin-bottom:14px;font-size:12px;color:var(--muted)}.statusbar strong{color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);min-width:0}.span12{grid-column:span 12}.span7{grid-column:span 7}.span5{grid-column:span 5}.span6{grid-column:span 6}
.head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:16px 17px 10px}.kicker{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:850;color:var(--muted)}.title{font-size:17px;font-weight:850;letter-spacing:-.02em;margin-top:3px}.meta{font-size:10px;color:var(--muted);text-align:right;line-height:1.4}.body{padding:0 17px 17px}
.headline{border:1px solid var(--line);background:var(--soft);border-radius:13px;padding:13px 14px;margin-bottom:10px}.headline b{display:block;font-size:18px;letter-spacing:-.025em}.headline span{display:block;color:var(--muted);font-size:11px;line-height:1.45;margin-top:4px}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.metric{border:1px solid var(--line);background:var(--soft);border-radius:12px;padding:11px;min-width:0}.metric small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.075em;font-weight:850;color:var(--muted)}.metric b{display:block;font-size:24px;letter-spacing:-.035em;margin:4px 0 2px;overflow:hidden;text-overflow:ellipsis}.metric span{display:block;font-size:10px;color:var(--muted);line-height:1.35}
.section{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}.sectionTitle{font-size:11px;font-weight:850;margin-bottom:4px}.row{display:flex;justify-content:space-between;gap:15px;padding:9px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}.rowName{font-size:12px;font-weight:800}.rowMeta{font-size:10px;color:var(--muted);line-height:1.45;margin-top:2px}.rowValue{font-size:11px;font-weight:850;text-align:right;white-space:nowrap}
.pill{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:4px 7px;font-size:9px;letter-spacing:.055em;text-transform:uppercase;font-weight:850;color:var(--muted)}.pill.good{color:var(--good);border-color:#a9dfc7;background:#effaf4}.pill.warn{color:var(--warn);border-color:#efd89b;background:#fff9e8}.pill.bad{color:var(--bad);border-color:#f3b8b3;background:#fff2f1}.pill.info{color:var(--info);border-color:#b6cdf8;background:#eff4ff}
.engine{display:grid;grid-template-columns:120px 105px minmax(0,1fr) 145px;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}.engine:first-child{border-top:0}.engineName{font-size:12px;font-weight:850}.engineText{font-size:10px;color:var(--muted);line-height:1.4}.engineTime{font-size:10px;color:var(--muted);text-align:right}
.log{display:grid;grid-template-columns:105px 90px minmax(0,1fr) 92px;gap:10px;padding:10px 0;border-top:1px solid var(--line);align-items:start}.log:first-child{border-top:0}.logTime,.logEngine{font-size:10px;color:var(--muted)}.logMain b{display:block;font-size:11px}.logMain span{display:block;font-size:10px;color:var(--muted);line-height:1.4;margin-top:2px}.logStatus{text-align:right}
.task{padding:12px 0;border-top:1px solid var(--line)}.task:first-child{border-top:0}.taskTop{display:flex;justify-content:space-between;gap:12px}.taskTitle{font-size:13px;font-weight:850}.taskMeta,.taskText{font-size:10px;color:var(--muted);line-height:1.45;margin-top:4px}.taskActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.payload{margin-top:10px;background:var(--soft);border:1px solid var(--line);border-radius:11px;padding:10px}.payload summary{cursor:pointer;font-weight:800;font-size:11px}.payload pre{white-space:pre-wrap;font:inherit;font-size:10px;color:var(--muted);max-height:260px;overflow:auto}
.empty{padding:24px 8px;text-align:center;color:var(--muted);font-size:11px}.issue{border:1px solid #f1b6b0;background:#fff5f4;border-radius:11px;padding:10px;margin-top:8px;font-size:11px;line-height:1.45}.issue.warn{border-color:#ead69b;background:#fffaf0}.issue.good{border-color:#b9dfca;background:#f3fbf6}.issue b{display:block;margin-bottom:3px}.small{font-size:10px;color:var(--muted);line-height:1.4}.sourceLine{font-size:9px;color:var(--muted);margin-top:8px}
@media(max-width:1000px){.span7,.span5,.span6{grid-column:span 12}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.engine{grid-template-columns:100px 95px minmax(0,1fr)}.engineTime{display:none}}
@media(max-width:650px){.wrap{padding:20px 12px 48px}.top{display:block}h1{font-size:32px}.top .btn{margin-top:12px}.metrics{grid-template-columns:1fr 1fr}.engine{grid-template-columns:1fr}.log{grid-template-columns:74px minmax(0,1fr)}.logEngine,.logStatus{display:none}.statusbar{display:block}.statusbar span{display:block;margin-top:4px}}
</style>
</head>
<body>
<div class="wrap">
<header class="top"><div><div class="eyebrow">ToolScout - business control</div><h1>Command Center</h1><p class="sub">Business truth first. The page shows verified acquisition, conversion, authority, execution and human exceptions. Internal engine activity only appears when it explains an outcome or a problem.</p></div><button class="btn primary" id="refresh">Refresh</button></header>
<div class="statusbar"><div id="status"><strong>Loading current state...</strong></div><span id="sourceStatus">Live sources</span></div>
<main class="grid">
<section class="card span12"><div class="head"><div><div class="kicker">Business</div><div class="title">Business State</div></div><div class="meta" id="businessMeta">Current verified evidence</div></div><div class="body" id="businessBody"><div class="empty">Loading...</div></div></section>
<section class="card span7"><div class="head"><div><div class="kicker">Autonomous execution</div><div class="title">Growth Brain</div></div><div class="meta" id="brainMeta">What it is doing now</div></div><div class="body" id="brainBody"><div class="empty">Loading...</div></div></section>
<section class="card span5"><div class="head"><div><div class="kicker">Human exceptions only</div><div class="title">Needs You</div></div><div class="meta" id="queueMeta">Chairman Queue</div></div><div class="body" id="queueBody"><div class="empty">Loading...</div></div></section>
<section class="card span7"><div class="head"><div><div class="kicker">Actions and outcomes</div><div class="title">Recent Results</div></div><div class="meta">External evidence only</div></div><div class="body" id="resultsBody"><div class="empty">Loading...</div></div></section>
<section class="card span5"><div class="head"><div><div class="kicker">Organic demand and authority</div><div class="title">Search + Authority</div></div><div class="meta" id="searchMeta">GSC + verified backlinks</div></div><div class="body" id="searchBody"><div class="empty">Loading...</div></div></section>
<section class="card span12"><div class="head"><div><div class="kicker">Reliability</div><div class="title">System Truth</div></div><div class="meta">Only current, measurable issues</div></div><div class="body" id="healthBody"><div class="empty">Loading...</div></div></section>
</main>
</div>
<script>
const endpoints={stats:'/analytics/api/stats',queue:'/analytics/api/chairman-queue',supervisor:'/api/growth/supervisor/public',runtime:'/api/runtime/executors',authority:'/api/distribution/authority/closed-loop-health'};
let data={stats:null,queue:null,supervisor:null,runtime:null,authority:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const n=v=>Number.isFinite(Number(v))?Number(v).toLocaleString():'Unavailable';
const dec=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'Unavailable';
const money=(v,c)=>{if(v===null||v===undefined||!Number.isFinite(Number(v)))return 'Unknown';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c||'EUR',maximumFractionDigits:2}).format(Number(v))}catch{return String(v)}};
const dt=v=>{if(!v)return 'Unavailable';try{let s=String(v);if(!s.includes('T'))s=s.replace(' ','T')+'Z';return new Date(s).toLocaleString(undefined,{timeZone:'Europe/Lisbon'})}catch{return String(v)}};
const ageHours=v=>{if(!v)return null;let s=String(v);if(!s.includes('T'))s=s.replace(' ','T')+'Z';const t=Date.parse(s);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):null};
const human=v=>String(v||'').replaceAll('_',' ');
const pill=(v,state)=>'<span class="pill '+(state||'')+'">'+esc(v)+'</span>';
const metric=(label,value,meta)=>'<div class="metric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(meta||'')+'</span></div>';
const row=(name,value,meta)=>'<div class="row"><div><div class="rowName">'+esc(name)+'</div>'+(meta?'<div class="rowMeta">'+esc(meta)+'</div>':'')+'</div><div class="rowValue">'+esc(value)+'</div></div>';
function statusState(v){v=String(v||'').toLowerCase();if(['healthy','working','active','supporting','completed','verified','refreshed','connected','observed'].includes(v))return'good';if(['critical','failed','stalled','blocked','unavailable','execution_gap','evidence_stale','executor_stale'].includes(v))return'bad';return'warn'}
function safeUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():''}catch{return''}}
async function get(url){const r=await fetch(url+(url.includes('?')?'&':'?')+'t='+Date.now(),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error(String(r.status));return r.json()}
function business(){
 const s=data.supervisor||{},st=data.stats||{},a=st.acquisition||{},q=data.queue||st?.growthOps?.chairmanQueue||{},r=st.revenue||{},b=s.backlinkAcquisition||{},g=s.gsc||{},aff=st.affiliateCoverageStatus||{};
 const ga=a.sessions||{},activeAff=aff?.active?.count,coverage=st?.growthOps?.engines?.affiliate?.weighted_coverage_pct;
 let headline='Execution is running, but business results are not yet proven.';
 let detail='Growth Brain is prioritizing strict verified human acquisition and measurable downstream conversion.';
 if(Number(s.strictHumans24h)>0)headline='Verified humans are arriving. Conversion is now the next proof point.';
 if(Number(s.verifiedOutbound24h)>0)headline='Verified humans are reaching vendors. Monetization is the next proof point.';
 if(Number(s.monetizedOutbound24h)>0)headline='Monetized outbound is active. Scale only sources that preserve verified human quality.';
 if(Number(r.confirmedRevenue||0)>0)headline='Confirmed revenue is now present. Focus on repeatable acquisition and monetized conversion.';
 document.getElementById('businessMeta').textContent='Supervisor '+dt(s?.growth?.lastEvaluatedAt||s.generatedAt);
 document.getElementById('businessBody').innerHTML=
  '<div class="headline"><b>'+esc(headline)+'</b><span>'+esc(detail)+'</span></div>'+
  '<div class="metrics">'+
   metric('Strict humans - 24h',s.strictHumans24h==null?'Unavailable':n(s.strictHumans24h),(s.strictHumans7d==null?'Unavailable':n(s.strictHumans7d))+' / 7d')+
   metric('Verified outbound - 24h',s.verifiedOutbound24h==null?'Unavailable':n(s.verifiedOutbound24h),'Strict verified business funnel')+
   metric('Monetized outbound - 24h',s.monetizedOutbound24h==null?'Unavailable':n(s.monetizedOutbound24h),'Verified monetized clicks')+
   metric('Confirmed revenue',money(r.confirmedRevenue,r.currency),r.reportingStatus==='connected'?'Vendor evidence connected':'No confirmed vendor evidence')+
   metric('External executions - 24h',s.acquisitionExecutions24h==null?'Unavailable':n(s.acquisitionExecutions24h),(s.acquisitionExecutions7d==null?'Unavailable':n(s.acquisitionExecutions7d))+' / 7d')+
   metric('Referring domains',b.verifiedReferringDomains==null?'Unavailable':n(b.verifiedReferringDomains),(b.bootstrapReferringDomainFloor==null?'':n(b.bootstrapReferringDomainFloor)+' bootstrap floor'))+
   metric('Google impressions - 28d',g.impressions==null?'Unavailable':n(g.impressions),(g.clicks==null?'Unavailable':n(g.clicks))+' clicks')+
   metric('Needs you',q.total==null?'Unavailable':n(q.total),(q.estimated_minutes==null?'':n(q.estimated_minutes)+' min estimated'))+
  '</div>'+
  '<div class="section"><div class="sectionTitle">Acquisition context</div>'+
   row('GA4 sessions - 24h',ga.last24Hours==null?'Unavailable':n(ga.last24Hours),a.status==='connected'?'Canonical GA4 reporting population':'GA4 unavailable')+
   row('GA4 sessions - MTD',ga.monthToDate==null?'Unavailable':n(ga.monthToDate),ga.dailyAverageMTD==null?'':dec(ga.dailyAverageMTD,1)+' average per day')+
   row('Affiliate coverage',coverage==null?(activeAff==null?'Unavailable':n(activeAff)+' active routes'):dec(coverage,1)+'%',activeAff==null?'Observed monetization coverage':n(activeAff)+' active affiliate programmes')+
  '</div>';
}
function brain(){
 const s=data.supervisor||{},eng=Array.isArray(s.engines)?s.engines:[],primary=eng.filter(x=>['distribution','content','audience','seo_geo_aio'].includes(x.engine));
 const growth=s.growth||{},body=[];
 body.push('<div class="headline"><b>'+esc(human(growth.directive||s.directive||'No current directive'))+'</b><span>Status '+esc(growth.status||s.status||'unavailable')+'. The Growth Brain should remain critical when verified humans are not arriving even if infrastructure is healthy.</span></div>');
 for(const x of primary){
   body.push('<div class="engine"><div class="engineName">'+esc(human(x.engine))+'</div><div>'+pill(human(x.status||'unknown'),statusState(x.status))+'</div><div class="engineText">'+esc(human(x.directive||'No directive'))+'</div><div class="engineTime">'+esc(dt(x.lastEvaluatedAt))+'</div></div>');
 }
 const ec=s.executionContract||{};
 body.push('<div class="section">'+row('Execution contract',n(ec.verified)+' verified',n(ec.missingExecutors)+' missing executors - '+n(ec.stalled)+' stalled')+row('Architecture incidents',n(s?.architectureEscalation?.openIncidents||0),s?.architectureEscalation?.approvalRequired?'Approval required':'No architecture approval required')+'</div>');
 document.getElementById('brainMeta').textContent='Evaluated '+dt(growth.lastEvaluatedAt||s.generatedAt);
 document.getElementById('brainBody').innerHTML=body.join('');
}
function taskHtml(x){
 const url=safeUrl(x.action_url),canConfirm=x.engine==='distribution'||(x.engine==='affiliate'&&['ready_to_apply','human_action_required'].includes(x.status));
 const label=x.gate_key?'Mark done':x.editorial_queue_id?'I published it':(x.engine==='affiliate'&&x.status==='human_action_required'?'I completed it':'I submitted it');
 let payload='';
 if(x.prepared_body||x.prepared_title){payload='<details class="payload"><summary>Prepared payload</summary>'+(x.prepared_title?'<pre>'+esc(x.prepared_title)+'</pre>':'')+(x.prepared_body?'<pre>'+esc(x.prepared_body)+'</pre>':'')+'</details>'}
 return '<div class="task"><div class="taskTop"><div><div class="taskTitle">'+esc(x.title||x.id)+'</div><div class="taskMeta">'+esc(x.engine||'human gate')+' - '+esc(x.status||'ready')+' - about '+esc(x.estimated_minutes||0)+' min</div></div>'+pill(x.expected_impact_score?'impact '+Math.round(x.expected_impact_score):'human gate','warn')+'</div>'+
  '<div class="taskText"><b>Do:</b> '+esc(x.instructions||x.reason||'Complete the linked external step.')+'</div>'+
  (x.expected_impact?'<div class="taskText"><b>Expected result:</b> '+esc(x.expected_impact)+'</div>':'')+payload+
  '<div class="taskActions">'+(url?'<a class="btn primary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open action</a>':'')+
  (canConfirm?'<button class="btn" data-resolve="submitted" data-engine="'+esc(x.engine)+'" data-id="'+esc(x.id)+'" data-status="'+esc(x.status||'')+'" data-gate="'+esc(x.gate_key||'')+'">'+esc(label)+'</button>':'')+
  (x.engine==='distribution'?'<button class="btn danger" data-resolve="skipped" data-engine="distribution" data-id="'+esc(x.id)+'">Skip</button>':'')+'</div></div>';
}
function queue(){
 const q=data.queue||data?.stats?.growthOps?.chairmanQueue||{items:[],total:0,estimated_minutes:0};
 const items=Array.isArray(q.items)?q.items:[];
 document.getElementById('queueMeta').textContent=items.length?n(q.total)+' current':'Clear';
 document.getElementById('queueBody').innerHTML=items.length?items.map(taskHtml).join(''):'<div class="empty"><b>No owner action is ready.</b><br><br>Incomplete or machine-resolvable tasks stay out of this queue.</div>';
}
function results(){
 const x=data?.stats?.growthOps?.autonomousGrowth||{},ledger=data?.stats?.growthOps?.ledger||[];
 let items=Array.isArray(x.external_execution_items)?x.external_execution_items:[];
 if(!items.length&&Array.isArray(ledger))items=ledger.map(i=>({at:i.at,engine:i.engine,label:(i.subject||'')+' '+(i.action||''),detail:i.result,status:i.result}));
 items=items.slice(0,12);
 if(!items.length){document.getElementById('resultsBody').innerHTML='<div class="empty">No recent external execution evidence is available.</div>';return}
 document.getElementById('resultsBody').innerHTML=items.map(i=>'<div class="log"><div class="logTime">'+esc(dt(i.at))+'</div><div class="logEngine">'+esc(human(i.engine||'engine'))+'</div><div class="logMain"><b>'+esc(i.label||i.type||i.id||'Execution')+'</b><span>'+esc(i.detail||human(i.type||''))+'</span></div><div class="logStatus">'+pill(human(i.status||'observed'),statusState(i.status))+'</div></div>').join('');
}
function searchAuthority(){
 const s=data.supervisor||{},g=s.gsc||{},b=s.backlinkAcquisition||{},rt=data.runtime||{},rh=rt.seo?.gscRuntimeHealth||{},targets=Array.isArray(s.topSearchTargets)?s.topSearchTargets.slice(0,5):[];
 const gAge=ageHours(rt.seo?.gscSignalsGeneratedAt||g.generatedAt),fresh=gAge!==null&&gAge<=36;
 document.getElementById('searchMeta').textContent='GSC '+(fresh?'fresh':'needs attention')+' - '+dt(rt.seo?.gscSignalsGeneratedAt||g.generatedAt);
 let html='<div class="metrics">'+
  metric('Impressions - 28d',g.impressions==null?'Unavailable':n(g.impressions),(g.clicks==null?'Unavailable':n(g.clicks))+' clicks')+
  metric('Indexed / inspected',(g.indexed==null||g.inspected==null)?'Unavailable':n(g.indexed)+' / '+n(g.inspected),n(g.indexRecoveryCandidates)+' recovery candidates')+
  metric('Referring domains',b.verifiedReferringDomains==null?'Unavailable':n(b.verifiedReferringDomains),(b.verifiedBacklinks==null?'Unavailable':n(b.verifiedBacklinks))+' verified backlinks')+
  metric('Authority attempts - 24h',b.attempts24h==null?'Unavailable':n(b.attempts24h),(b.attemptMin24h==null?'':n(b.attemptMin24h)+' minimum'))+
 '</div>';
 html+='<div class="section">'+
  row('Authority queue',b.authorityQueue==null?'Unavailable':n(b.authorityQueue),b.throughputGap?'Throughput below target':(b.stagnating?'Stagnating':'Throughput healthy'))+
  row('GSC runtime',rh.status||'Unavailable',rh.ok?'Cloudflare refresh verified':'No fresh runtime proof')+
  row('Last verified backlink',b.lastVerifiedAt?dt(b.lastVerifiedAt):'Unavailable',b.lastVerifiedAgeHours==null?'':dec(b.lastVerifiedAgeHours,1)+' hours ago')+
 '</div>';
 if(targets.length)html+='<div class="section"><div class="sectionTitle">Top observed search targets</div>'+targets.map(t=>row(t.title||t.path,n(t.impressions)+' impressions','Avg position '+dec(t.position,1)+' - '+(t.path||''))).join('')+'</div>';
 document.getElementById('searchBody').innerHTML=html;
}
function health(){
 const s=data.supervisor||{},rt=data.runtime||{},a=data.authority||{},issues=[];
 const ec=s.executionContract||{},arch=s.architectureEscalation||{},gsc=rt.seo?.gscRuntimeHealth||{};
 if(Number(ec.missingExecutors||0)>0)issues.push({level:'bad',title:'Missing execution contracts',detail:n(ec.missingExecutors)+' executor mappings are missing.'});
 if(Number(ec.stalled||0)>0)issues.push({level:'bad',title:'Stalled execution contracts',detail:n(ec.stalled)+' tasks are stalled.'});
 if(Number(arch.openIncidents||0)>0)issues.push({level:'bad',title:'Architecture incidents',detail:n(arch.openIncidents)+' open architecture incidents.'});
 if(gsc.ok===false)issues.push({level:'bad',title:'GSC refresh failed',detail:gsc.reason||gsc.status||'Search evidence refresh failed.'});
 if(a.status&&a.status!=='healthy')issues.push({level:'warn',title:'Authority loop',detail:'Authority closed loop reports '+a.status+'.'});
 if(!issues.length)issues.push({level:'good',title:'No active integrity issue',detail:'Execution contracts, architecture, GSC refresh and authority loop have no current measurable failure.'});
 const rows=[
  ['Runtime',rt.architecture||'Unavailable',(rt.primary?.runtime||'')+' - scheduler '+(rt.primary?.scheduler||'')],
  ['GitHub Actions',rt.githubActions?.role||'Unavailable',rt.githubActions?.scheduledPrimary===false?'Fallback only':'Check scheduling role'],
  ['GSC evidence',gsc.status||'Unavailable',gsc.generatedAt?dt(gsc.generatedAt):'No runtime timestamp'],
  ['Authority',a.status||'Unavailable',(a.attempts24==null?'Unavailable':n(a.attempts24))+' attempts / 24h'],
  ['Execution contract',n(ec.verified)+' verified',n(ec.ready)+' ready - '+n(ec.inFlight)+' in flight - '+n(ec.deferred)+' deferred']
 ];
 document.getElementById('healthBody').innerHTML=issues.map(i=>'<div class="issue '+i.level+'"><b>'+esc(i.title)+'</b>'+esc(i.detail)+'</div>').join('')+'<div class="section">'+rows.map(x=>row(x[0],x[1],x[2])).join('')+'</div><div class="sourceLine">Freshness is shown explicitly. Unavailable data is never converted to zero.</div>';
}
function render(){business();brain();queue();results();searchAuthority();health()}
async function resolveTask(button){
 const engine=button.dataset.engine,id=button.dataset.id,action=button.dataset.resolve,status=button.dataset.status||'',gate=button.dataset.gate||'';
 if(!engine||!id||!action)return;const old=button.textContent;button.disabled=true;button.textContent='Saving';
 try{
  const resultUrl=gate?window.prompt('Paste the result or listing URL if available. Leave blank if the service is reviewing the submission.',''):'';
  if(gate&&resultUrl===null){button.disabled=false;button.textContent=old;return}
  const endpoint=gate?'/analytics/api/human-actions/gate':engine==='distribution'?'/analytics/api/distribution-human-action':'/analytics/api/affiliate-human-action';
  const affiliateEvent=status==='human_action_required'?'completed':'submitted';
  const body=gate?{gate_key:gate,result_url:resultUrl}:engine==='distribution'?{surface_slug:id,action}:{tool_slug:id,event:affiliateEvent,evidence:'Confirmed from simplified Command Center'};
  const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false)throw new Error(j.error||'save_failed');data.queue=await get(endpoints.queue);queue();health();
 }catch(e){button.textContent='Save failed';setTimeout(()=>{button.disabled=false;button.textContent=old},1500)}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-resolve]');if(b){e.preventDefault();resolveTask(b)}});
async function load(){
 const btn=document.getElementById('refresh');btn.disabled=true;document.getElementById('status').innerHTML='<strong>Refreshing current evidence...</strong>';
 const entries=Object.entries(endpoints);const results=await Promise.all(entries.map(async([k,u])=>{try{return[k,await get(u),null]}catch(e){return[k,null,String(e?.message||e)]}}));
 let failures=[];for(const [k,v,e] of results){data[k]=v;if(e)failures.push(k)}
 render();
 const stamp=new Date().toLocaleString(undefined,{timeZone:'Europe/Lisbon'});
 document.getElementById('status').innerHTML='<strong>Updated '+esc(stamp)+'</strong> - '+(failures.length?'Some sources unavailable: '+esc(failures.join(', ')):'All canonical sources responded.');
 document.getElementById('sourceStatus').textContent=failures.length?(entries.length-failures.length)+' / '+entries.length+' sources live':entries.length+' / '+entries.length+' sources live';
 btn.disabled=false;
}
document.getElementById('refresh').addEventListener('click',load);
load();setInterval(load,60000);
</script>
</body>
</html>`;
}
