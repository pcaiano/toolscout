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
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);min-width:0}.span12{grid-column:span 12}.span7{grid-column:span 7}.span5{grid-column:span 5}.span6{grid-column:span 6}.span4{grid-column:span 4}
.head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:16px 17px 10px}.kicker{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:850;color:var(--muted)}.title{font-size:17px;font-weight:850;letter-spacing:-.02em;margin-top:3px}.meta{font-size:10px;color:var(--muted);text-align:right;line-height:1.4}.body{padding:0 17px 17px}
.headline{border:1px solid var(--line);background:var(--soft);border-radius:13px;padding:13px 14px;margin-bottom:10px}.headline b{display:block;font-size:18px;letter-spacing:-.025em}.headline span{display:block;color:var(--muted);font-size:11px;line-height:1.45;margin-top:4px}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.metric{border:1px solid var(--line);background:var(--soft);border-radius:12px;padding:11px;min-width:0}.metric small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.075em;font-weight:850;color:var(--muted)}.metric b{display:block;font-size:24px;letter-spacing:-.035em;margin:4px 0 2px;overflow:hidden;text-overflow:ellipsis}.metric span{display:block;font-size:10px;color:var(--muted);line-height:1.35}
.section{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}.sectionTitle{font-size:11px;font-weight:850;margin-bottom:4px}.row{display:flex;justify-content:space-between;gap:15px;padding:9px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}.rowName{font-size:12px;font-weight:800}.rowMeta{font-size:10px;color:var(--muted);line-height:1.45;margin-top:2px}.rowValue{font-size:11px;font-weight:850;text-align:right;white-space:nowrap}
.pill{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:4px 7px;font-size:9px;letter-spacing:.055em;text-transform:uppercase;font-weight:850;color:var(--muted)}.pill.good{color:var(--good);border-color:#a9dfc7;background:#effaf4}.pill.warn{color:var(--warn);border-color:#efd89b;background:#fff9e8}.pill.bad{color:var(--bad);border-color:#f3b8b3;background:#fff2f1}.pill.info{color:var(--info);border-color:#b6cdf8;background:#eff4ff}
.engine{display:grid;grid-template-columns:120px 105px minmax(0,1fr) 145px;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}.engine:first-child{border-top:0}.engineName{font-size:12px;font-weight:850}.engineText{font-size:10px;color:var(--muted);line-height:1.4}.engineTime{font-size:10px;color:var(--muted);text-align:right}
.log{display:grid;grid-template-columns:105px 90px minmax(0,1fr) 92px;gap:10px;padding:10px 0;border-top:1px solid var(--line);align-items:start}.log:first-child{border-top:0}.logTime,.logEngine{font-size:10px;color:var(--muted)}.logMain b{display:block;font-size:11px}.logMain span{display:block;font-size:10px;color:var(--muted);line-height:1.4;margin-top:2px}.logStatus{text-align:right}
.task{padding:12px 0;border-top:1px solid var(--line)}.task:first-child{border-top:0}.taskTop{display:flex;justify-content:space-between;gap:12px}.taskTitle{font-size:13px;font-weight:850}.taskMeta,.taskText{font-size:10px;color:var(--muted);line-height:1.45;margin-top:4px}.taskActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.payload{margin-top:10px;background:var(--soft);border:1px solid var(--line);border-radius:11px;padding:10px}.payload summary{cursor:pointer;font-weight:800;font-size:11px}.payload pre{white-space:pre-wrap;font:inherit;font-size:10px;color:var(--muted);max-height:260px;overflow:auto}
.chartBox{border:1px solid var(--line);background:var(--soft);border-radius:13px;padding:10px;margin-top:9px}.chartSvg{width:100%;height:210px;display:block}.chartGrid{stroke:var(--line);stroke-width:1}.chartAxis{fill:var(--muted);font-size:9px}.chartLine{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.chartLine.primary{stroke:var(--info)}.chartLine.good{stroke:var(--good)}.chartLine.warn{stroke:var(--warn)}.chartDot.primary{fill:var(--info)}.chartDot.good{fill:var(--good)}.chartDot.warn{fill:var(--warn)}.chartLegend{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:var(--muted);margin-top:5px}.legendKey{display:inline-flex;align-items:center;gap:5px}.legendKey i{width:9px;height:3px;border-radius:99px;display:inline-block}.legendKey i.primary{background:var(--info)}.legendKey i.good{background:var(--good)}.legendKey i.warn{background:var(--warn)}.progressTop{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.progressStats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.progressStat{border:1px solid var(--line);border-radius:10px;padding:8px;background:#fff}.progressStat small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:850}.progressStat b{display:block;font-size:17px;margin-top:3px}.deltaUp{color:var(--good)}.deltaDown{color:var(--bad)}.deltaFlat{color:var(--muted)}.donut{width:92px;height:92px;position:relative}.donut svg{width:92px;height:92px;transform:rotate(-90deg)}.donutTrack{fill:none;stroke:var(--line);stroke-width:9}.donutValue{fill:none;stroke:var(--good);stroke-width:9;stroke-linecap:round}.donutText{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-weight:850;font-size:16px}.donutText small{font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.empty{padding:24px 8px;text-align:center;color:var(--muted);font-size:11px}.issue{border:1px solid #f1b6b0;background:#fff5f4;border-radius:11px;padding:10px;margin-top:8px;font-size:11px;line-height:1.45}.issue.warn{border-color:#ead69b;background:#fffaf0}.issue.good{border-color:#b9dfca;background:#f3fbf6}.issue b{display:block;margin-bottom:3px}.small{font-size:10px;color:var(--muted);line-height:1.4}.sourceLine{font-size:9px;color:var(--muted);margin-top:8px}
@media(max-width:1000px){.span7,.span5,.span6,.span4{grid-column:span 12}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.engine{grid-template-columns:100px 95px minmax(0,1fr)}.engineTime{display:none}}
@media(max-width:650px){.wrap{padding:20px 12px 48px}.top{display:block}h1{font-size:32px}.top .btn{margin-top:12px}.metrics{grid-template-columns:1fr 1fr}.engine{grid-template-columns:1fr}.log{grid-template-columns:74px minmax(0,1fr)}.logEngine,.logStatus{display:none}.statusbar{display:block}.statusbar span{display:block;margin-top:4px}}
</style>
</head>
<body>
<div class="wrap">
<header class="top"><div><div class="eyebrow">ToolScout - business control</div><h1>Command Center</h1><p class="sub">Business truth first. The page shows verified acquisition, conversion, authority, execution and human exceptions. Internal engine activity only appears when it explains an outcome or a problem.</p></div><button class="btn primary" id="refresh">Refresh</button></header>
<div class="statusbar"><div id="status"><strong>Loading current state...</strong></div><span id="sourceStatus">Live sources</span></div>
<main class="grid">
<section class="card span12"><div class="head"><div><div class="kicker">Business</div><div class="title">Business State</div></div><div class="meta" id="businessMeta">Current verified evidence</div></div><div class="body" id="businessBody"><div class="empty">Loading...</div></div></section>
<section class="card span4"><div class="head"><div><div class="kicker">30 day trend</div><div class="title">Traffic Progress</div></div><div class="meta" id="trafficProgressMeta">GA4 + strict human proof</div></div><div class="body" id="trafficProgressBody"><div class="empty">Loading...</div></div></section>
<section class="card span4"><div class="head"><div><div class="kicker">30 day trend</div><div class="title">Authority Progress</div></div><div class="meta" id="authorityProgressMeta">Backlinks + referring domains</div></div><div class="body" id="authorityProgressBody"><div class="empty">Loading...</div></div></section>
<section class="card span4"><div class="head"><div><div class="kicker">28 day trend</div><div class="title">Google Search Progress</div></div><div class="meta" id="gscProgressMeta">Search Console</div></div><div class="body" id="gscProgressBody"><div class="empty">Loading...</div></div></section>
<section class="card span7"><div class="head"><div><div class="kicker">Autonomous execution + R&D</div><div class="title">Growth Brain</div></div><div class="meta" id="brainMeta">What it is doing now and what it is exploring next</div></div><div class="body" id="brainBody"><div class="empty">Loading...</div></div></section>
<section class="card span5"><div class="head"><div><div class="kicker">Human exceptions only</div><div class="title">Needs You</div></div><div class="meta" id="queueMeta">Chairman Queue</div></div><div class="body" id="queueBody"><div class="empty">Loading...</div></div></section>
<section class="card span12"><div class="head"><div><div class="kicker">Capacity + throughput</div><div class="title">Growth Execution Plane</div></div><div class="meta" id="throughputMeta">Cloudflare control · Render compute · Make sender · Auth broker</div></div><div class="body" id="throughputBody"><div class="empty">Loading...</div></div></section>
<section class="card span7"><div class="head"><div><div class="kicker">Actions and outcomes</div><div class="title">Recent Results</div></div><div class="meta">External evidence only</div></div><div class="body" id="resultsBody"><div class="empty">Loading...</div></div></section>
<section class="card span12"><div class="head"><div><div class="kicker">Reliability</div><div class="title">System Truth</div></div><div class="meta">Only current, measurable issues</div></div><div class="body" id="healthBody"><div class="empty">Loading...</div></div></section>
</main>
</div>
<script>
const endpoints={stats:'/analytics/api/stats',queue:'/analytics/api/chairman-queue',truth:'/api/command-center-business-truth',runtime:'/api/runtime/executors',authority:'/api/distribution/authority/closed-loop-health',compute:'/api/compute/health',auth:'/api/auth-plane/health'};
let data={stats:null,queue:null,truth:null,runtime:null,authority:null,compute:null,auth:null};
const sourceErrors={stats:null,queue:null,truth:null,runtime:null,authority:null,compute:null,auth:null};
let sessionRefreshPromise=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const n=v=>Number.isFinite(Number(v))?Number(v).toLocaleString():'Unavailable';
const dec=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'Unavailable';
const money=(v,c)=>{if(v===null||v===undefined||!Number.isFinite(Number(v)))return 'Unknown';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c||'EUR',maximumFractionDigits:2}).format(Number(v))}catch{return String(v)}};
const dt=v=>{if(!v)return 'Unavailable';try{let s=String(v);if(!s.includes('T'))s=s.replace(' ','T')+'Z';const d=new Date(s);return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}catch{return String(v)}};
const ageHours=v=>{if(!v)return null;let s=String(v);if(!s.includes('T'))s=s.replace(' ','T')+'Z';const t=Date.parse(s);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):null};
const human=v=>String(v||'').replaceAll('_',' ');
const pill=(v,state)=>'<span class="pill '+(state||'')+'">'+esc(v)+'</span>';
const metric=(label,value,meta)=>'<div class="metric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(meta||'')+'</span></div>';
const row=(name,value,meta)=>'<div class="row"><div><div class="rowName">'+esc(name)+'</div>'+(meta?'<div class="rowMeta">'+esc(meta)+'</div>':'')+'</div><div class="rowValue">'+esc(value)+'</div></div>';

