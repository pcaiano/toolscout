const COMMAND_CENTER_PATHS=new Set(['/analytics','/analytics/','/analytics-v2','/analytics-v2/','/command-center','/command-center/']);

function isHtml(response){
  return response&&response.ok&&String(response.headers.get('content-type')||'').toLowerCase().includes('text/html');
}

function styleTag(){
  return `<style data-toolscout-command-center-redesign="2">
:root{--ts-graphite:#0B0D0C;--ts-carbon:#141715;--ts-offwhite:#F3F5F1;--ts-muted:#90978F;--ts-lime:#B7FF3C;--ts-line:#DDE2DC;--ts-fast:140ms;--ts-base:180ms;--ts-ease:cubic-bezier(.2,.7,.2,1)}
body{background:var(--ts-graphite)!important;color:var(--ts-offwhite)!important}
.wrap{max-width:1480px!important;padding-top:34px!important}
.top h1{font-size:46px!important;line-height:.96!important;letter-spacing:-.055em!important;color:var(--ts-offwhite)!important}
.top .eyebrow{color:var(--ts-lime)!important}.top .sub{color:#A8AEA8!important}
.statusbar{background:var(--ts-carbon)!important;border-color:rgba(243,245,241,.1)!important;color:var(--ts-muted)!important;border-radius:9px!important}.statusbar strong{color:var(--ts-offwhite)!important}
.card{background:var(--ts-offwhite)!important;color:var(--ts-graphite)!important;border-color:var(--ts-line)!important;border-radius:12px!important;box-shadow:none!important}
.card .btn{background:#fff!important;color:var(--ts-graphite)!important;border-color:var(--ts-line)!important;border-radius:7px!important}
.card .btn.primary{background:var(--ts-graphite)!important;color:var(--ts-lime)!important;border-color:var(--ts-graphite)!important}
.btn{border-radius:7px!important;transition:transform var(--ts-fast) var(--ts-ease),background var(--ts-fast) var(--ts-ease)!important}.btn:active{transform:scale(.985)}
.metric,.progressStat,.headline,.chartBox,.payload{border-radius:8px!important;box-shadow:none!important}
.metric,.headline,.chartBox{background:#F8F9F6!important}
.ts-explorer-tabs,.ts-metric-tabs,.ts-range-tabs{display:flex;gap:5px;flex-wrap:wrap}
.ts-explorer-tabs{padding:0 17px 12px;border-bottom:1px solid var(--ts-line)}
.ts-tab{border:0;background:transparent;color:#6f766f;font:inherit;font-size:10px;font-weight:800;letter-spacing:.04em;padding:7px 9px;border-radius:6px;cursor:pointer;transition:background var(--ts-fast) var(--ts-ease),color var(--ts-fast) var(--ts-ease)}
.ts-tab:hover{background:#E9ECE6;color:var(--ts-graphite)}.ts-tab.active{background:var(--ts-graphite);color:var(--ts-lime)}
.ts-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:3px 0 9px}.ts-toolbar-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#747b74}
.ts-pane{animation:tsPane var(--ts-base) var(--ts-ease) both}@keyframes tsPane{from{opacity:.35;transform:translateY(5px)}to{opacity:1;transform:none}}
.ts-report-table{width:100%;border-collapse:collapse;margin-top:8px}.ts-report-table th,.ts-report-table td{border-top:1px solid var(--ts-line);padding:9px 8px;text-align:right;font-size:10px;vertical-align:top}.ts-report-table th{color:#747b74;font-size:9px;text-transform:uppercase;letter-spacing:.06em}.ts-report-table th:first-child,.ts-report-table td:first-child{text-align:left;padding-left:0}.ts-report-table th:last-child,.ts-report-table td:last-child{padding-right:0}.ts-report-table td:first-child{font-weight:750;max-width:420px;overflow-wrap:anywhere}
.ts-report-note{font-size:10px;color:#747b74;line-height:1.45;margin-top:8px}
.card[data-ts-explorer="1"]{grid-column:span 12!important}
.card[data-ts-authority="1"]{grid-column:span 12!important}
@media(max-width:650px){.top h1{font-size:36px!important}.ts-toolbar{align-items:flex-start;flex-direction:column}.ts-report-table{display:block;overflow:auto}.ts-explorer-tabs{overflow-x:auto;flex-wrap:nowrap}.ts-tab{white-space:nowrap}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>`;
}

