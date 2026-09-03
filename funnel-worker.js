import base from './dynamic-worker.js';
import { parseFunnelEvent, rate } from './funnel-model.js';
import { classifySessionRequest, isSyntheticRequest, SESSION_CLASSIFICATIONS, SESSION_UPSERT_SQL } from './session-classification.js';

const BASE = 'https://trytoolscout.org';
const rows = result => result?.results || [];

function eventHeaders(request) {
  const headers = {'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Vary':'Origin'};
  const origin = request.headers.get('Origin');
  if (origin === BASE) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export async function ingest(request, env) {
  const headers = eventHeaders(request);
  if (isSyntheticRequest(request)) return Response.json({ok:true, recorded:false}, {headers});
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 2048) return Response.json({error:'payload_too_large'}, {status:413, headers});
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return Response.json({error:'unsupported_media_type'}, {status:415, headers});
  }
  let body;
  try { const raw=await request.text();if(raw.length>2048)return Response.json({error:'payload_too_large'}, {status:413, headers});body=JSON.parse(raw); } catch { return Response.json({error:'invalid_json'}, {status:400, headers}); }
  const event = parseFunnelEvent(body);
  if (!event) return Response.json({error:'invalid_event'}, {status:400, headers});
  const classification = classifySessionRequest(request);
  if (classification === SESSION_CLASSIFICATIONS.OWNER) event.source = 'internal-test';
  const ownerFlag = classification === SESSION_CLASSIFICATIONS.OWNER ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare(SESSION_UPSERT_SQL).bind(event.session_id,event.source,ownerFlag,classification),
    env.DB.prepare(`INSERT OR IGNORE INTO funnel_events
      (event_id,session_id,event_type,intent_slug,tool_slug,path,source,referrer_host,created_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).bind(event.event_id,event.session_id,event.event_type,event.intent_slug,event.tool_slug,event.path,event.source,event.referrer_host)
  ]);
  return Response.json({ok:true}, {status:202, headers});
}

async function funnelSnapshot(env) {
  const window = "created_at >= datetime('now','-30 days')";
  const likelyHuman = "session_id IN (SELECT session_id FROM sessions WHERE classification='likely-human')";
  const [eventCounts, sessionCount, byIntent, byTool, bySource, bySourceSessions, daily, audience] = await Promise.all([
    env.DB.prepare(`SELECT event_type,COUNT(*) AS events,COUNT(DISTINCT session_id) AS sessions FROM funnel_events WHERE ${window} AND ${likelyHuman} GROUP BY event_type`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE first_seen_at >= datetime('now','-30 days') AND classification='likely-human'`).first(),
    env.DB.prepare(`SELECT COALESCE(intent_slug,'general') AS intent_slug,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${likelyHuman} AND intent_slug IS NOT NULL GROUP BY intent_slug,event_type ORDER BY events DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT tool_slug,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${likelyHuman} AND tool_slug IS NOT NULL GROUP BY tool_slug,event_type ORDER BY events DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT source,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${likelyHuman} GROUP BY source,event_type ORDER BY events DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT source,COUNT(DISTINCT session_id) AS sessions FROM funnel_events WHERE ${window} AND ${likelyHuman} GROUP BY source ORDER BY sessions DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT substr(created_at,1,10) AS day,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${likelyHuman} GROUP BY day,event_type ORDER BY day`).all(),
    env.DB.prepare(`SELECT classification,COUNT(*) AS sessions FROM sessions WHERE first_seen_at >= datetime('now','-30 days') GROUP BY classification`).all()
  ]);
  const counts = Object.fromEntries(rows(eventCounts).map(row => [row.event_type, Number(row.events || 0)]));
  const sessions = Number(sessionCount?.sessions || 0);
  const starts = counts.recommendation_started || 0;
  const completions = counts.recommendation_completed || 0;
  const resultViews = counts.recommendation_result_viewed || 0;
  const toolViews = counts.tool_viewed || 0;
  const outboundClicks = counts.outbound_clicked || 0;
  return {
    windowDays:30,
    status:'observed',
    sessions,
    recommendationStarts:starts,
    recommendationCompletions:completions,
    recommendationCompletionRate:rate(completions,starts),
    recommendationResultViews:resultViews,
    toolViews,
    outboundClicks,
    resultToOutboundCtr:rate(outboundClicks,resultViews + toolViews),
    sessionToOutboundCtr:rate(outboundClicks,sessions),
    byIntent:rows(byIntent),
    byTool:rows(byTool),
    bySource:rows(bySource),
    bySourceSessions:rows(bySourceSessions),
    daily:rows(daily),
    audience:Object.fromEntries(rows(audience).map(row => [row.classification, Number(row.sessions || 0)]))
  };
}