const compactDate=v=>{const s=String(v||'');if(/^\d{8}$/.test(s))return s.slice(6,8)+'/'+s.slice(4,6);if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(8,10)+'/'+s.slice(5,7);return s};
const deltaClass=v=>Number(v)>0?'deltaUp':Number(v)<0?'deltaDown':'deltaFlat';
const signedPct=v=>v==null?'Unavailable':(Number(v)>0?'+':'')+Number(v).toFixed(1)+'%';
function seriesChart(rows,lines){
 if(!Array.isArray(rows)||rows.length<2)return '<div class="empty">Not enough historical observations yet.</div>';
 const W=620,H=205,L=34,R=10,T=12,B=27,plotW=W-L-R,plotH=H-T-B;
 const values=[];for(const line of lines)for(const row of rows){const x=Number(row[line.key]);if(Number.isFinite(x))values.push(x)}
 const max=Math.max(1,...values),min=0,range=Math.max(1,max-min);
 const x=i=>L+(rows.length===1?0:i/(rows.length-1))*plotW;
 const y=v=>T+plotH-(Math.max(min,Number(v)||0)-min)/range*plotH;
 let svg='<svg class="chartSvg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">';
 for(let g=0;g<=3;g++){const yy=T+plotH*g/3;const val=Math.round(max*(1-g/3));svg+='<line class="chartGrid" x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'"></line><text class="chartAxis" x="2" y="'+(yy+3)+'">'+val+'</text>'}
 const ticks=[0,Math.floor((rows.length-1)/2),rows.length-1];for(const i of ticks)svg+='<text class="chartAxis" text-anchor="'+(i===0?'start':i===rows.length-1?'end':'middle')+'" x="'+x(i)+'" y="'+(H-5)+'">'+esc(compactDate(rows[i]?.date))+'</text>';
 for(const line of lines){
   const points=rows.map((r,i)=>Number.isFinite(Number(r[line.key]))?x(i)+','+y(r[line.key]):null).filter(Boolean);
   if(points.length>1)svg+='<polyline class="chartLine '+line.cls+'" points="'+points.join(' ')+'"></polyline>';
   if(line.dots)for(let i=0;i<rows.length;i++){const v=Number(rows[i]?.[line.key]);if(Number.isFinite(v)&&v>0)svg+='<circle class="chartDot '+line.cls+'" cx="'+x(i)+'" cy="'+y(v)+'" r="3"></circle>'}
 }
 svg+='</svg><div class="chartLegend">'+lines.map(line=>'<span class="legendKey"><i class="'+line.cls+'"></i>'+esc(line.label)+'</span>').join('')+'</div>';
 return svg;
}
function donut(value,target){
 const v=Math.max(0,Number(value)||0),t=Math.max(1,Number(target)||1),pct=Math.min(1,v/t),r=34,c=2*Math.PI*r,dash=(c*pct).toFixed(2);
 return '<div class="donut"><svg viewBox="0 0 92 92"><circle class="donutTrack" cx="46" cy="46" r="'+r+'"></circle><circle class="donutValue" cx="46" cy="46" r="'+r+'" stroke-dasharray="'+dash+' '+c.toFixed(2)+'"></circle></svg><div class="donutText">'+esc(v)+' / '+esc(t)+'<small>domains</small></div></div>';
}

function statusState(v){v=String(v||'').toLowerCase();if(['healthy','working','active','supporting','completed','verified','refreshed','connected','observed','emerging','configured','live','route_validated','authenticated'].includes(v))return'good';if(['critical','failed','stalled','blocked','unavailable','execution_gap','evidence_stale','executor_stale','ineffective'].includes(v))return'bad';return'warn'}
function safeUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():''}catch{return''}}
async function refreshCommandCenterSession(){
 if(sessionRefreshPromise)return sessionRefreshPromise;
 sessionRefreshPromise=fetch('/analytics?session_refresh='+Date.now(),{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)})
  .then(r=>{if(!r.ok)throw new Error('session_refresh_'+r.status);return true})
  .finally(()=>{sessionRefreshPromise=null});
 return sessionRefreshPromise;
}
async function ccFetch(url,options={},retrySession=true){
 const fetchOptions={...options};const timeoutMs=Math.max(3000,Number(fetchOptions.timeoutMs)||12000);delete fetchOptions.timeoutMs;
 if(!fetchOptions.signal)fetchOptions.signal=AbortSignal.timeout(timeoutMs);
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...fetchOptions});
 if(r.status===401&&retrySession){
  let body={};try{body=await r.clone().json()}catch{}
  if(body?.error==='command_center_session_expired'){
   await refreshCommandCenterSession();
   return ccFetch(url,{...options,timeoutMs},false);
  }
 }
 return r;
}
async function get(url,fresh=false){
 const target=fresh?url+(url.includes('?')?'&':'?')+'fresh=1':url;
 const r=await ccFetch(target);
 if(!r.ok){
  let body={};try{body=await r.clone().json()}catch{}
  const err=new Error(body?.error||String(r.status));err.status=r.status;err.code=body?.error||null;throw err;
 }
 return r.json();
}
function business(){
 const t=data.truth||{},g=t.growth||{},b=t.authority||{},aff=t.affiliate||{},st=data.stats||{},a=st.acquisition||{},q=data.queue||st?.growthOps?.chairmanQueue||{},r=st.revenue||{},ga=a.sessions||{};
 let headline='Execution is running, but business results are not yet proven.';
 let detail='Human Acquisition v4 is always on but resource-bounded: 60% existing search demand, 25% authority/vendor network, 10% AI/AEO discovery and 5% Growth R&D. GA4 is canonical traffic; strict-human evidence proves attribution quality. Activity itself is not success.';
 if(Number(g.strictHumans24h)>0)headline='Verified humans are arriving. Conversion is now the next proof point.';
 if(Number(g.verifiedOutbound24h)>0)headline='Verified humans are reaching vendors. Monetization is now the next proof point.';
 if(Number(g.monetizedOutbound24h)>0)headline='Monetized outbound is active. Scale only sources that preserve verified human quality.';
 if(Number(r.confirmedRevenue||0)>0)headline='Confirmed revenue is now present. Focus on repeatable acquisition and monetized conversion.';
 document.getElementById('businessMeta').textContent='Business truth '+dt(t.generatedAt);
 document.getElementById('businessBody').innerHTML=
  '<div class="headline"><b>'+esc(headline)+'</b><span>'+esc(detail)+'</span></div>'+
  '<div class="metrics">'+
   metric('GA4 sessions - 24h',a.status==='connected'?n(ga.last24Hours):'Unavailable',a.status==='connected'?n(ga.monthToDate)+' MTD · canonical traffic':'GA4 source unavailable')+
   metric('Strict attributed humans - 24h',n(g.strictHumans24h),n(g.strictHumans7d)+' / 7d · quality proof')+
   metric('Verified outbound - 24h',n(g.verifiedOutbound24h),n(g.verifiedOutbound7d)+' / 7d')+
   metric('Monetized outbound - 24h',n(g.monetizedOutbound24h),n(g.monetizedOutbound7d)+' / 7d')+
   metric('Referring domains (unique)',n(b.referringDomains??b.verifiedReferringDomains),(b.seRankingReferringDomains!=null?n(b.seRankingReferringDomains)+' SE Ranking · ':'')+n(b.internalVerifiedReferringDomains??b.verifiedReferringDomains)+' internally verified')+
   metric('Domain authority',b.domainAuthority==null?'Unavailable':n(b.domainAuthority),b.domainAuthoritySource||'External authority source')+
   metric('Active affiliates',n(aff.productionRoutes),'Live ToolScout affiliate routes')+
   metric('Confirmed revenue',data.stats==null?'Source unavailable':(r.confirmedRevenue==null?'No confirmed evidence':money(r.confirmedRevenue,r.currency)),data.stats==null?'Stats source did not respond':(r.reportingStatus==='connected'?'Vendor evidence connected':'Vendor reporting not connected'))+
   metric('Needs you',q.total==null?'Unavailable':n(q.total),(q.estimated_minutes==null?'Source unavailable':n(q.estimated_minutes)+' min estimated'))+
  '</div>'+
  '<div class="section"><div class="sectionTitle">Business context</div>'+
   row('Emails - 24h',n(g.emailSent24h)+' sent','Target '+n(g.emailTarget24h||50)+' · hard max '+n(g.emailMax24h||60)+' · '+n(g.contactSupplyReadyEmail??g.emailReadyContacts)+' unique domains ready')+
   row('Machine-safe actions - today',n(data?.compute?.distributionFunnel?.actionsCompletedToday)+' completed',n(data?.compute?.distributionFunnel?.actionsAuthorizedToday??data?.compute?.executionUsedToday)+' authorized · '+n(data?.compute?.executionDailyJobBudget||g.machineSafeExternalActionMax24h||800)+' / day capacity')+
   row('Research jobs - today',n(data?.compute?.distributionFunnel?.researchCompletedToday)+' distribution routes completed',n(data?.compute?.researchUsedToday)+' authorized · '+n(data?.compute?.dailyJobBudget||g.researchExternalJobMax24h||1500)+' / day capacity')+
   row('Channel allocation','60 / 25 / 10 / 5','Search demand / authority+vendor / AI+AEO / R&D')+
   row('Affiliate programmes',n(aff.productionRoutes)+' active','Canonical production registry')+
   row('Growth Brain',human(g.status||'unavailable'),human(g.directive||'No directive'))+
  '</div>';
}