function scriptTag(){
  return `<script data-toolscout-command-center-explorers="2">(function(){
const state={ga4:'overview',ga4Range:'28d',gsc:'performance',gscRange:'28d',gscMetric:'impressions'};
const escx=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const numx=v=>(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))?'Unavailable':Number(v).toLocaleString();
const decx=(v,d=1)=>(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))?'Unavailable':Number(v).toFixed(d);
const pctRaw=v=>Number.isFinite(Number(v))?(Number(v)*100).toFixed(1)+'%':'Unavailable';
const rowx=values=>'<tr>'+values.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
const tablex=(heads,rows)=>rows.length?'<table class="ts-report-table"><thead><tr>'+heads.map(h=>'<th>'+escx(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>':'<div class="empty">No rows in the current reporting population.</div>';
const tabs=(rootId,items,active,attr)=>{const root=document.getElementById(rootId);if(root)root.innerHTML=items.map(x=>'<button type="button" class="ts-tab '+(x[0]===active?'active':'')+'" data-'+attr+'="'+escx(x[0])+'">'+escx(x[1])+'</button>').join('')};
const rangeBar=(kind,active,items)=>'<div class="ts-toolbar"><span class="ts-toolbar-label">Range</span><div class="ts-range-tabs">'+items.map(x=>'<button type="button" class="ts-tab '+(x[0]===active?'active':'')+'" data-'+kind+'-range="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></div>';

function setupCards(){
  const gaBody=document.getElementById('trafficProgressBody'),gscBody=document.getElementById('gscProgressBody'),authority=document.getElementById('authorityProgressBody');
  const ga=gaBody&&gaBody.closest('.card'),gsc=gscBody&&gscBody.closest('.card'),au=authority&&authority.closest('.card');
  if(ga){ga.dataset.tsExplorer='1';ga.querySelector('.kicker').textContent='Traffic intelligence';ga.querySelector('.title').textContent='Google Analytics';if(!document.getElementById('tsGaTabs')){const n=document.createElement('div');n.id='tsGaTabs';n.className='ts-explorer-tabs';ga.insertBefore(n,gaBody.parentElement)}}
  if(gsc){gsc.dataset.tsExplorer='1';gsc.querySelector('.kicker').textContent='Search demand';gsc.querySelector('.title').textContent='Google Search Console';if(!document.getElementById('tsGscTabs')){const n=document.createElement('div');n.id='tsGscTabs';n.className='ts-explorer-tabs';gsc.insertBefore(n,gscBody.parentElement)}}
  if(au)au.dataset.tsAuthority='1';
}

function gaRange(rows){
  if(state.ga4Range==='7d')return rows.slice(-7);
  if(state.ga4Range==='28d')return rows.slice(-28);
  if(state.ga4Range==='mtd'){const now=new Date(),key=String(now.getFullYear())+String(now.getMonth()+1).padStart(2,'0');return rows.filter(x=>String(x.date||'').replaceAll('-','').startsWith(key))}
  return rows.slice(-30);
}
function gaRender(){
  setupCards();
  const a=(typeof data!=='undefined'&&data.acquisition)||{},body=document.getElementById('trafficProgressBody');if(!body)return;
  tabs('tsGaTabs',[['overview','Overview'],['acquisition','Acquisition'],['landing','Landing pages'],['geography','Geography'],['devices','Devices'],['engagement','Engagement']],state.ga4,'ts-ga-report');
  if(a.status!=='connected')return;
  const all=Array.isArray(a.daily30)?a.daily30:[],rows=gaRange(all),sum=k=>rows.reduce((s,x)=>s+Number(x?.[k]||0),0);
  let html=rangeBar('ts-ga4',state.ga4Range,[['7d','7 days'],['28d','28 days'],['mtd','MTD'],['30d','30 days']])+'<div class="ts-pane">';
  if(state.ga4==='overview'){
    html+='<div class="progressStats"><div class="progressStat"><small>Sessions</small><b>'+numx(sum('sessions'))+'</b></div><div class="progressStat"><small>Users</small><b>'+numx(sum('users'))+'</b></div><div class="progressStat"><small>New users</small><b>'+numx(sum('newUsers'))+'</b></div><div class="progressStat"><small>Engaged sessions</small><b>'+numx(sum('engagedSessions'))+'</b></div></div>';
    if(typeof seriesChart==='function')html+='<div class="chartBox">'+seriesChart(rows,[{key:'sessions',label:'Sessions',cls:'primary'},{key:'users',label:'Users',cls:'good'}])+'</div>';
  }else if(state.ga4==='acquisition'){
    const channels=Array.isArray(a.channels)?a.channels:[],sources=Array.isArray(a.sources)?a.sources.slice(0,30):[];
    html+='<div class="sectionTitle">Default channel groups</div>'+tablex(['Channel','Sessions','Users','Engagement'],channels.map(x=>rowx([escx(x.channel),numx(x.sessions),numx(x.users),pctRaw(x.engagementRate)])))+
    '<div class="section"><div class="sectionTitle">Source / medium</div>'+tablex(['Source / medium','Channel','Landing page','Sessions'],sources.map(x=>rowx([escx(x.source+' / '+x.medium),escx(x.channel),escx(x.landingPage),numx(x.sessions)])))+'</div>';
  }else if(state.ga4==='landing'){
    const xs=Array.isArray(a.landingPages)?a.landingPages:[];
    html+=tablex(['Landing page','Sessions','Users','Engaged','Engagement','Avg duration'],xs.map(x=>rowx([escx(x.landingPage),numx(x.sessions),numx(x.users),numx(x.engagedSessions),pctRaw(x.engagementRate),decx(x.averageSessionDuration,1)+'s'])));
  }else if(state.ga4==='geography'){
    const xs=Array.isArray(a.countries)?a.countries:[];
    html+=tablex(['Country','Sessions','Users'],xs.map(x=>rowx([escx(x.country),numx(x.sessions),numx(x.users)])))+'<div class="ts-report-note">List view is intentional. No mini map.</div>';
  }else if(state.ga4==='devices'){
    const xs=Array.isArray(a.devices)?a.devices:[];
    html+=tablex(['Device','Sessions','Users','Engaged','Engagement'],xs.map(x=>rowx([escx(x.device),numx(x.sessions),numx(x.users),numx(x.engagedSessions),pctRaw(x.engagementRate)])));
  }else{
    const m=a.engagement?.monthToDate||{};
    html+='<div class="progressStats"><div class="progressStat"><small>New users MTD</small><b>'+numx(m.newUsers)+'</b></div><div class="progressStat"><small>Engaged sessions MTD</small><b>'+numx(m.engagedSessions)+'</b></div><div class="progressStat"><small>Engagement rate</small><b>'+pctRaw(m.engagementRate)+'</b></div><div class="progressStat"><small>Avg session duration</small><b>'+decx(m.averageSessionDuration,1)+'s</b></div></div>';
    if(typeof seriesChart==='function')html+='<div class="chartBox">'+seriesChart(rows,[{key:'engagedSessions',label:'Engaged sessions',cls:'good'},{key:'newUsers',label:'New users',cls:'primary'}])+'</div>';
  }
  body.innerHTML=html+'</div><div class="sourceLine">Google Analytics 4 Data API. GA4 remains canonical for users and sessions; ToolScout server redirects remain canonical for outbound.</div>';
}

function aggregateQueries(pages){
  const map=new Map();
  for(const p of pages||[])for(const q of p.topQueries||[]){const key=String(q.query||'').trim();if(!key)continue;const cur=map.get(key)||{query:key,clicks:0,impressions:0,weighted:0,page:p.pathname||p.page||'',top:0};const im=Number(q.impressions||0);cur.clicks+=Number(q.clicks||0);cur.impressions+=im;cur.weighted+=Number(q.position||0)*im;if(im>cur.top){cur.top=im;cur.page=p.pathname||p.page||''}map.set(key,cur)}
  return [...map.values()].map(x=>({...x,ctr:x.impressions?x.clicks/x.impressions*100:0,position:x.impressions?x.weighted/x.impressions:null})).sort((a,b)=>b.impressions-a.impressions).slice(0,40);
}
function gscRows(rows){return state.gscRange==='7d'?rows.slice(-7):rows.slice(-28)}
function gscRender(){
  setupCards();
  const g=(typeof data!=='undefined'&&data.truth&&data.truth.search)||{},body=document.getElementById('gscProgressBody');if(!body)return;
  tabs('tsGscTabs',[['performance','Performance'],['queries','Queries'],['pages','Pages'],['countries','Countries'],['devices','Devices'],['indexing','Indexing'],['opportunities','Opportunities']],state.gsc,'ts-gsc-report');
  if(!['connected','stale'].includes(String(g.status||'')))return;
  const rows=gscRows(Array.isArray(g.daily28)?g.daily28:[]),live=g.liveWindow||{},pages=Array.isArray(g.pages)?g.pages:[],countries=Array.isArray(g.countries)?g.countries:[],devices=Array.isArray(g.devices)?g.devices:[],opps=Array.isArray(g.opportunities)?g.opportunities:[];
  let html=rangeBar('ts-gsc',state.gscRange,[['7d','7 days'],['28d','28 days']])+'<div class="ts-pane">';
  if(state.gsc==='performance'){
    const metrics=[['clicks','Clicks'],['impressions','Impressions'],['ctr','CTR'],['position','Average position']],key=state.gscMetric;
    html+='<div class="progressStats"><div class="progressStat"><small>Clicks 28d</small><b>'+numx(live.clicks??g.clicks)+'</b></div><div class="progressStat"><small>Impressions 28d</small><b>'+numx(live.impressions??g.impressions)+'</b></div><div class="progressStat"><small>CTR</small><b>'+decx(live.ctr,2)+'%</b></div><div class="progressStat"><small>Average position</small><b>'+decx(live.position,1)+'</b></div></div>'+
    '<div class="ts-toolbar"><span class="ts-toolbar-label">Metric</span><div class="ts-metric-tabs">'+metrics.map(x=>'<button type="button" class="ts-tab '+(x[0]===key?'active':'')+'" data-ts-gsc-metric="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></div>';
    if(typeof seriesChart==='function'){const label=metrics.find(x=>x[0]===key)?.[1]||key;html+='<div class="chartBox"><div class="sectionTitle">'+escx(label)+'</div>'+seriesChart(rows,[{key,label,cls:key==='position'?'warn':key==='clicks'?'good':'primary'}],{zeroBaseline:key!=='position',invert:key==='position',axisDecimals:(key==='position'||key==='ctr')?1:0})+'</div>'}
  }else if(state.gsc==='queries'){
    const qs=aggregateQueries(pages);html+=tablex(['Query','Clicks','Impressions','CTR','Position','Best page'],qs.map(x=>rowx([escx(x.query),numx(x.clicks),numx(x.impressions),decx(x.ctr,2)+'%',decx(x.position,1),escx(x.page)])));
  }else if(state.gsc==='pages'){
    html+=tablex(['Page','Type','Clicks','Impressions','CTR','Position'],pages.map(x=>rowx([escx(x.pathname||x.page),escx(x.type||''),numx(x.clicks),numx(x.impressions),decx(x.ctr,2)+'%',decx(x.position,1)])));
  }else if(state.gsc==='countries'){
    html+=tablex(['Country','Clicks','Impressions','CTR','Position'],countries.map(x=>rowx([escx(x.country),numx(x.clicks),numx(x.impressions),decx(x.ctr,2)+'%',decx(x.position,1)])));
  }else if(state.gsc==='devices'){
    html+=tablex(['Device','Clicks','Impressions','CTR','Position'],devices.map(x=>rowx([escx(x.device),numx(x.clicks),numx(x.impressions),decx(x.ctr,2)+'%',decx(x.position,1)])));
  }else if(state.gsc==='indexing'){
    html+='<div class="progressStats"><div class="progressStat"><small>Indexed</small><b>'+numx(g.indexed)+'</b></div><div class="progressStat"><small>Inspected</small><b>'+numx(g.inspected)+'</b></div><div class="progressStat"><small>Recovery candidates</small><b>'+numx(g.indexRecoveryCandidates)+'</b></div><div class="progressStat"><small>Sitemaps</small><b>'+numx(g.sitemaps)+'</b></div></div>'+tablex(['Page','Coverage','Impressions','Position'],opps.filter(x=>x.kind==='index_issue').slice(0,20).map(x=>rowx([escx(x.page),escx(x.coverageState||x.action||'Index issue'),numx(x.impressions),decx(x.position,1)])));
  }else{
    html+=tablex(['Opportunity','Page','Impressions','Position','Recommended action'],opps.slice(0,30).map(x=>rowx([escx(String(x.kind||'').replaceAll('_',' ')),escx(x.page),numx(x.impressions),decx(x.position,1),escx(String(x.action||'').replaceAll('_',' '))])));
  }
  body.innerHTML=html+'</div><div class="sourceLine">Google Search Console first-party evidence. Finalized daily history powers trend comparisons; headline totals may include newer preliminary data.</div>';
}

setupCards();
const originalTraffic=typeof trafficProgress==='function'?trafficProgress:null,originalGsc=typeof gscProgress==='function'?gscProgress:null;
if(originalTraffic)trafficProgress=function(){originalTraffic();gaRender()};
if(originalGsc)gscProgress=function(){originalGsc();gscRender()};
document.addEventListener('click',e=>{const b=e.target.closest('[data-ts-ga-report],[data-ts-ga4-range],[data-ts-gsc-report],[data-ts-gsc-range],[data-ts-gsc-metric]');if(!b)return;
  if(b.dataset.tsGaReport)state.ga4=b.dataset.tsGaReport;if(b.dataset.tsGa4Range)state.ga4Range=b.dataset.tsGa4Range;
  if(b.dataset.tsGscReport)state.gsc=b.dataset.tsGscReport;if(b.dataset.tsGscRange)state.gscRange=b.dataset.tsGscRange;if(b.dataset.tsGscMetric)state.gscMetric=b.dataset.tsGscMetric;
  if(b.dataset.tsGaReport||b.dataset.tsGa4Range)gaRender();if(b.dataset.tsGscReport||b.dataset.tsGscRange||b.dataset.tsGscMetric)gscRender();
});
setTimeout(()=>{gaRender();gscRender()},0);
})();</script>`;
}

export async function transformCommandCenterRedesignResponse(request,response){
  const url=new URL(request.url);
  if(request.method!=='GET'||!COMMAND_CENTER_PATHS.has(url.pathname)||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-command-center-redesign="2"'))html=html.replace('</head>',styleTag()+'</head>');
  if(!html.includes('data-toolscout-command-center-explorers="2"'))html=html.replace('</body>',scriptTag()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
