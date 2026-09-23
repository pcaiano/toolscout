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
.chartBox{border:1px solid var(--line);background:var(--soft);border-radius:13px;padding:10px;margin-top:9px}.chartSvg{width:100%;height:210px;display:block}.chartGrid{stroke:var(--line);stroke-width:1}.chartAxis{fill:var(--muted);font-size:9px}.chartLine{fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.chartLine.primary{stroke:var(--info)}.chartLine.good{stroke:var(--good)}.chartDot.primary{fill:var(--info)}.chartDot.good{fill:var(--good)}.chartLegend{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:var(--muted);margin-top:5px}.legendKey{display:inline-flex;align-items:center;gap:5px}.legendKey i{width:9px;height:3px;border-radius:99px;display:inline-block}.legendKey i.primary{background:var(--info)}.legendKey i.good{background:var(--good)}.progressTop{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.progressStats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.progressStat{border:1px solid var(--line);border-radius:10px;padding:8px;background:#fff}.progressStat small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:850}.progressStat b{display:block;font-size:17px;margin-top:3px}.deltaUp{color:var(--good)}.deltaDown{color:var(--bad)}.deltaFlat{color:var(--muted)}.donut{width:92px;height:92px;position:relative}.donut svg{width:92px;height:92px;transform:rotate(-90deg)}.donutTrack{fill:none;stroke:var(--line);stroke-width:9}.donutValue{fill:none;stroke:var(--good);stroke-width:9;stroke-linecap:round}.donutText{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-weight:850;font-size:16px}.donutText small{font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.empty{padding:24px 8px;text-align:center;color:var(--muted);font-size:11px}.issue{border:1px solid #f1b6b0;background:#fff5f4;border-radius:11px;padding:10px;margin-top:8px;font-size:11px;line-height:1.45}.issue.warn{border-color:#ead69b;background:#fffaf0}.issue.good{border-color:#b9dfca;background:#f3fbf6}.issue b{display:block;margin-bottom:3px}.small{font-size:10px;color:var(--muted);line-height:1.4}.sourceLine{font-size:9px;color:var(--muted);margin-top:8px}
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
<section class="card span7"><div class="head"><div><div class="kicker">Autonomous execution</div><div class="title">Growth Brain</div></div><div class="meta" id="brainMeta">What it is doing now</div></div><div class="body" id="brainBody"><div class="empty">Loading...</div></div></section>
<section class="card span5"><div class="head"><div><div class="kicker">Human exceptions only</div><div class="title">Needs You</div></div><div class="meta" id="queueMeta">Chairman Queue</div></div><div class="body" id="queueBody"><div class="empty">Loading...</div></div></section>
<section class="card span7"><div class="head"><div><div class="kicker">Actions and outcomes</div><div class="title">Recent Results</div></div><div class="meta">External evidence only</div></div><div class="body" id="resultsBody"><div class="empty">Loading...</div></div></section>
<section class="card span5"><div class="head"><div><div class="kicker">Organic demand and authority</div><div class="title">Search + Authority</div></div><div class="meta" id="searchMeta">GSC + verified backlinks</div></div><div class="body" id="searchBody"><div class="empty">Loading...</div></div></section>
<section class="card span12"><div class="head"><div><div class="kicker">Reliability</div><div class="title">System Truth</div></div><div class="meta">Only current, measurable issues</div></div><div class="body" id="healthBody"><div class="empty">Loading...</div></div></section>
</main>
</div>
<script>
const endpoints={stats:'/analytics/api/stats',queue:'/analytics/api/chairman-queue',truth:'/api/command-center-business-truth',runtime:'/api/runtime/executors',authority:'/api/distribution/authority/closed-loop-health'};
let data={stats:null,queue:null,truth:null,runtime:null,authority:null};
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

const compactDate=v=>{const s=String(v||'');if(/^\d{8}$/.test(s))return s.slice(4,6)+'/'+s.slice(6,8);if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(5,10).replace('-','/');return s};
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

function statusState(v){v=String(v||'').toLowerCase();if(['healthy','working','active','supporting','completed','verified','refreshed','connected','observed'].includes(v))return'good';if(['critical','failed','stalled','blocked','unavailable','execution_gap','evidence_stale','executor_stale'].includes(v))return'bad';return'warn'}
function safeUrl(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():''}catch{return''}}
async function get(url){const r=await fetch(url+(url.includes('?')?'&':'?')+'t='+Date.now(),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error(String(r.status));return r.json()}
function business(){
 const t=data.truth||{},g=t.growth||{},b=t.authority||{},aff=t.affiliate||{},st=data.stats||{},a=st.acquisition||{},q=data.queue||st?.growthOps?.chairmanQueue||{},r=st.revenue||{},ga=a.sessions||{};
 let headline='Execution is running, but business results are not yet proven.';
 let detail='Growth Brain is prioritizing strict verified human acquisition and measurable downstream conversion.';
 if(Number(g.strictHumans24h)>0)headline='Verified humans are arriving. Conversion is now the next proof point.';
 if(Number(g.verifiedOutbound24h)>0)headline='Verified humans are reaching vendors. Monetization is now the next proof point.';
 if(Number(g.monetizedOutbound24h)>0)headline='Monetized outbound is active. Scale only sources that preserve verified human quality.';
 if(Number(r.confirmedRevenue||0)>0)headline='Confirmed revenue is now present. Focus on repeatable acquisition and monetized conversion.';
 document.getElementById('businessMeta').textContent='Business truth '+dt(t.generatedAt);
 document.getElementById('businessBody').innerHTML=
  '<div class="headline"><b>'+esc(headline)+'</b><span>'+esc(detail)+'</span></div>'+
  '<div class="metrics">'+
   metric('Strict humans - 24h',n(g.strictHumans24h),n(g.strictHumans7d)+' / 7d')+
   metric('Verified outbound - 24h',n(g.verifiedOutbound24h),n(g.verifiedOutbound7d)+' / 7d')+
   metric('Monetized outbound - 24h',n(g.monetizedOutbound24h),n(g.monetizedOutbound7d)+' / 7d')+
   metric('External executions - 24h',n(g.externalExecutions24h),n(g.externalExecutions7d)+' / 7d')+
   metric('Active affiliates',n(aff.productionRoutes),'Live ToolScout affiliate routes')+
   metric('Referring domains',n(b.verifiedReferringDomains),n(b.verifiedBacklinks)+' verified backlinks')+
   metric('Confirmed revenue',data.stats==null?'Source unavailable':(r.confirmedRevenue==null?'No confirmed evidence':money(r.confirmedRevenue,r.currency)),data.stats==null?'Stats source did not respond':(r.reportingStatus==='connected'?'Vendor evidence connected':'Vendor reporting not connected'))+
   metric('Needs you',q.total==null?'Unavailable':n(q.total),(q.estimated_minutes==null?'Source unavailable':n(q.estimated_minutes)+' min estimated'))+
  '</div>'+
  '<div class="section"><div class="sectionTitle">Business context</div>'+
   (a.status==='connected'?row('GA4 sessions - 24h',n(ga.last24Hours),n(ga.monthToDate)+' MTD - canonical GA4 population'):'')+
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
  '<div class="sourceLine">Traffic line is GA4 canonical acquisition. Green proof points are strict verified human evidence used by the Growth Brain.</div>';
}
function authorityProgress(){
 const b=data?.truth?.authority||{},rows=Array.isArray(b.history30)?b.history30:[];
 document.getElementById('authorityProgressMeta').textContent=b.lastVerifiedAt?'Last verified '+dt(b.lastVerifiedAt):'Verified authority history';
 document.getElementById('authorityProgressBody').innerHTML=
  '<div class="progressTop"><div class="progressStats"><div class="progressStat"><small>Verified backlinks</small><b>'+n(b.verifiedBacklinks)+'</b></div><div class="progressStat"><small>Attempts 7d</small><b>'+n(b.attempts7d)+'</b></div><div class="progressStat"><small>Authority queue</small><b>'+n(b.authorityQueue)+'</b></div><div class="progressStat"><small>24h floor</small><b>'+n(b.attempts24h)+' / '+n(b.attemptMin24h)+'</b></div></div>'+donut(b.verifiedReferringDomains,b.bootstrapFloor)+'</div>'+
  '<div class="chartBox">'+seriesChart(rows,[{key:'backlinks',label:'Verified backlinks',cls:'primary'},{key:'referringDomains',label:'Referring domains',cls:'good'}])+'</div>'+
  '<div class="sourceLine">Cumulative authority is built only from verified public backlink placements. The donut tracks the 10-domain bootstrap floor.</div>';
}
function gscProgress(){
 const g=data?.truth?.search||{},rows=Array.isArray(g.daily28)?g.daily28:[],chg=g.change7d||{},recent=g.recent7||{},prev=g.previous7||{};
 document.getElementById('gscProgressMeta').textContent='GSC refreshed '+dt(g.runtimeGeneratedAt||g.generatedAt);
 document.getElementById('gscProgressBody').innerHTML=
  '<div class="progressStats"><div class="progressStat"><small>Impressions 28d</small><b>'+n(g.impressions)+'</b></div><div class="progressStat"><small>Clicks 28d</small><b>'+n(g.clicks)+'</b></div><div class="progressStat"><small>Impressions 7d change</small><b class="'+deltaClass(chg.impressionsPct)+'">'+signedPct(chg.impressionsPct)+'</b></div><div class="progressStat"><small>Avg position change</small><b class="'+deltaClass(chg.positionDelta==null?null:-Number(chg.positionDelta))+'">'+(chg.positionDelta==null?'Unavailable':(Number(chg.positionDelta)>0?'+':'')+Number(chg.positionDelta).toFixed(1))+'</b></div></div>'+
  '<div class="chartBox">'+seriesChart(rows,[{key:'impressions',label:'Google impressions',cls:'primary'}])+'</div>'+
  '<div class="sourceLine">Search Console trend uses daily first-party API data. Lower average position is better; the comparison is recent 7 days versus the prior 7.</div>';
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
 document.getElementById('brainMeta').textContent='Evaluated '+dt(growth.lastEvaluatedAt||t.generatedAt);
 document.getElementById('brainBody').innerHTML=body.join('');
}
function taskHtml(x){
 const url=safeUrl(x.action_url),canConfirm=x.engine==='distribution'||(x.engine==='affiliate'&&['ready_to_apply','human_action_required'].includes(x.status));
 const label=x.gate_key?'Mark done':x.editorial_queue_id?'I published it':(x.engine==='affiliate'&&x.status==='human_action_required'?'I completed it':'I submitted it');
 const copy=(label,value)=>value?'<button class="btn" data-copy="'+encodeURIComponent(String(value))+'">'+esc(label)+'</button>':'';
 let payload='';
 if(x.prepared_body||x.prepared_title){payload='<details class="payload"><summary>Prepared payload</summary>'+(x.prepared_title?'<pre>'+esc(x.prepared_title)+'</pre>'+copy('Copy title',x.prepared_title):'')+(x.prepared_body?'<pre>'+esc(x.prepared_body)+'</pre>'+copy('Copy content',x.prepared_body):'')+'</details>'}
 return '<div class="task"><div class="taskTop"><div><div class="taskTitle">'+esc(x.title||x.id)+'</div><div class="taskMeta">'+esc(x.engine||'human gate')+' - '+esc(x.status||'ready')+' - about '+esc(x.estimated_minutes||0)+' min</div></div>'+pill(x.expected_impact_score?'impact '+Math.round(x.expected_impact_score):'human gate','warn')+'</div>'+
  '<div class="taskText"><b>Do:</b> '+esc(x.instructions||x.reason||'Complete the linked external step.')+'</div>'+
  (x.expected_impact?'<div class="taskText"><b>Expected result:</b> '+esc(x.expected_impact)+'</div>':'')+payload+
  '<div class="taskActions">'+(url?'<a class="btn primary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open action</a>':'')+copy('Copy steps',x.instructions||x.reason||'')+
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
 const items=Array.isArray(data?.truth?.recentResults)?data.truth.recentResults.slice(0,14):[];
 if(!items.length){document.getElementById('resultsBody').innerHTML='<div class="empty">No verified external result has been recorded in the last 7 days.</div>';return}
 document.getElementById('resultsBody').innerHTML=items.map(i=>'<div class="log"><div class="logTime">'+esc(dt(i.at))+'</div><div class="logEngine">'+esc(human(i.engine||'engine'))+'</div><div class="logMain"><b>'+esc(i.label||i.type||i.id||'Execution')+'</b><span>'+esc(i.detail||human(i.type||''))+'</span></div><div class="logStatus">'+pill(human(i.status||'observed'),statusState(i.status))+'</div></div>').join('');
}
function searchAuthority(){
 const t=data.truth||{},g=t.search||{},b=t.authority||{},rt=data.runtime||{},rh=rt.seo?.gscRuntimeHealth||{};
 document.getElementById('searchMeta').textContent='GSC refreshed '+dt(g.runtimeGeneratedAt||g.generatedAt);
 let html='<div class="metrics">'+
  metric('Impressions - 28d',n(g.impressions),n(g.clicks)+' clicks')+
  metric('Observed search pages',n(g.observedPages),(g.indexed!=null&&g.inspected!=null)?n(g.indexed)+' indexed / '+n(g.inspected)+' inspected':'URL Inspection not refreshed in this source')+
  metric('Referring domains',n(b.verifiedReferringDomains),n(b.verifiedBacklinks)+' verified backlinks')+
  metric('Authority attempts - 24h',n(b.attempts24h),n(b.attemptMin24h)+' minimum')+
 '</div>';
 html+='<div class="section">'+
  row('Authority queue',n(b.authorityQueue),b.throughputGap?'Throughput below target':(b.stagnating?'Stagnating':'Throughput healthy'))+
  row('GSC runtime',g.runtimeStatus||rh.status||'Unavailable',(g.runtimeOk||rh.ok)?'Cloudflare refresh verified':'Search refresh needs attention')+
  row('Last verified backlink',b.lastVerifiedAt?dt(b.lastVerifiedAt):'No recent verification',b.lastVerifiedAgeHours==null?'':dec(b.lastVerifiedAgeHours,1)+' hours ago')+
 '</div>';
 document.getElementById('searchBody').innerHTML=html;
}
function health(){
 const t=data.truth||{},rt=data.runtime||{},a=data.authority||{},issues=[];
 const ec=t.executionContract||{},arch=t.architecture||{},g=t.search||{},growth=t.growth||{};
 if(Number(ec.missingExecutors||0)>0)issues.push({level:'bad',title:'Missing execution contracts',detail:n(ec.missingExecutors)+' executor mappings are missing.'});
 if(Number(ec.stalled||0)>0)issues.push({level:'bad',title:'Stalled execution contracts',detail:n(ec.stalled)+' tasks are stalled.'});
 if(Number(arch.openIncidents||0)>0)issues.push({level:'bad',title:'Architecture incidents',detail:n(arch.openIncidents)+' open architecture incidents.'});
 if(g.runtimeOk===false)issues.push({level:'bad',title:'GSC refresh failed',detail:g.runtimeStatus||'Search evidence refresh failed.'});
 if(a.status&&a.status!=='healthy')issues.push({level:'warn',title:'Authority loop',detail:'Authority closed loop reports '+a.status+'.'});
 if(t.affiliate&&t.affiliate.reconciled===false)issues.push({level:'warn',title:'Affiliate metadata reconciliation',detail:n((t.affiliate.productionWithoutActivePipeline||[]).length)+' live production route(s) are not marked active in pipeline metadata: '+(t.affiliate.productionWithoutActivePipeline||[]).join(', ')+'. Production registry remains canonical.'});
 if(Number(growth.externalExecutions24h||0)<10)issues.push({level:'warn',title:'Acquisition execution below operating floor',detail:n(growth.externalExecutions24h)+' external executions in 24h. Floor is 10; target is 15.'});
 if(!issues.length)issues.push({level:'good',title:'No active integrity issue',detail:'Execution contracts, architecture, GSC refresh and authority loop have no current measurable failure.'});
 const rows=[
  ['Runtime',rt.architecture||'Unavailable',(rt.primary?.runtime||'')+' - scheduler '+(rt.primary?.scheduler||'')],
  ['GitHub Actions',rt.githubActions?.role||'Unavailable',rt.githubActions?.scheduledPrimary===false?'Fallback only':'Check scheduling role'],
  ['GSC evidence',g.runtimeStatus||'Unavailable',g.runtimeGeneratedAt?dt(g.runtimeGeneratedAt):'No runtime timestamp'],
  ['Authority',a.status||'Unavailable',n(a.attempts24)+' attempts / 24h'],
  ['Execution contract',n(ec.verified)+' verified',n(ec.ready)+' ready - '+n(ec.inFlight)+' in flight - '+n(ec.deferred)+' deferred'],
  ['Affiliate programmes',n(t.affiliate?.productionRoutes)+' active','Canonical production registry']
 ];
 document.getElementById('healthBody').innerHTML=issues.map(i=>'<div class="issue '+i.level+'"><b>'+esc(i.title)+'</b>'+esc(i.detail)+'</div>').join('')+'<div class="section">'+rows.map(x=>row(x[0],x[1],x[2])).join('')+'</div><div class="sourceLine">Critical metrics are read from the canonical business truth endpoint. Missing data is not converted to zero.</div>';
}
function render(){business();trafficProgress();authorityProgress();gscProgress();brain();queue();results();searchAuthority();health()}
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
document.addEventListener('click',e=>{
 const c=e.target.closest('[data-copy]');if(c){e.preventDefault();const old=c.textContent,value=decodeURIComponent(c.dataset.copy||'');navigator.clipboard.writeText(value).then(()=>{c.textContent='Copied';setTimeout(()=>c.textContent=old,1200)}).catch(()=>{c.textContent='Copy failed';setTimeout(()=>c.textContent=old,1500)});return}
 const b=e.target.closest('[data-resolve]');if(b){e.preventDefault();resolveTask(b)}
});
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
