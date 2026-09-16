import base from './command-center-resilient-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

function humanTruthScript(){return `<style data-toolscout-human-truth="1">
#trafficTruthBody .humanTruthTabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 10px}
#trafficTruthBody .humanTruthTab{border:1px solid var(--line);background:var(--card2);color:var(--muted);border-radius:999px;padding:7px 10px;font-size:10px;font-weight:850;cursor:pointer}
#trafficTruthBody .humanTruthTab[aria-pressed="true"]{background:#f5f7fa;color:#101318;border-color:#f5f7fa}
#trafficTruthBody .humanTruthHero{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:15px 16px}
#trafficTruthBody .humanTruthHero small{display:block;color:var(--muted);font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
#trafficTruthBody .humanTruthHero b{display:block;font-size:44px;letter-spacing:-.055em;line-height:1;margin-top:7px}
#trafficTruthBody .humanTruthHero span{display:block;color:var(--muted);font-size:10px;line-height:1.4;margin-top:5px}
#trafficTruthBody .humanTruthForecast{margin-top:10px;display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
@media(max-width:620px){#trafficTruthBody .humanTruthHero{align-items:flex-start;flex-direction:column}#trafficTruthBody .humanTruthHero b{font-size:38px}}
</style><script data-toolscout-human-truth="1">(function(){
if(window.__toolscoutHumanTruthInstalled)return;
window.__toolscoutHumanTruthInstalled=true;
var KEY='toolscout_human_visitor_window';
var selected='last24';
try{var saved=localStorage.getItem(KEY);if(saved==='today'||saved==='last24'||saved==='month')selected=saved}catch(e){}
function safeNum(v){var x=Number(v);return Number.isFinite(x)?x:0}
function fmt(v){return safeNum(v).toLocaleString()}
function lisbonParts(value){
  var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value instanceof Date?value:new Date(value));
  var out={};parts.forEach(function(p){if(p.type!=='literal')out[p.type]=p.value});return out;
}
function coverage(v,key){var c=v&&v.coverage||{};if(key==='today')return !!c.todayComplete;if(key==='month')return !!c.monthToDateComplete;return !!c.last24Complete}
function count(v,key){if(key==='today')return safeNum(v&&v.today);if(key==='month')return safeNum(v&&v.monthToDate);return safeNum(v&&v.last24)}
function label(key,complete){if(key==='today')return 'Human visitors today';if(key==='month')return complete?'Human visitors this month':'Human visitors this month, covered period';return 'Human visitors, last 24 hours'}
function forecast(v){
  if(!v||!v.trackingSince)return null;
  var now=new Date(),np=lisbonParts(now),y=Number(np.year),m=Number(np.month),day=Number(np.day),daysInMonth=new Date(Date.UTC(y,m,0)).getUTCDate();
  var start=new Date(v.trackingSince);if(!Number.isFinite(start.getTime()))return null;
  var sp=lisbonParts(start),sy=Number(sp.year),sm=Number(sp.month),sd=Number(sp.day);
  var observedDays=day;
  if(sy===y&&sm===m)observedDays=Math.max(1,day-sd+1);
  var observed=safeNum(v.monthToDate);
  return Math.round(observed/Math.max(1,observedDays)*daysInMonth);
}
function shortDay(v){var s=String(v||'');return s.slice(8,10)+'/'+s.slice(5,7)}
function chartSvg(points){
  if(!Array.isArray(points)||!points.length)return '<div class="note">Traffic trend is not available yet.</div>';
  var w=760,h=220,padL=36,padR=14,padT=18,padB=34,max=Math.max.apply(null,points.map(function(x){return safeNum(x.sessions)}).concat([1]));
  var innerW=w-padL-padR,innerH=h-padT-padB;
  var coords=points.map(function(x,i){var px=padL+(points.length===1?innerW/2:i*innerW/(points.length-1));var py=padT+innerH-(safeNum(x.sessions)/max)*innerH;return [px,py]});
  var line=coords.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' ');
  var mid=Math.floor((points.length-1)/2),labels=[0,mid,points.length-1].filter(function(v,i,a){return a.indexOf(v)===i});
  var labelSvg=labels.map(function(i){return '<text x="'+coords[i][0].toFixed(1)+'" y="210" text-anchor="middle" fill="currentColor" opacity="0.55" font-size="10">'+shortDay(points[i].day)+'</text>'}).join('');
  var dots=coords.map(function(p,i){return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.6" fill="var(--accent)"><title>'+shortDay(points[i].day)+': '+safeNum(points[i].sessions)+' sessions</title></circle>'}).join('');
  return '<div style="border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--card2)"><div class="rowName">Traffic evolution, last 30 days</div><div class="rowMeta">Browser confirmed sessions, retained for historical continuity</div><svg viewBox="0 0 '+w+' '+h+'" width="100%" height="220" role="img" aria-label="Traffic evolution over the last 30 days" style="display:block;margin-top:8px;overflow:visible;color:var(--muted)"><line x1="'+padL+'" y1="'+(padT+innerH)+'" x2="'+(w-padR)+'" y2="'+(padT+innerH)+'" stroke="currentColor" opacity="0.18"/><line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(padT+innerH)+'" stroke="currentColor" opacity="0.18"/><text x="4" y="'+(padT+5)+'" fill="currentColor" opacity="0.55" font-size="10">'+max+'</text><text x="14" y="'+(padT+innerH+4)+'" fill="currentColor" opacity="0.55" font-size="10">0</text><polyline points="'+line+'" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+dots+labelSvg+'</svg></div>';
}
function statusHtml(ok){return '<span class="pill '+(ok?'good':'warn')+'">'+(ok?'verified':'partial window')+'</span>'}
function renderHumanTruth(d){
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var widget=root.closest('.widget[data-widget="traffic-truth"]'),v=d&&d.visitors||{},trend=d&&d.trafficTrend||{};
  if(widget){var k=widget.querySelector('.widgetKicker'),title=widget.querySelector('.widgetTitle');if(k)k.textContent='FIRST-PARTY HUMAN TRUTH';if(title)title.textContent='Human Visitors'}
  var complete=coverage(v,selected),value=count(v,selected),projection=forecast(v),trackingOk=!!(v&&v.status==='observed'&&v.trackingSince),verified=trackingOk&&complete;
  var meta=document.getElementById('trafficTruthMeta');if(meta)meta.innerHTML=statusHtml(verified);
  var tabs='<div class="humanTruthTabs" role="group" aria-label="Human visitor reporting window">'+
    '<button type="button" class="humanTruthTab" data-human-window="last24" aria-pressed="'+(selected==='last24')+'">Last 24h</button>'+
    '<button type="button" class="humanTruthTab" data-human-window="today" aria-pressed="'+(selected==='today')+'">Today</button>'+
    '<button type="button" class="humanTruthTab" data-human-window="month" aria-pressed="'+(selected==='month')+'">This month</button></div>';
  var metaText=verified?'Complete exact measurement window':'Exact count for the covered period only';
  var forecastMeta=v&&v.trackingSince?'Projected from the first-party unique visitor pace since exact tracking began':'Forecast unavailable until exact visitor tracking is available';
  root.innerHTML=chartSvg(trend.points||[])+tabs+
    '<div class="humanTruthHero"><div><small>'+label(selected,complete)+'</small><b>'+fmt(value)+'</b><span>'+metaText+'</span></div><div>'+statusHtml(verified)+'</div></div>'+
    '<div class="humanTruthForecast">'+metric('Projected human visitors this month',projection==null?'Unavailable':fmt(projection),forecastMeta)+'</div>'+
    '<div class="note" style="margin-top:10px"><strong>Canonical definition:</strong> one anonymous first-party browser ID, counted once in the selected window, only when classified as likely human. Owner, known bots and synthetic traffic are excluded.'+(selected==='month'&&!complete?'<br><br>This month is not yet a complete measurement window because exact visitor tracking began after the month started. The displayed count is not backfilled or estimated.':'')+'</div>';
}
document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-human-window]'):null;if(!b)return;
  var next=b.getAttribute('data-human-window');if(next!=='today'&&next!=='last24'&&next!=='month')return;
  selected=next;try{localStorage.setItem(KEY,selected)}catch(err){}
  if(typeof snapshot!=='undefined'&&snapshot)renderHumanTruth(snapshot);
},true);
document.addEventListener('click',function(e){
  var w=e.target&&e.target.closest?e.target.closest('.widget[data-widget="traffic-truth"]'):null;if(!w||e.target.closest('button,a,.resizeHandle'))return;
  e.stopPropagation();
  if(typeof snapshot==='undefined'||!snapshot||typeof modalRows!=='function')return;
  var v=snapshot.visitors||{},complete=coverage(v,selected),projection=forecast(v),actual=count(v,selected);
  modalRows('Human Visitors','First-party human truth',row(label(selected,complete),fmt(actual),complete?'Verified complete window':'Exact covered period only')+row('Projected month',projection==null?'Unavailable':fmt(projection),'Forecast, not an observed count')+row('Tracking since',v.trackingSince?dt(v.trackingSince):'Unavailable','Exact first-party visitor tracking')+row('Definition','Unique human browser IDs','Owner, known bots and synthetic traffic excluded'));
},true);
var previous=window.render;if(typeof previous==='function')window.render=function(d){var result=previous(d);renderHumanTruth(d);return result};
try{if(typeof snapshot!=='undefined'&&snapshot)renderHumanTruth(snapshot)}catch(e){}
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-human-truth="1"'))html=html.replace(/<\/body>/i,humanTruthScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-human-truth-health')return Response.json({ok:true,service:'toolscout-command-center-human-truth',version:1,canonicalVisitorSource:'D1 first-party visitor IDs',defaultWindow:'last24',chartPosition:'top'},{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