function trafficProgress(){
 const a=data?.stats?.acquisition||{},rows=Array.isArray(a.daily30)?a.daily30.map(x=>({date:x.date,sessions:Number(x.sessions||0),humans:0})):[];
 const strict=Array.isArray(data?.truth?.traffic?.strictDaily)?data.truth.traffic.strictDaily:[];
 const map=new Map(rows.map((x,i)=>[String(x.date),i]));
 for(const h of strict){const key=String(h.date||'').replaceAll('-','');let idx=map.get(key);if(idx==null)idx=map.get(String(h.date||''));if(idx!=null)rows[idx].humans=Number(h.humans||0)}
 const last7=rows.slice(-7),prev7=rows.slice(-14,-7),sum=x=>x.reduce((a,b)=>a+Number(b.sessions||0),0),cur=sum(last7),prev=sum(prev7),chg=prev?((cur-prev)/prev*100):null;
 document.getElementById('trafficProgressMeta').textContent=a.fetchedAt?'GA4 refreshed '+dt(a.fetchedAt):'GA4 history';
 document.getElementById('trafficProgressBody').innerHTML=
  '<div class="progressStats"><div class="progressStat"><small>Sessions last 7d</small><b>'+n(cur)+'</b></div><div class="progressStat"><small>7d vs prior 7d</small><b class="'+deltaClass(chg)+'">'+signedPct(chg)+'</b></div><div class="progressStat"><small>Strict humans 7d</small><b>'+n(data?.truth?.growth?.strictHumans7d)+'</b></div><div class="progressStat"><small>Sessions MTD</small><b>'+n(a?.sessions?.monthToDate)+'</b></div></div>'+
  '<div class="chartBox">'+seriesChart(rows,[{key:'sessions',label:'GA4 sessions',cls:'primary'},{key:'humans',label:'Strict verified humans',cls:'good',dots:true}])+'</div>'+
  '<div class="sourceLine">Traffic line is GA4 canonical acquisition. Green proof points are strict human diagnostics and do not override or erase GA4 sessions.</div>';
}
function authorityProgress(){
 const b=data?.truth?.authority||{},live=data?.authority||{},rows=Array.isArray(b.history30)?b.history30:[];
 const queue=live.queue!=null?live.queue:b.authorityQueue,attempts24=live.attempts24!=null?live.attempts24:b.attempts24,min24=live.attemptMin24h!=null?live.attemptMin24h:b.attemptMin24h;
 const handoff=live.senderFreshClaim&&Number(live.senderClaimed||0)>0;
 document.getElementById('authorityProgressMeta').textContent=b.latestPlacementVerifiedAt?'Latest placement '+dt(b.latestPlacementVerifiedAt):(b.lastVerifiedAt?'Last backlink '+dt(b.lastVerifiedAt):'Verified authority history');
 document.getElementById('authorityProgressBody').innerHTML=
  '<div class="progressTop"><div class="progressStats"><div class="progressStat"><small>Observed backlinks</small><b>'+n(b.observedBacklinks??b.verifiedBacklinks)+'</b></div><div class="progressStat"><small>Domain authority</small><b>'+(b.domainAuthority==null?'Unavailable':n(b.domainAuthority))+'</b></div><div class="progressStat"><small>Attempts 7d</small><b>'+n(b.attempts7d)+'</b></div><div class="progressStat"><small>Authority queue</small><b>'+n(queue)+'</b></div><div class="progressStat"><small>24h floor</small><b>'+n(attempts24)+' / '+n(min24)+'</b></div></div>'+donut(b.referringDomains??b.verifiedReferringDomains,b.bootstrapFloor)+'</div>'+
  '<div class="chartBox">'+seriesChart(rows,[{key:'placements',label:'Verified placements',cls:'primary'},{key:'backlinks',label:'Observed backlinks',cls:'good'},{key:'referringDomains',label:'Referring domains',cls:'warn'}])+'</div>'+
  '<div class="section">'+
    row('Latest authority placement',b.latestPlacementVerifiedAt?dt(b.latestPlacementVerifiedAt):'Unavailable','Any verified public authority placement')+
    row('Last backlink verified',b.lastVerifiedAt?dt(b.lastVerifiedAt):'Unavailable','Backlink-specific evidence')+
    (b.seRankingReferringDomains!=null?row('SE Ranking authority profile',n(b.seRankingBacklinks)+' backlinks · '+n(b.seRankingReferringDomains)+' referring domains',(b.seRankingDofollowBacklinks==null?'':n(b.seRankingDofollowBacklinks)+' dofollow links · ')+(b.seRankingDofollowReferringDomains==null?'':n(b.seRankingDofollowReferringDomains)+' dofollow domains · ')+(b.domainAuthority==null?'':'authority '+n(b.domainAuthority)+' · ')+'snapshot '+dt(b.seRankingObservedAt)):'')+
    row('Internal verification ledger',n(b.internalVerifiedBacklinkSurfaces??b.internalVerifiedBacklinks)+' backlink-bearing placements',(b.backlinkReconciliationGap>0?n(b.backlinkReconciliationGap)+' additional individual backlink URLs are observed by SE Ranking; they are not collapsed into the placement ledger.':'External backlink observation and the internal placement ledger currently have no positive count gap.'))+
    (handoff?row('Authority handoff','In progress',n(live.senderClaimed)+' sender task claimed at '+dt(live.senderNewestClaimedAt)):'')+
  '</div>'+
  '<div class="sourceLine">Backlinks are individual link URLs; referring domains are unique source domains. '+(b.seRankingBacklinks!=null?'SE Ranking currently observes '+n(b.seRankingBacklinks)+' backlink URLs across '+n(b.seRankingReferringDomains)+' referring domains. ':'')+'The internal ledger counts ToolScout-verified backlink-bearing placements separately and is not forced to equal the external link-row total. The bootstrap floor is a milestone, not a stop condition.</div>';
}
function gscProgress(){
 const g=data?.truth?.search||{},rows=Array.isArray(g.daily28)?g.daily28:[],chg=g.change7d||{};
 document.getElementById('gscProgressMeta').textContent=(g.verifiedThroughDate?'Verified through '+esc(compactDate(g.verifiedThroughDate))+' - ':'')+'refreshed '+dt(g.runtimeGeneratedAt||g.generatedAt);
 document.getElementById('gscProgressBody').innerHTML=
  '<div class="progressStats"><div class="progressStat"><small>Impressions 28d</small><b>'+n(g.impressions)+'</b></div><div class="progressStat"><small>Clicks 28d</small><b>'+n(g.clicks)+'</b></div><div class="progressStat"><small>Completed 7d change</small><b class="'+deltaClass(chg.impressionsPct)+'">'+signedPct(chg.impressionsPct)+'</b></div><div class="progressStat"><small>Avg position change</small><b class="'+deltaClass(chg.positionDelta==null?null:-Number(chg.positionDelta))+'">'+(chg.positionDelta==null?'Unavailable':(Number(chg.positionDelta)>0?'+':'')+Number(chg.positionDelta).toFixed(1)+(g.recent7?.position==null?'':' ('+Number(g.recent7.position).toFixed(1)+')'))+'</b></div></div>'+
  '<div class="chartBox">'+seriesChart(rows,[{key:'impressions',label:'Google impressions',cls:'primary'}])+'</div>'+
  '<div class="sourceLine">The trend stops at the latest completed GSC day. The current partial day is excluded from the chart and from the 7-day comparison so it cannot create an artificial drop to zero.</div>';
}

