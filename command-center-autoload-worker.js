import base from './command-center-truth-consolidation-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const TIME_ZONE='Europe/Lisbon';

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
function dayKey(value){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value instanceof Date?value:new Date(value));
  const map=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function parseSqliteUtc(value){
  const text=String(value||'').trim();
  if(!text)return null;
  const date=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));
  return Number.isFinite(date.getTime())?date:null;
}
function trendDayKeys(days=30){
  const out=[];
  const now=Date.now();
  for(let i=days-1;i>=0;i--)out.push(dayKey(new Date(now-i*86400000)));
  return [...new Set(out)];
}
async function trafficTrendSnapshot(env){
  if(!env.DB)return {status:'unavailable',metric:'browser-confirmed sessions and outbound clicks',points:[]};
  try{
    const [sessionResult,clickResult]=await Promise.all([
      env.DB.prepare(`SELECT conf.session_id,conf.created_at
        FROM funnel_events conf
        JOIN sessions s ON s.session_id=conf.session_id
        WHERE conf.event_type='page_confirmed'
          AND s.classification='likely-human'
          AND conf.created_at>=datetime('now','-35 days')
        ORDER BY conf.created_at ASC`).all(),
      env.DB.prepare(`WITH confirmed_sessions AS (
          SELECT DISTINCT session_id FROM funnel_events WHERE event_type='page_confirmed'
        )
        SELECT c.created_at,c.affiliate_active_at_click
        FROM click_events c
        JOIN confirmed_sessions confirmed ON confirmed.session_id=c.session_id
        LEFT JOIN sessions s ON s.session_id=c.session_id
        WHERE c.created_at>=datetime('now','-35 days')
          AND COALESCE(s.classification,'unknown/legacy') IN ('likely-human','human')
          AND c.source NOT IN ('internal-test','synthetic','health-check','ci')
        ORDER BY c.created_at ASC`).all()
    ]);
    const sessionsByDay=new Map(),outboundByDay=new Map(),monetizedByDay=new Map();
    for(const row of sessionResult?.results||[]){
      const at=parseSqliteUtc(row.created_at),id=String(row.session_id||'');
      if(!at||!id)continue;
      const key=dayKey(at);
      if(!sessionsByDay.has(key))sessionsByDay.set(key,new Set());
      sessionsByDay.get(key).add(id);
    }
    for(const row of clickResult?.results||[]){
      const at=parseSqliteUtc(row.created_at);
      if(!at)continue;
      const key=dayKey(at);
      outboundByDay.set(key,(outboundByDay.get(key)||0)+1);
      if(Number(row.affiliate_active_at_click||0)===1)monetizedByDay.set(key,(monetizedByDay.get(key)||0)+1);
    }
    const keys=trendDayKeys(30);
    return {
      status:'observed',
      metric:'browser-confirmed sessions and outbound clicks',
      windowDays:keys.length,
      points:keys.map(day=>({
        day,
        sessions:sessionsByDay.get(day)?.size||0,
        outboundClicks:outboundByDay.get(day)||0,
        monetizedOutboundClicks:monetizedByDay.get(day)||0
      })),
      generatedAt:new Date().toISOString()
    };
  }catch(error){
    return {status:'unavailable',metric:'browser-confirmed sessions and outbound clicks',points:[],reason:String(error?.message||error)};
  }
}
async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  data.trafficTrend=await trafficTrendSnapshot(env);
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=UTF-8');
  headers.set('Cache-Control','private, no-store');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function autoloadScript(){return `<style data-toolscout-traffic-priority="1">#trafficTruthBody .metricGrid{grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:900px){#trafficTruthBody .metricGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){#trafficTruthBody .metricGrid{grid-template-columns:1fr}}</style><script data-toolscout-command-autoload="5">(function(){
if(window.__toolscoutCommandAutoloadInstalled)return;
window.__toolscoutCommandAutoloadInstalled=true;
var running=false;
function ensureCompatibilitySinks(){
  if(!document.getElementById('northstarBody')){
    var sink=document.createElement('div');
    sink.id='northstarBody';
    sink.hidden=true;
    sink.setAttribute('aria-hidden','true');
    document.body.appendChild(sink);
  }
}
function placePriorityCards(){
  var grid=document.getElementById('grid');if(!grid)return;
  var traffic=grid.querySelector('.widget[data-widget="traffic-truth"]');
  var chairman=grid.querySelector('.widget[data-widget="chairman"]');
  if(traffic){traffic.style.setProperty('--w','12');traffic.style.setProperty('--h','8');grid.insertBefore(traffic,grid.firstElementChild)}
  if(chairman){chairman.style.setProperty('--w','12');chairman.style.setProperty('--h','5');grid.insertBefore(chairman,traffic&&traffic.nextSibling?traffic.nextSibling:null)}
}
function chartSvg(points){
  if(!Array.isArray(points)||!points.length)return '<div class="note">Traffic trend is not available yet.</div>';
  var w=760,h=240,padL=42,padR=42,padT=24,padB=38,series=[
    {key:'sessions',label:'Browser sessions',stroke:'var(--accent)',axis:'left',width:'3',marker:'circle'},
    {key:'outboundClicks',label:'Outbound clicks',stroke:'var(--warn, #f59e0b)',axis:'right',width:'2.5',marker:'circle'},
    {key:'monetizedOutboundClicks',label:'Monetized outbound',stroke:'var(--good, #22c55e)',axis:'right',width:'2.5',marker:'square',dash:'7 5'}
  ];
  var sessionValues=points.map(function(x){return Number(x.sessions||0)}),outboundValues=[];
  points.forEach(function(x){outboundValues.push(Number(x.outboundClicks||0));outboundValues.push(Number(x.monetizedOutboundClicks||0))});
  var leftMax=Math.max.apply(null,sessionValues.concat([1])),rightMax=Math.max.apply(null,outboundValues.concat([1])),innerW=w-padL-padR,innerH=h-padT-padB;
  var xPositions=points.map(function(x,i){return padL+(points.length===1?innerW/2:i*innerW/(points.length-1))});
  function coordsFor(s){var scale=s.axis==='left'?leftMax:rightMax;return points.map(function(x,i){var px=xPositions[i],py=padT+innerH-(Number(x[s.key]||0)/scale)*innerH;return [px,py]})}
  var mid=Math.floor((points.length-1)/2),labels=[0,mid,points.length-1].filter(function(v,i,a){return a.indexOf(v)===i});
  function shortDay(v){var s=String(v||'');return s.slice(8,10)+'/'+s.slice(5,7)}
  var labelSvg=labels.map(function(i){return '<text x="'+xPositions[i].toFixed(1)+'" y="230" text-anchor="middle" fill="currentColor" opacity="0.55" font-size="10">'+shortDay(points[i].day)+'</text>'}).join('');
  var lines=series.map(function(s){
    var coords=coordsFor(s),line=coords.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' '),dash=s.dash?' stroke-dasharray="'+s.dash+'"':'';
    var dots=coords.map(function(p,i){
      var title='<title>'+shortDay(points[i].day)+': '+Number(points[i][s.key]||0)+' '+s.label.toLowerCase()+'</title>';
      if(s.marker==='square')return '<rect x="'+(p[0]-3).toFixed(1)+'" y="'+(p[1]-3).toFixed(1)+'" width="6" height="6" rx="1" fill="var(--card2)" stroke="'+s.stroke+'" stroke-width="2">'+title+'</rect>';
      return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.8" fill="'+s.stroke+'">'+title+'</circle>';
    }).join('');
    return '<polyline points="'+line+'" fill="none" stroke="'+s.stroke+'" stroke-width="'+s.width+'"'+dash+' stroke-linecap="round" stroke-linejoin="round"/>'+dots;
  }).join('');
  var legend='<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--muted)">'+series.map(function(s){var style=s.dash?'dashed':'solid';return '<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:18px;border-top:3px '+style+' '+s.stroke+'"></span>'+s.label+'</span>'}).join('')+'</div>';
  return '<div style="margin-top:14px;border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--card2)"><div class="rowName">Traffic and outbound evolution, last 30 days</div><div class="rowMeta">Left axis: browser sessions. Right axis: outbound clicks.</div>'+legend+'<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="240" role="img" aria-label="Daily browser sessions on the left axis, outbound clicks and monetized outbound clicks on the right axis over the last 30 days" style="display:block;margin-top:8px;overflow:visible;color:var(--muted)"><line x1="'+padL+'" y1="'+(padT+innerH)+'" x2="'+(w-padR)+'" y2="'+(padT+innerH)+'" stroke="currentColor" opacity="0.18"/><line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(padT+innerH)+'" stroke="currentColor" opacity="0.18"/><line x1="'+(w-padR)+'" y1="'+padT+'" x2="'+(w-padR)+'" y2="'+(padT+innerH)+'" stroke="currentColor" opacity="0.18"/><text x="4" y="'+(padT+5)+'" fill="currentColor" opacity="0.65" font-size="10">'+leftMax+'</text><text x="14" y="'+(padT+innerH+4)+'" fill="currentColor" opacity="0.55" font-size="10">0</text><text x="'+(w-4)+'" y="'+(padT+5)+'" text-anchor="end" fill="currentColor" opacity="0.65" font-size="10">'+rightMax+'</text><text x="'+(w-14)+'" y="'+(padT+innerH+4)+'" text-anchor="end" fill="currentColor" opacity="0.55" font-size="10">0</text>'+lines+labelSvg+'</svg></div>';
}
function renderPriorityTraffic(d){
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var v=d&&d.visitors||{},tr=d&&d.tracking||{},traffic=d&&d.traffic||{},t=d&&d.trafficTruth||{},c=d&&d.canonicalCommercialTruth||{},r=d&&d.revenue||{},a=d&&d.discoveryAttribution||{},s=t.googleSearchConsole||{},trend=d&&d.trafficTrend||{};
  var mtdVisitors=Number(v.monthToDate||0),mtdComplete=!!(v.coverage&&v.coverage.monthToDateComplete),mtdSessions=Number(traffic.monthToDate||t.d1&&t.d1.monthToDate||0),forecast=Number(traffic.projectedMonth||t.d1&&t.d1.projectedMonth||0),avg=Number(traffic.dailyAverageMTD||t.d1&&t.d1.dailyAverageMTD||0);
  var coverage=c.weightedCoverage==null?'No sample':(Number(c.weightedCoverage)*100).toFixed(1)+'%';
  var buckets=(a.today&&a.today.buckets)||[],find=function(k){return buckets.find(function(x){return x.key===k})||{visitors:0}};
  root.innerHTML='<div class="metricGrid">'+
    metric('Unique visitors today',num(v.today||0),'First party browser IDs')+
    metric('Unique visitors MTD',num(mtdVisitors),mtdComplete?'Complete month to date':'Partial since exact visitor tracking began')+
    metric('Browser sessions MTD',num(mtdSessions),'Comparable month to date traffic')+
    metric('Monthly traffic forecast',num(forecast),'Projected browser sessions at current MTD pace')+
    metric('Average sessions per day MTD',avg?avg.toFixed(1):'0.0','Browser confirmed sessions')+
    metric('Browser sessions 24h',num(tr.humanSessionsLast24Hours||0),'Behaviour diagnostic')+
    metric('Human outbound 30d',num(c.humanOutbound||0),'Browser confirmed D1')+
    metric('Monetized outbound 30d',num(c.monetizedOutbound||0),'Browser confirmed D1')+
    metric('Affiliate coverage',coverage,'Monetized share of confirmed outbound')+
    metric('Search today',num(find('search').visitors),'Known search source')+
    metric('AI referrals today',num(find('ai_referral').visitors),'Known AI source only')+
    metric('GSC impressions 28d',num(s.impressions||0),'Settled search visibility')+
  '</div>'+chartSvg(trend.points||[])+
  '<div class="note" style="margin-top:10px"><strong>Traffic Truth:</strong> D1 is the operational source for first party traffic and commercial actions. The monthly forecast uses browser confirmed sessions because exact unique visitor tracking does not yet cover the full month.'+(r.confirmedRevenue!=null?'<br><br>Confirmed revenue: '+money(r.confirmedRevenue,r.currency)+'.':'')+'</div>';
}
function installPriorityRender(){
  if(window.__toolscoutPriorityRenderInstalled)return;
  window.__toolscoutPriorityRenderInstalled=true;
  var previous=window.render;
  if(typeof previous==='function')window.render=function(d){var result=previous(d);placePriorityCards();renderPriorityTraffic(d);return result};
}
function needsLoad(){
  var status=document.getElementById('status');
  if(status&&/Updated\s/i.test(status.textContent||''))return false;
  var bodies=[].slice.call(document.querySelectorAll('.widgetBody'));
  return bodies.some(function(el){return /Refresh to load|Loading current data|Refresh to reconcile|Refresh to load current/i.test(el.textContent||'')})||!bodies.length;
}
async function loadCommandCenter(){
  if(running)return;running=true;
  var status=document.getElementById('status'),button=document.getElementById('refresh');
  try{
    if(status)status.innerHTML='<strong>Refreshing...</strong> Reading current engine state.';
    if(button)button.disabled=true;
    document.cookie='toolscout_owner=1; Max-Age=15552000; Path=/; SameSite=Lax; Secure';
    ensureCompatibilitySinks();
    placePriorityCards();
    installPriorityRender();
    var response=await fetch('/analytics/api/stats?t='+Date.now(),{credentials:'same-origin',cache:'no-store'});
    if(response.status===401)throw new Error('Secure Command Center session expired. Reload this page.');
    if(!response.ok)throw new Error('Command Center API returned HTTP '+response.status);
    var data=await response.json();
    if(typeof window.render!=='function')throw new Error('Command Center renderer unavailable.');
    window.render(data);
  }catch(error){
    if(status)status.innerHTML='<strong data-state="bad">Unable to refresh.</strong> '+String(error&&error.message||error);
  }finally{
    running=false;if(button)button.disabled=false;
  }
}
function start(){ensureCompatibilitySinks();placePriorityCards();installPriorityRender();setTimeout(function(){if(needsLoad())loadCommandCenter()},300)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  html=html.replace(/<script data-toolscout-command-autoload="[1234]">[\s\S]*?<\/script>/gi,'');
  if(!html.includes('data-toolscout-command-autoload="5"'))html=html.replace(/<\/body>/i,autoloadScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-autoload-health')return Response.json({ok:true,service:'toolscout-command-center-autoload',version:5,autoload:true,northStarCompatibilitySink:true,trafficTruthFirst:true,chairmanSecond:true,trafficTrend:true,trafficTrendSeries:3,trafficTrendDualAxis:true},{headers:{'Cache-Control':'no-store'}});
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')response=await augmentStats(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))response=await decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};