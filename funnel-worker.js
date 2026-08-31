import base from './dynamic-worker.js';
import { parseFunnelEvent, rate } from './funnel-model.js';

const BASE = 'https://trytoolscout.org';
const rows = result => result?.results || [];
const owner = request => (request.headers.get('Cookie') || '').split(';').some(part => part.trim() === 'toolscout_owner=1');
const synthetic = request => /(?:curl|wget|uptime|healthcheck|github-actions)/i.test(request.headers.get('User-Agent') || '') && !request.headers.get('Referer');

function eventHeaders(request) {
  const headers = {'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Vary':'Origin'};
  const origin = request.headers.get('Origin');
  if (origin === BASE) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export async function ingest(request, env) {
  const headers = eventHeaders(request);
  if (synthetic(request)) return Response.json({ok:true, recorded:false}, {headers});
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 2048) return Response.json({error:'payload_too_large'}, {status:413, headers});
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return Response.json({error:'unsupported_media_type'}, {status:415, headers});
  }
  let body;
  try { const raw=await request.text();if(raw.length>2048)return Response.json({error:'payload_too_large'}, {status:413, headers});body=JSON.parse(raw); } catch { return Response.json({error:'invalid_json'}, {status:400, headers}); }
  const event = parseFunnelEvent(body);
  if (!event) return Response.json({error:'invalid_event'}, {status:400, headers});
  if (owner(request)) event.source = 'internal-test';
  const ownerFlag = event.source === 'internal-test' ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sessions (session_id,source,owner_flag,first_seen_at,last_seen_at)
      VALUES (?,?,?,datetime('now'),datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET last_seen_at=datetime('now'), owner_flag=MAX(owner_flag,excluded.owner_flag)`).bind(event.session_id,event.source,ownerFlag),
    env.DB.prepare(`INSERT OR IGNORE INTO funnel_events
      (event_id,session_id,event_type,intent_slug,tool_slug,path,source,referrer_host,created_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).bind(event.event_id,event.session_id,event.event_type,event.intent_slug,event.tool_slug,event.path,event.source,event.referrer_host)
  ]);
  return Response.json({ok:true}, {status:202, headers});
}

async function funnelSnapshot(env) {
  const window = "created_at >= datetime('now','-30 days')";
  const external = "source != 'internal-test'";
  const [eventCounts, sessionCount, byIntent, byTool, bySource, daily, audience] = await Promise.all([
    env.DB.prepare(`SELECT event_type,COUNT(*) AS events,COUNT(DISTINCT session_id) AS sessions FROM funnel_events WHERE ${window} AND ${external} GROUP BY event_type`).all(),
    env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE first_seen_at >= datetime('now','-30 days') AND owner_flag=0`).first(),
    env.DB.prepare(`SELECT COALESCE(intent_slug,'general') AS intent_slug,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${external} AND intent_slug IS NOT NULL GROUP BY intent_slug,event_type ORDER BY events DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT tool_slug,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${external} AND tool_slug IS NOT NULL GROUP BY tool_slug,event_type ORDER BY events DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT source,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${external} GROUP BY source,event_type ORDER BY events DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT substr(created_at,1,10) AS day,event_type,COUNT(*) AS events FROM funnel_events WHERE ${window} AND ${external} GROUP BY day,event_type ORDER BY day`).all(),
    env.DB.prepare(`SELECT owner_flag,COUNT(*) AS sessions FROM sessions WHERE first_seen_at >= datetime('now','-30 days') GROUP BY owner_flag`).all()
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
    daily:rows(daily),
    audience:Object.fromEntries(rows(audience).map(row => [row.owner_flag ? 'ownerSessions' : 'otherSessions', Number(row.sessions || 0)]))
  };
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
      return new Response(dashboard.body,{status:dashboard.status,headers});
    }
    if (url.pathname === '/api/events' && request.method === 'OPTIONS') return new Response(null, {status:204, headers:eventHeaders(request)});
    if (url.pathname === '/api/events' && request.method === 'POST') return ingest(request, env);
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const response = await base.fetch(request, env, ctx);
      if (!response.ok) return response;
      const stats = await response.json();
      try {
        const funnel=await funnelSnapshot(env);
        const audience={...(stats.audience||{}),otherSessions:funnel.sessions,ownerSessions:Number(funnel.audience?.ownerSessions||0),otherClicks:funnel.outboundClicks};
        const total={...(stats.total||{}),sessions:funnel.sessions};
        return Response.json({...stats,total,audience,funnel}, {headers:{'Cache-Control':'private, max-age=60'}});
      }
      catch { return Response.json({...stats, funnel:{status:'unavailable', reason:'Funnel migration is not available.'}}, {headers:{'Cache-Control':'private, max-age=60'}}); }
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};