function brain(){
 const t=data.truth||{},eng=Array.isArray(t.engines)?t.engines:[],primary=eng.filter(x=>['distribution','content','audience','seo_geo_aio','affiliate','catalog'].includes(x.engine));
 const growth=t.growth||{},body=[];
 body.push('<div class="headline"><b>'+esc(human(growth.directive||'No current directive'))+'</b><span>Status '+esc(growth.status||'unavailable')+'. Infrastructure health and business performance are intentionally separate.</span></div>');
 for(const x of primary){
   body.push('<div class="engine"><div class="engineName">'+esc(human(x.engine))+'</div><div>'+pill(human(x.status||'unknown'),statusState(x.status))+'</div><div class="engineText">'+esc(human(x.directive||'No directive'))+'</div><div class="engineTime">'+esc(dt(x.lastEvaluatedAt))+'</div></div>');
 }
 const ec=t.executionContract||{},arch=t.architecture||{};
 body.push('<div class="section">'+
   row('Execution contract',n(ec.verified)+' verified',n(ec.missingExecutors)+' missing executors - '+n(ec.stalled)+' stalled - '+n(ec.inFlight)+' in flight')+
   row('Architecture incidents',n(arch.openIncidents),arch.approvalRequired?'Approval required':'No architecture approval required')+
   '</div>');
 const activity=Array.isArray(t.growthActivity)?t.growthActivity.slice(0,7):[];
 if(activity.length)body.push('<div class="section"><div class="sectionTitle">Latest engine activity</div>'+activity.map(x=>row(human((x.engine||'engine')+' - '+(x.mission||'cycle')),human(x.status||'unknown'),dt(x.at)+(x.detail?' - '+human(x.detail):''))).join('')+'</div>');
 const actions=Array.isArray(t.growthActions)?t.growthActions.slice(0,6):[];
 if(actions.length)body.push('<div class="section"><div class="sectionTitle">Latest external action pipeline · 6 most recent</div>'+actions.map(x=>row(human((x.engine||'growth')+' - '+(x.channel||'action')),human(x.status||'unknown'),dt(x.at)+' - '+human(x.opportunityKey||x.id||''))).join('')+'<div class="sourceLine">This is a recent activity sample, not the size of the executable backlog or the daily capacity.</div></div>');
 const frontier=Array.isArray(data?.stats?.growthOps?.autonomousGrowth?.rnd_frontier_items)?data.stats.growthOps.autonomousGrowth.rnd_frontier_items.slice(0,6):[];
 if(frontier.length)body.push('<div class="section"><div class="sectionTitle">Growth R&D - new acquisition ideas</div>'+
   frontier.map(x=>'<div class="task" style="margin-top:8px"><div class="taskTop"><div><div class="taskTitle">'+esc(x.title||x.id||'Acquisition idea')+'</div><div class="taskMeta">'+esc(human(x.implementation_mode||'candidate'))+' - automation '+n(x.automation_score)+'/100 - semi-passive '+n(x.semi_passive_score)+'/100</div></div>'+pill(human(x.status||'candidate'),'warn')+'</div><div class="taskText"><b>Mechanism:</b> '+esc(x.mechanism||'')+'</div><div class="taskText"><b>Next:</b> '+esc(x.next_step||'Research and bind a safe executor.')+'</div><div class="taskText"><b>Signal:</b> '+esc(human(x.expected_signal||'traffic impact'))+'</div></div>').join('')+
 '</div>');
 document.getElementById('brainMeta').textContent='Evaluated '+dt(growth.lastEvaluatedAt||t.generatedAt);
 document.getElementById('brainBody').innerHTML=body.join('');
}
function throughput(){
 const t=data.truth||{},g=t.growth||{},c=data.compute||{},a=data.auth||{};
 const researchUsed=Number(c.researchUsedToday||0),researchMax=Number(c.dailyJobBudget||g.researchExternalJobMax24h||1500);
 const execUsed=Number(c.executionUsedToday||0),execMax=Number(c.executionDailyJobBudget||g.machineSafeExternalActionMax24h||800);
 const funnel=c.distributionFunnel||{},researchCompleted=Number(funnel.researchCompletedToday||0),routesFound=Number(funnel.submissionRoutesFoundToday||0),machineCandidates=Number(funnel.machineCandidatesFoundToday||0),formRoutes=Number(funnel.formRoutesSeenToday||0),authRoutes=Number(funnel.authRoutesSeenToday||0),captchaRoutes=Number(funnel.captchaRoutesSeenToday||0),policyBlockers=Number(funnel.policyBlockersSeenToday||0),adaptersReady=Number(funnel.adaptersReady||0),actionsAuthorized=Number(funnel.actionsAuthorizedToday??execUsed),actionsCompleted=Number(funnel.actionsCompletedToday||0),submissionsAccepted=Number(funnel.submissionsAcceptedToday||0),placementsVerified=Number(funnel.placementsVerifiedToday||0);
 const emailSent=Number(g.emailSent24h||0),emailTarget=Number(g.emailTarget24h||50),emailMax=Number(g.emailMax24h||60);
 const supply=c.contactSupply||{},readyContacts=Number(supply.readyEmail??g.contactSupplyReadyEmail??g.emailReadyContacts??0),supplyTarget=Number(supply.targetReady??g.contactSupplyTarget??200),supplyMin=Number(supply.minReady??g.contactSupplyMin??150),readyRoutes=Number(supply.readyRoute??g.contactSupplyReadyRoute??0),cooldown=Number(supply.cooldown??g.contactSupplyCooldown??0),researching=Number(supply.researching??g.contactSupplyResearching??0),unresolved=Number(supply.unresolved??g.contactSupplyUnresolved??0),apolloEligible=Number(supply.apolloEligible??g.contactSupplyApolloEligible??0),leased=Number(g.emailLeasedRecent||0),quarantine=Number(g.emailReputationQuarantine||0);
 const authActive=Number(a.activeSessions||0),authBootstrap=Number(a.bootstrapRequired||0),authCaps=Number(a.capabilities||0);
 const batchSize=Number(c.batchSize||25),queued=Number(c.queued||0);
 const now=new Date(),utcHours=now.getUTCHours()+now.getUTCMinutes()/60,expectedExecPace=execMax*(utcHours/24);
 const machineSupplyUnderfed=String(c.status||'')==='configured'&&execMax>0&&expectedExecPace>=4&&execUsed<Math.max(2,expectedExecPace*0.25)&&queued<=batchSize*2;
 let bottleneck='No capacity bottleneck proven.';
 let bottleneckMeta='Business outcomes remain the constraint to scale decisions.';
 if(queued>batchSize*4){bottleneck='External compute backlog';bottleneckMeta=n(queued)+' jobs queued · '+n(c.activeBatches)+' active batches.'}
 else if(machineSupplyUnderfed){bottleneck='Machine-safe action supply';bottleneckMeta=n(execUsed)+' / '+n(execMax)+' actions used today versus '+n(Math.round(expectedExecPace))+' at linear daily pace. Discovery and qualification must keep Render fed.'}
 else if(readyContacts<supplyMin){bottleneck='Qualified email contact supply';bottleneckMeta=n(readyContacts)+' / '+n(supplyTarget)+' unique-domain email buffer · minimum '+n(supplyMin)+'.'}
 else if(authBootstrap>0&&authActive===0){bottleneck='Authentication bootstrap';bottleneckMeta=n(authBootstrap)+' reusable session(s) need one-time owner login/challenge.'}
 document.getElementById('throughputMeta').textContent='Updated '+dt(t.generatedAt)+' · capacity is not a success KPI';
 document.getElementById('throughputBody').innerHTML=
   '<div class="headline"><b>'+esc(bottleneck)+'</b><span>'+esc(bottleneckMeta)+'</span></div>'+
   '<div class="metrics">'+
     metric('Research jobs - today',n(researchCompleted)+' completed',n(researchUsed)+' authorized · '+n(researchMax)+' daily capacity')+
     metric('Machine-safe actions - today',n(actionsCompleted)+' completed',n(actionsAuthorized)+' authorized · '+n(execMax)+' daily capacity')+
     metric('Emails - rolling 24h',n(emailSent)+' / '+n(emailTarget),'hard max '+n(emailMax)+' · '+n(leased)+' currently leased')+
     metric('Recipient buffer',n(readyContacts)+' / '+n(supplyTarget),'minimum '+n(supplyMin)+' · '+n(cooldown)+' cooldown · '+n(readyRoutes)+' alternate routes')+
     metric('Contact discovery',n(researching)+' researching',n(unresolved)+' unresolved · '+n(apolloEligible)+' Apollo-eligible')+
     metric('Auth sessions',n(authActive),n(authBootstrap)+' bootstrap required · '+n(authCaps)+' classified')+
   '</div>'+
   '<div class="section"><div class="sectionTitle">Distribution execution funnel</div>'+
     row('Research completed',n(researchCompleted),'External route research completed today')+
     row('Submission routes found',n(routesFound),'All same-host submission routes found, including manual/auth routes')+
     row('Machine-safe form candidates',n(machineCandidates),'Render found a no-auth, no-CAPTCHA, no-payment POST form that passed structural safety checks')+
     row('Route blockers observed',n(formRoutes)+' forms · '+n(authRoutes)+' auth · '+n(captchaRoutes)+' CAPTCHA',n(policyBlockers)+' policy blocker signals in newly classified research results')+
     row('Verified adapters ready',n(adaptersReady),'Canonical policy accepted a machine-safe adapter and it is ready for execution')+
     row('Actions authorized',n(actionsAuthorized),'Cloudflare authorized machine-safe execution today')+
     row('Actions completed',n(actionsCompleted),'Render completed authorized submission jobs today')+
     row('Submissions accepted',n(submissionsAccepted),'External service accepted the ToolScout submission today')+
     row('Placements verified today',n(placementsVerified),'Verification events completed today; these can belong to submissions from an earlier cohort')+
   '</div>'+
   '<div class="section"><div class="sectionTitle">Execution architecture</div>'+
     row('Control plane','Cloudflare','Priorities, policy, leases, canonical D1 state and final verification')+
     row('Research + machine execution',human(c.status||'Unavailable'),(c.providerUrl||'Render overflow')+' · batch '+n(c.batchSize)+' · max '+n(c.maxActiveBatches)+' active')+
     row('Research retry cadence',n(c.distributionResearchBucketHours||6)+'h routes · '+n(c.roleEmailResearchBucketHours||24)+'h contacts','Completed research can be revisited; unique job keys no longer make a surface permanently one-shot')+
     row('Email sender',human(g.emailDeliveryMode||'Unavailable'),'Target '+n(emailTarget)+' · max '+n(emailMax)+' / rolling 24h · reputation boundary retained')+
     row('Contact Supply Engine',human(supply.status||'active'),n(readyContacts)+' ready emails · '+n(readyRoutes)+' contact routes · '+human(supply.apolloStatus||g.contactSupplyApolloStatus||'provider unavailable'))+
     row('Auth Plane',human(a.status||'Unavailable'),a.brokerRuntime?.ok?'Chromium broker healthy · CAPTCHA/MFA human-only':'Broker health '+human(a.brokerRuntime?.error||'unavailable'))+
     row('GitHub Actions','Disabled until October','Not counted as current execution capacity')+
   '</div>'+
   '<div class="sourceLine">Outcome hierarchy remains GA4 sessions → strict humans → verified outbound → monetized outbound → confirmed revenue. Capacity metrics only explain how fast the Growth Brain can work.</div>';
}
function taskHtml(x){
 const url=safeUrl(x.action_url),isReputation=x.engine==='reputation',isAuth=x.engine==='distribution'&&(x.gate_type==='authentication'||x.status==='auth_required'),canConfirm=!isReputation&&!isAuth&&(x.engine==='distribution'||(x.engine==='affiliate'&&['ready_to_apply','human_action_required'].includes(x.status)));
 const label=x.gate_key?'Mark done':x.editorial_queue_id?'I published it':(x.engine==='affiliate'&&x.status==='human_action_required'?'I completed it':'I submitted it');
 const copy=(label,value)=>value?'<button class="btn" data-copy="'+encodeURIComponent(String(value))+'">'+esc(label)+'</button>':'';
 let payload='';
 if(x.prepared_body||x.prepared_title){payload='<details class="payload" '+(isReputation?'open':'')+'><summary>'+(isReputation?'Blocked email':'Prepared payload')+'</summary>'+(x.recipient?'<div class="taskText"><b>To:</b> '+esc(x.recipient)+'</div>':'')+(x.blocked_reasons?'<div class="taskText"><b>Blocked because:</b> '+esc(x.blocked_reasons)+'</div>':'')+(x.prepared_title?'<pre>'+esc(x.prepared_title)+'</pre>'+copy('Copy subject',x.prepared_title):'')+(x.prepared_body?'<pre>'+esc(x.prepared_body)+'</pre>'+copy('Copy body',x.prepared_body):'')+'</details>'}
 const reputationActions=isReputation?'<button class="btn danger" data-reputation="correct_block" data-kind="'+esc(x.reputation_kind||'')+'" data-key="'+esc(x.reputation_key||'')+'">Block correct</button><button class="btn primary" data-reputation="false_positive" data-kind="'+esc(x.reputation_kind||'')+'" data-key="'+esc(x.reputation_key||'')+'">Send now + learn</button>':'';
 return '<div class="task"><div class="taskTop"><div><div class="taskTitle">'+esc(x.title||x.id)+'</div><div class="taskMeta">'+esc(x.engine||'human gate')+' - '+esc(x.status||'ready')+' - about '+esc(x.estimated_minutes||0)+' min</div></div>'+pill(isReputation?'reputation review':(x.expected_impact_score?'impact '+Math.round(x.expected_impact_score):'human gate'),isReputation?'bad':'warn')+'</div>'+
  '<div class="taskText"><b>Do:</b> '+esc(x.instructions||x.reason||'Complete the linked external step.')+'</div>'+
  (x.expected_impact?'<div class="taskText"><b>Expected result:</b> '+esc(x.expected_impact)+'</div>':'')+payload+
  '<div class="taskActions">'+reputationActions+(isAuth?'<button class="btn primary" data-auth-handoff="'+esc(x.id)+'">Open secure login session</button>':(url?'<a class="btn primary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open action</a>':''))+copy('Copy steps',x.instructions||x.reason||'')+
  (canConfirm?'<button class="btn" data-resolve="submitted" data-engine="'+esc(x.engine)+'" data-id="'+esc(x.id)+'" data-status="'+esc(x.status||'')+'" data-gate="'+esc(x.gate_key||'')+'">'+esc(label)+'</button>':'')+
  (!isReputation&&x.engine==='distribution'?'<button class="btn danger" data-resolve="skipped" data-engine="distribution" data-id="'+esc(x.id)+'">Skip</button>':'')+'</div></div>';
}
function queue(){
 const q=data.queue||data?.stats?.growthOps?.chairmanQueue||null;
 if(!q&&sourceErrors.queue){
  document.getElementById('queueMeta').textContent='Unavailable';
  document.getElementById('queueBody').innerHTML='<div class="issue warn"><b>Chairman Queue could not refresh.</b>This is a source/session error, not an empty queue. The Command Center will retry automatically.</div>';
  return;
 }
 const safeQ=q||{items:[],total:0,estimated_minutes:0};
 const items=Array.isArray(safeQ.items)?safeQ.items:[];
 document.getElementById('queueMeta').textContent=items.length?n(safeQ.total)+' current':(sourceErrors.queue?'Last known state':'Clear');
 document.getElementById('queueBody').innerHTML=items.length?items.map(taskHtml).join(''):'<div class="empty"><b>No owner action is ready.</b><br><br>Incomplete or machine-resolvable tasks stay out of this queue.</div>';
 if(sourceErrors.queue&&items.length)document.getElementById('queueBody').insertAdjacentHTML('afterbegin','<div class="issue warn"><b>Queue refresh delayed.</b>Showing the last successful queue state while the source retries.</div>');
}
function results(){
 const t=data?.truth||{},items=Array.isArray(t.recentResults)?t.recentResults.slice(0,14):[],activity=Array.isArray(t.growthActivity)?t.growthActivity[0]:null,action=Array.isArray(t.growthActions)?t.growthActions[0]:null;
 let summary='<div class="section"><div class="sectionTitle">Freshness</div>'+
   row('Latest autonomous engine activity',activity?.at?dt(activity.at):'Unavailable',activity?human((activity.engine||'engine')+' - '+(activity.mission||'cycle')+' - '+(activity.status||'unknown')):'No activity evidence')+
   row('Latest action pipeline change',action?.at?dt(action.at):'Unavailable',action?human((action.engine||'growth')+' - '+(action.channel||'action')+' - '+(action.status||'unknown')):'No action evidence')+
   row('Latest verified external result',items[0]?.at?dt(items[0].at):'Unavailable',items[0]?.label||'No verified result')+
 '</div>';
 if(!items.length){document.getElementById('resultsBody').innerHTML=summary+'<div class="empty">No verified external result has been recorded in the last 7 days.</div>';return}
 document.getElementById('resultsBody').innerHTML=summary+items.map(i=>'<div class="log"><div class="logTime">'+esc(dt(i.at))+'</div><div class="logEngine">'+esc(human(i.engine||'engine'))+'</div><div class="logMain"><b>'+esc(i.label||i.type||i.id||'Execution')+'</b><span>'+esc(i.detail||human(i.type||''))+'</span></div><div class="logStatus">'+pill(human(i.status||'observed'),statusState(i.status))+'</div></div>').join('');
}
function health(){
 const t=data.truth||{},rt=data.runtime||{},a=data.authority||{},compute=data.compute||{},auth=data.auth||{},issues=[];
 const ec=t.executionContract||{},arch=t.architecture||{},g=t.search||{},growth=t.growth||{};
 if(Number(ec.missingExecutors||0)>0)issues.push({level:'bad',title:'Missing execution contracts',detail:n(ec.missingExecutors)+' executor mappings are missing.'});
 if(Number(ec.stalled||0)>0)issues.push({level:'bad',title:'Stalled execution contracts',detail:n(ec.stalled)+' tasks are stalled.'});
 if(Number(arch.openIncidents||0)>0){
   const top=Array.isArray(arch.items)&&arch.items.length?arch.items[0]:null;
   issues.push({level:'bad',title:'Architecture incidents',detail:top?(n(arch.openIncidents)+' open · '+human(top.severity||'')+' · '+human(top.title||'Architecture incident')):(n(arch.openIncidents)+' open architecture incidents.')});
 }
 if(g.runtimeOk===false)issues.push({level:'bad',title:'GSC refresh failed',detail:g.runtimeStatus||'Search evidence refresh failed.'});
 const authorityFailureStates=new Set(['execution_required','external_handoff_timeout','handoff_reconciliation_required','failed']);
 if(a.status&&authorityFailureStates.has(String(a.status))){
   if(a.senderFreshClaim&&Number(a.senderClaimed||0)>0)issues.push({level:'warn',title:'Authority handoff in progress',detail:n(a.senderClaimed)+' sender task is claimed since '+dt(a.senderNewestClaimedAt)+'. Waiting for external callback evidence.'});
   else issues.push({level:a.status==='external_handoff_timeout'?'bad':'warn',title:'Authority loop',detail:'Authority closed loop reports '+human(a.status)+'. Runnable '+n(a.runnableQueue)+' · deferred '+n(a.deferredQueue)+' · total backlog '+n(a.queue)+'.'});
 }
 if(t.affiliate&&t.affiliate.reconciled===false)issues.push({level:'warn',title:'Affiliate metadata reconciliation',detail:n((t.affiliate.productionWithoutActivePipeline||[]).length)+' live production route(s) are not marked active in pipeline metadata: '+(t.affiliate.productionWithoutActivePipeline||[]).join(', ')+'. Production registry remains canonical.'});
 const emailMax=Number(growth.emailMax24h||60);
 if(Number(growth.emailSent24h||0)>=emailMax&&Number(growth.strictHumans7d||0)===0&&Number(growth.verifiedOutbound7d||0)===0)issues.push({level:'warn',title:'Email capacity saturated without measured yield',detail:n(growth.emailSent24h)+' emails in the rolling 24h window reached the '+n(emailMax)+' hard cap while strict humans and verified outbound remain 0 / 7d. Keep quality gates and rotate recipient/source supply before adding more volume.'});
 if(compute.status&&compute.status!=='configured')issues.push({level:'warn',title:'External compute plane',detail:'Compute overflow reports '+human(compute.status)+'.'});
 if(auth.status==='configured'&&auth.brokerRuntime&&auth.brokerRuntime.serviceOk===false)issues.push({level:'bad',title:'Auth broker unavailable',detail:human(auth.brokerRuntime.error||'Auth broker service health check failed.')});
 if(auth.status==='configured'&&auth.brokerRuntime?.serviceOk===true&&auth.brokerRuntime?.browserVerified===false)issues.push({level:'warn',title:'Auth browser diagnostic delayed',detail:'Auth broker service is live; Chromium diagnostic reports '+human(auth.brokerRuntime.diagnosticStatus||'degraded')+'. This does not block the control plane unless an auth handoff itself fails.'});
 if(!issues.length)issues.push({level:'good',title:'No active integrity issue',detail:'Execution contracts, architecture, GSC refresh, authority, external compute and Auth Plane have no current measurable failure.'});
 const rows=[
  ['Runtime',rt.architecture||'Unavailable',(rt.primary?.runtime||'')+' - scheduler '+(rt.primary?.scheduler||'')],
  ['External compute',compute.status||'Unavailable',n(compute.completedToday)+' completed today · '+n(compute.queued)+' queued'],
  ['Email plane',growth.emailDeliveryMode||'Unavailable',n(growth.emailSent24h)+' sent / 24h · '+n(growth.emailReadyContacts)+' ready contacts'],
  ['Auth Plane',auth.status||'Unavailable',n(auth.activeSessions)+' active sessions · '+n(auth.bootstrapRequired)+' bootstrap required'],
  ['GitHub Actions',rt.githubActions?.role||'Unavailable',rt.githubActions?.scheduledPrimary===false?'Disabled/fallback only':'Check scheduling role'],
  ['GSC evidence',g.runtimeStatus||'Unavailable',g.runtimeGeneratedAt?dt(g.runtimeGeneratedAt):'No runtime timestamp'],
  ['Authority',a.status||'Unavailable',n(a.attempts24)+' attempts / 24h'],
  ['Execution contract',n(ec.verified)+' verified',n(ec.ready)+' ready - '+n(ec.inFlight)+' in flight - '+n(ec.deferred)+' deferred'],
  ['Affiliate programmes',n(t.affiliate?.productionRoutes)+' active','Canonical production registry']
 ];
 const architectureDetail=Array.isArray(arch.items)&&arch.items.length
   ?'<div class="section"><div class="sectionTitle">Open architecture incident detail</div>'+arch.items.slice(0,3).map(x=>row(human((x.severity||'')+' · '+(x.title||x.id||'Incident')),human(x.engine||'growth')+(x.executor?' · '+human(x.executor):''),human(x.summary||'')+' · detected '+dt(x.lastDetectedAt))).join('')+'</div>'
   :'';
 document.getElementById('healthBody').innerHTML=issues.map(i=>'<div class="issue '+i.level+'"><b>'+esc(i.title)+'</b>'+esc(i.detail)+'</div>').join('')+'<div class="section">'+rows.map(x=>row(x[0],x[1],x[2])).join('')+'</div>'+architectureDetail+'<div class="sourceLine">Critical metrics are read from the canonical business truth endpoint. Missing data is not converted to zero.</div>';
}
function render(){business();trafficProgress();authorityProgress();gscProgress();brain();throughput();queue();results();health()}
async function reviewReputation(button){
 const kind=button.dataset.kind,key=button.dataset.key,verdict=button.dataset.reputation;
 if(!kind||!key||!verdict)return;
 const old=button.textContent;button.disabled=true;button.textContent=verdict==='false_positive'?'Sending…':'Saving';
 try{
  const r=await ccFetch('/analytics/api/reputation-review',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,key,verdict})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false)throw new Error(j.error||'review_failed');
  data.queue=await get(endpoints.queue);queue();health();
 }catch(e){button.textContent='Save failed';setTimeout(()=>{button.disabled=false;button.textContent=old},1500)}
}
async function startAuthHandoff(button){
 const slug=button.dataset.authHandoff||'';if(!slug)return;
 const old=button.textContent;button.disabled=true;button.textContent='Starting secure session...';
 try{
  const r=await ccFetch('/analytics/api/human-actions/auth-handoff',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({surface_slug:slug})});
  const j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw new Error(j.error||'auth_handoff_failed');
  button.disabled=false;button.textContent=old;if(j.handoff_url)window.open(j.handoff_url,'_blank','noopener,noreferrer');
  data.queue=await get(endpoints.queue);queue();health();
 }catch(e){button.textContent='Try secure login again';setTimeout(()=>{button.disabled=false;button.textContent=old},1800)}
}
async function resolveTask(button){
 const engine=button.dataset.engine,id=button.dataset.id,action=button.dataset.resolve,status=button.dataset.status||'',gate=button.dataset.gate||'';
 if(!engine||!id||!action)return;const old=button.textContent;button.disabled=true;button.textContent='Saving';
 try{
  const resultUrl=gate?window.prompt('Paste the result or listing URL if available. Leave blank if the service is reviewing the submission.',''):'';
  if(gate&&resultUrl===null){button.disabled=false;button.textContent=old;return}
  const endpoint=gate?'/analytics/api/human-actions/gate':engine==='distribution'?'/analytics/api/distribution-human-action':'/analytics/api/affiliate-human-action';
  const affiliateEvent=status==='human_action_required'?'completed':'submitted';
  const body=gate?{gate_key:gate,result_url:resultUrl}:engine==='distribution'?{surface_slug:id,action}:{tool_slug:id,event:affiliateEvent,evidence:'Confirmed from simplified Command Center'};
  const r=await ccFetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));
  if(!r.ok||j.ok===false)throw new Error(j.error||'save_failed');data.queue=await get(endpoints.queue);queue();health();
 }catch(e){button.textContent='Save failed';setTimeout(()=>{button.disabled=false;button.textContent=old},1500)}
}
document.addEventListener('click',e=>{
 const c=e.target.closest('[data-copy]');if(c){e.preventDefault();const old=c.textContent,value=decodeURIComponent(c.dataset.copy||'');navigator.clipboard.writeText(value).then(()=>{c.textContent='Copied';setTimeout(()=>c.textContent=old,1200)}).catch(()=>{c.textContent='Copy failed';setTimeout(()=>c.textContent=old,1500)});return}
 const rep=e.target.closest('[data-reputation]');if(rep){e.preventDefault();reviewReputation(rep);return}
 const auth=e.target.closest('[data-auth-handoff]');if(auth){e.preventDefault();startAuthHandoff(auth);return}
 const b=e.target.closest('[data-resolve]');if(b){e.preventDefault();resolveTask(b)}
});
const FAST_KEYS=['queue','runtime','authority','compute','auth'];
const HEAVY_KEYS=['stats','truth'];
let fastBusy=false,heavyBusy=false,lastFast=0,lastHeavy=0;