async function trafficSnapshot(env) {
  const [dailyResult, monthRow, todayRow, yesterdayRow] = await Promise.all([
    env.DB.prepare(`SELECT substr(first_seen_at,1,10) AS day,COUNT(*) AS sessions
      FROM sessions
      WHERE classification='likely-human' AND first_seen_at >= datetime('now','-60 days')
      GROUP BY substr(first_seen_at,1,10) ORDER BY day`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions
      WHERE classification='likely-human' AND strftime('%Y-%m',first_seen_at)=strftime('%Y-%m','now')`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions
      WHERE classification='likely-human' AND date(first_seen_at)=date('now')`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions
      WHERE classification='likely-human' AND date(first_seen_at)=date('now','-1 day')`).first()
  ]);
  return {
    timezone:'UTC',
    today:Number(todayRow?.sessions||0),
    yesterday:Number(yesterdayRow?.sessions||0),
    monthToDate:Number(monthRow?.sessions||0),
    daily:rows(dailyResult).map(row=>({day:String(row.day),sessions:Number(row.sessions||0)}))
  };
}

function injectTrafficDashboard(html) {
  if (html.includes('id="trafficTimeSection"')) return html;
  const css = `<style>
#trafficTimeSection .trafficLive{display:inline-flex;align-items:center;gap:7px}.trafficDot{width:7px;height:7px;border-radius:999px;background:#067647;display:inline-block}.trafficBars .row{align-items:center}.trafficBars .bar{min-width:140px}.trafficTrend{font-weight:850}.trafficTrend.up{color:#067647}.trafficTrend.down{color:#b42318}
</style>`;
  const section = `<section class="section live" id="trafficTimeSection"><div class="sectionHead"><h2>Traffic over time</h2><span class="trafficLive"><i class="trafficDot"></i> auto-updates every 15s · UTC</span></div><div class="grid4" id="trafficTimeMetrics"></div><div class="grid2 section"><div class="panel"><div class="sectionHead"><h2>Daily visits</h2><span>Last 14 days · likely-human</span></div><div id="trafficDaily" class="trafficBars"></div></div><div class="panel"><div class="sectionHead"><h2>Momentum</h2><span>Temporal signals</span></div><div id="trafficMomentum"></div></div></div></section>`;
  const script = `<script>
(function(){
  function fmt(v,d){return Number(v||0).toLocaleString(undefined,d?{maximumFractionDigits:d}:undefined)}
  function pctDelta(current,previous){if(!previous)return current?null:0;return (current-previous)/previous*100}
  function isoDay(offset){var d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
  function fillDays(rows,count){var map=new Map((rows||[]).map(function(x){return [x.day,Number(x.sessions||0)]}));var out=[];for(var i=-(count-1);i<=0;i++){var day=isoDay(i);out.push({day:day,sessions:map.get(day)||0})}return out}
  function metric(label,value,meta){return '<div class="card"><small>'+label+'</small><b>'+value+'</b><span>'+meta+'</span></div>'}
  function renderTraffic(t){
    if(!t)return;
    var days60=fillDays(t.daily||[],60), days30=days60.slice(-30), days14=days60.slice(-14), last7=days60.slice(-7), prior7=days60.slice(-14,-7);
    var sum=function(a){return a.reduce(function(s,x){return s+x.sessions},0)};
    var last7Total=sum(last7), prior7Total=sum(prior7), rolling30=sum(days30), delta=pctDelta(last7Total,prior7Total);
    var now=new Date(), dayOfMonth=now.getUTCDate(), daysInMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate();
    var dailyAvg=dayOfMonth?Number(t.monthToDate||0)/dayOfMonth:0, projection=Math.round(dailyAvg*daysInMonth);
    var best=days30.reduce(function(a,b){return b.sessions>a.sessions?b:a},{day:'—',sessions:0});
    document.getElementById('trafficTimeMetrics').innerHTML=
      metric('Today',fmt(t.today),'Likely-human sessions')+
      metric('This month',fmt(t.monthToDate),'Month-to-date')+
      metric('Daily average',fmt(dailyAvg,1),'Current month')+
      metric('Monthly pace',fmt(projection),'Projection at current average');
    var max=Math.max.apply(null,[1].concat(days14.map(function(x){return x.sessions})));
    document.getElementById('trafficDaily').innerHTML=days14.slice().reverse().map(function(x){var w=Math.max(3,Math.round(x.sessions/max*100));return '<div class="row"><div style="flex:1"><div class="name">'+x.day+'</div><div class="bar"><i style="width:'+w+'%"></i></div></div><div class="value">'+fmt(x.sessions)+'</div></div>'}).join('');
    var deltaText=delta===null?'New traffic':((delta>=0?'+':'')+delta.toFixed(1)+'%');
    var deltaClass=delta===null||delta>=0?'up':'down';
    document.getElementById('trafficMomentum').innerHTML=
      '<div class="row"><div><div class="name">Last 7 days</div><div class="meta">Likely-human sessions</div></div><div class="value">'+fmt(last7Total)+'</div></div>'+
      '<div class="row"><div><div class="name">Previous 7 days</div><div class="meta">Comparison window</div></div><div class="value">'+fmt(prior7Total)+'</div></div>'+
      '<div class="row"><div><div class="name">7-day change</div><div class="meta">Current vs previous seven days</div></div><div class="value trafficTrend '+deltaClass+'">'+deltaText+'</div></div>'+
      '<div class="row"><div><div class="name">Yesterday</div><div class="meta">UTC day</div></div><div class="value">'+fmt(t.yesterday)+'</div></div>'+
      '<div class="row"><div><div class="name">Best day · 30d</div><div class="meta">'+best.day+'</div></div><div class="value">'+fmt(best.sessions)+'</div></div>'+
      '<div class="row"><div><div class="name">Rolling 30 days</div><div class="meta">Clean likely-human traffic</div></div><div class="value">'+fmt(rolling30)+'</div></div>';
  }
  async function refreshTraffic(){try{var res=await fetch('/api/stats?live='+Date.now(),{credentials:'same-origin',cache:'no-store'});if(res.ok){var d=await res.json();renderTraffic(d.traffic)}}catch(e){}}
  refreshTraffic();
  setInterval(function(){if(!document.hidden){if(typeof load==='function')load();refreshTraffic()}},15000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){if(typeof load==='function')load();refreshTraffic()}});
})();
</script>`;
  let out = html.replace('</style>', '</style>'+css);
  out = out.replace('<section class="section"><div class="sectionHead"><h2>End-to-end funnel</h2>', section+'<section class="section"><div class="sectionHead"><h2>End-to-end funnel</h2>');
  out = out.replace('</body>', script+'</body>');
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/analytics.html' && url.hostname === new URL(BASE).hostname) {
      const email=request.headers.get('Cf-Access-Authenticated-User-Email')||request.headers.get('cf-access-authenticated-user-email')||'';
      if (String(email).toLowerCase() !== 'pcaiano@gmail.com') return new Response('Not found',{status:404,headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'no-store'}});
      const dashboard=await env.ASSETS.fetch(request);
      const headers=new Headers(dashboard.headers);
      headers.set('Cache-Control','private, no-store');
      headers.set('Content-Type','text/html; charset=UTF-8');
      const html=await dashboard.text();
      return new Response(injectTrafficDashboard(html),{status:dashboard.status,headers});
    }
    if (url.pathname === '/api/events' && request.method === 'OPTIONS') return new Response(null, {status:204, headers:eventHeaders(request)});
    if (url.pathname === '/api/events' && request.method === 'POST') return ingest(request, env);
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const response = await base.fetch(request, env, ctx);
      if (!response.ok) return response;
      const stats = await response.json();
      try {
        const [funnel,traffic]=await Promise.all([funnelSnapshot(env),trafficSnapshot(env)]);
        const counts=funnel.audience||{};
        const observedExternalSessions=Object.entries(counts).filter(([key])=>key!==SESSION_CLASSIFICATIONS.OWNER).reduce((sum,[,value])=>sum+Number(value||0),0);
        const audience={...(stats.audience||{}),likelyHumanSessions:funnel.sessions,observedExternalSessions,knownBotCrawlerSessions:Number(counts[SESSION_CLASSIFICATIONS.KNOWN_BOT]||0),syntheticTestSessions:Number(counts[SESSION_CLASSIFICATIONS.SYNTHETIC]||0),ownerSessions:Number(counts[SESSION_CLASSIFICATIONS.OWNER]||0),unknownLegacySessions:Number(counts[SESSION_CLASSIFICATIONS.UNKNOWN]||0),otherClicks:funnel.outboundClicks,classificationNote:'Likely-human requires a plausible browser user agent. Owner, known crawler and synthetic traffic are excluded. Historical rows remain unknown/legacy and are never promoted to human.'};
        const total={...(stats.total||{}),sessions:funnel.sessions};
        return Response.json({...stats,total,audience,funnel,traffic}, {headers:{'Cache-Control':'private, no-store','Content-Type':'application/json; charset=UTF-8'}});
      }
      catch { return Response.json({...stats, funnel:{status:'unavailable', reason:'Funnel migration is not available.'}}, {headers:{'Cache-Control':'private, no-store'}}); }
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};
