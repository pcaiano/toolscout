import base from './command-center-human-truth-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

function finalTruthScript(){return `<style data-toolscout-human-truth-final="1">
#trafficTruthBody .tsTruthTabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 10px}
#trafficTruthBody .tsTruthTab{border:1px solid var(--line);background:var(--card2);color:var(--muted);border-radius:999px;padding:7px 10px;font-size:10px;font-weight:850;cursor:pointer}
#trafficTruthBody .tsTruthTab[aria-pressed="true"]{background:#f5f7fa;color:#101318;border-color:#f5f7fa}
#trafficTruthBody .tsTruthHero{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:15px 16px}
#trafficTruthBody .tsTruthHero small{display:block;color:var(--muted);font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
#trafficTruthBody .tsTruthHero b{display:block;font-size:44px;letter-spacing:-.055em;line-height:1;margin-top:7px}
#trafficTruthBody .tsTruthHero span{display:block;color:var(--muted);font-size:10px;line-height:1.4;margin-top:5px}
#trafficTruthBody .tsTruthForecast{margin-top:10px;border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:14px 16px}
#trafficTruthBody .tsTruthForecast small{display:block;color:var(--muted);font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
#trafficTruthBody .tsTruthForecast b{display:block;font-size:28px;letter-spacing:-.04em;margin-top:6px}
#trafficTruthBody .tsTruthForecast span{display:block;color:var(--muted);font-size:10px;line-height:1.4;margin-top:4px}
@media(max-width:620px){#trafficTruthBody .tsTruthHero{align-items:flex-start;flex-direction:column}#trafficTruthBody .tsTruthHero b{font-size:38px}}
</style><script data-toolscout-human-truth-final="1">(function(){
if(window.__toolscoutHumanTruthFinalBootstrap)return;
window.__toolscoutHumanTruthFinalBootstrap=true;
var KEY='toolscout_human_session_window',selected='last24',latest=null,installed=false;
try{var saved=localStorage.getItem(KEY);if(saved==='today'||saved==='last24'||saved==='month')selected=saved}catch(e){}
function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
function fmt(v){return n(v).toLocaleString()}
function rawSessionValue(d,key){var traffic=d&&d.traffic||{},tracking=d&&d.tracking||{};return key==='today'?traffic.today:key==='month'?traffic.monthToDate:tracking.humanSessionsLast24Hours}
function sessionValue(d,key){return n(rawSessionValue(d,key))}
function sessionAvailable(d,key){return Number.isFinite(Number(rawSessionValue(d,key)))}
function label(key){return key==='today'?'Human sessions today':key==='month'?'Human sessions this month':'Human sessions, last 24 hours'}
function shortDay(v){var s=String(v||'');return s.slice(8,10)+'/'+s.slice(5,7)}
function chart(points){
  if(!Array.isArray(points)||!points.length)return '<div class="note">Traffic trend is not available yet.</div>';
  var w=760,h=220,l=36,r=14,t=18,b=34,max=Math.max.apply(null,points.map(function(x){return n(x.sessions)}).concat([1])),iw=w-l-r,ih=h-t-b;
  var c=points.map(function(x,i){return[l+(points.length===1?iw/2:i*iw/(points.length-1)),t+ih-(n(x.sessions)/max)*ih]});
  var line=c.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' '),mid=Math.floor((points.length-1)/2),idx=[0,mid,points.length-1].filter(function(v,i,a){return a.indexOf(v)===i});
  var labels=idx.map(function(i){return '<text x="'+c[i][0].toFixed(1)+'" y="210" text-anchor="middle" fill="currentColor" opacity="0.55" font-size="10">'+shortDay(points[i].day)+'</text>'}).join('');
  var dots=c.map(function(p,i){return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.6" fill="var(--accent)"><title>'+shortDay(points[i].day)+': '+n(points[i].sessions)+' sessions</title></circle>'}).join('');
  return '<div style="border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--card2)"><div class="rowName">Traffic evolution, last 30 days</div><div class="rowMeta">Browser confirmed sessions, comparable historical series</div><svg viewBox="0 0 '+w+' '+h+'" width="100%" height="220" role="img" aria-label="Traffic evolution over the last 30 days" style="display:block;margin-top:8px;overflow:visible;color:var(--muted)"><line x1="'+l+'" y1="'+(t+ih)+'" x2="'+(w-r)+'" y2="'+(t+ih)+'" stroke="currentColor" opacity="0.18"/><line x1="'+l+'" y1="'+t+'" x2="'+l+'" y2="'+(t+ih)+'" stroke="currentColor" opacity="0.18"/><text x="4" y="'+(t+5)+'" fill="currentColor" opacity="0.55" font-size="10">'+max+'</text><text x="14" y="'+(t+ih+4)+'" fill="currentColor" opacity="0.55" font-size="10">0</text><polyline points="'+line+'" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+dots+labels+'</svg></div>';
}
function pill(ok){return '<span class="pill '+(ok?'good':'warn')+'">'+(ok?'verified':'unavailable')+'</span>'}
function renderFinal(d){
  latest=d||latest;if(!latest)return;
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var widget=root.closest('.widget[data-widget="traffic-truth"]'),trend=latest.trafficTrend||{},traffic=latest.traffic||{},ok=sessionAvailable(latest,selected),proj=Number.isFinite(Number(traffic.projectedMonth))?n(traffic.projectedMonth):null;
  if(widget){var k=widget.querySelector('.widgetKicker'),title=widget.querySelector('.widgetTitle');if(k)k.textContent='FIRST-PARTY HUMAN TRUTH';if(title)title.textContent='Human Sessions'}
  var meta=document.getElementById('trafficTruthMeta');if(meta)meta.innerHTML=pill(ok);
  var tabs='<div class="tsTruthTabs" role="group" aria-label="Human session reporting window"><button type="button" class="tsTruthTab" data-ts-window="last24" aria-pressed="'+(selected==='last24')+'">Last 24h</button><button type="button" class="tsTruthTab" data-ts-window="today" aria-pressed="'+(selected==='today')+'">Today</button><button type="button" class="tsTruthTab" data-ts-window="month" aria-pressed="'+(selected==='month')+'">This month</button></div>';
  root.innerHTML=chart(trend.points||[])+tabs+'<div class="tsTruthHero"><div><small>'+label(selected)+'</small><b>'+fmt(sessionValue(latest,selected))+'</b><span>Browser-confirmed likely-human sessions</span></div><div>'+pill(ok)+'</div></div><div class="tsTruthForecast"><small>Projected human sessions this month</small><b>'+(proj==null?'Unavailable':fmt(proj))+'</b><span>Projected from the browser-confirmed month-to-date session pace</span></div><div class="note" style="margin-top:10px"><strong>Canonical definition:</strong> one browser-confirmed session with page_confirmed, classified as likely human. Owner, known bots, synthetic and unknown traffic are excluded.</div>';
}
function install(){
  if(installed)return;installed=true;
  var previous=window.render;
  if(typeof previous==='function')window.render=function(d){var result=previous(d);latest=d;renderFinal(d);return result};
  try{if(typeof snapshot!=='undefined'&&snapshot){latest=snapshot;renderFinal(snapshot)}}catch(e){}
}
document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-ts-window]'):null;if(!b)return;var next=b.getAttribute('data-ts-window');if(next!=='today'&&next!=='last24'&&next!=='month')return;selected=next;try{localStorage.setItem(KEY,selected)}catch(err){}renderFinal(latest)},true);
function boot(){setTimeout(install,650)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-human-truth-final="1"'))html=html.replace(/<\/body>/i,finalTruthScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-human-truth-final-health')return Response.json({ok:true,service:'toolscout-command-center-human-truth-final',version:3,canonicalMetric:'human sessions',canonicalSource:'D1 page_confirmed + likely-human',defaultWindow:'last24',chartPosition:'top',forecastMetric:'human sessions',uniqueVisitorsRole:'secondary until exact visitor coverage matures'},{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};