async function fetchKeys(keys,{fresh=false,announce=false}={}){
 const btn=document.getElementById('refresh');const failures=[];let completed=0;
 if(announce){btn.disabled=true;document.getElementById('status').innerHTML='<strong>Refreshing current evidence...</strong>'}
 // Never leave the whole page behind a loading barrier while one source is slow.
 render();
 await Promise.all(keys.map(async k=>{
   try{data[k]=await get(endpoints[k],fresh);sourceErrors[k]=null}
   catch(e){sourceErrors[k]=String(e?.name==='TimeoutError'?'timeout':(e?.message||e));failures.push(k)}
   finally{
     completed++;render();
     if(announce)document.getElementById('sourceStatus').textContent=completed+' / '+keys.length+' sources resolved';
   }
 }));
 if(announce){
   const stamp=new Date().toLocaleString(undefined,{timeZone:'Europe/Lisbon'});
   document.getElementById('status').innerHTML='<strong>Updated '+esc(stamp)+'</strong> - '+(failures.length?'Some sources unavailable: '+esc(failures.join(', ')):'All canonical sources responded.');
   document.getElementById('sourceStatus').textContent=failures.length?(keys.length-failures.length)+' / '+keys.length+' refreshed sources live':keys.length+' / '+keys.length+' refreshed sources live';
   btn.disabled=false;
 }
 return failures;
}
async function loadFast(){
 if(document.hidden||fastBusy)return;
 fastBusy=true;try{await fetchKeys(FAST_KEYS);lastFast=Date.now()}finally{fastBusy=false}
}
async function loadHeavy(){
 if(document.hidden||heavyBusy)return;
 heavyBusy=true;try{await fetchKeys(HEAVY_KEYS);lastHeavy=Date.now()}finally{heavyBusy=false}
}
async function loadAll(fresh=false){
 if(fastBusy||heavyBusy)return;
 fastBusy=heavyBusy=true;
 try{
   await fetchKeys(Object.keys(endpoints),{fresh,announce:true});
   lastFast=lastHeavy=Date.now();
 }finally{fastBusy=heavyBusy=false}
}
document.getElementById('refresh').addEventListener('click',()=>loadAll(true));
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)return;
 const now=Date.now();
 if(now-lastFast>=60000)loadFast();
 if(now-lastHeavy>=180000)loadHeavy();
});
loadAll(false);
setInterval(loadFast,60000);
setInterval(loadHeavy,180000);
</script>
</body>
</html>`;
}
