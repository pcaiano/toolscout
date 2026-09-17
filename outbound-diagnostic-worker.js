import base from './traffic-integrity-live-worker.js';

const HEALTH_PATH='/api/traffic-integrity-health';

async function first(env,sql,bindings=[]){
  try{return await env.DB.prepare(sql).bind(...bindings).first()}catch(error){return {error:String(error?.message||error)}}
}

async function outboundDiagnostic(env){
  if(!env.DB)return {status:'unavailable',reason:'D1 unavailable'};
  const [raw,human,pageConfirmed,guard,qualified,funnel]=await Promise.all([
    first(env,`SELECT COUNT(*) clicks30d,SUM(CASE WHEN created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) clicks24h,MAX(created_at) last_at FROM click_events WHERE created_at>=datetime('now','-30 days') AND COALESCE(source,'') NOT IN ('internal-test','synthetic','health-check','ci')`),
    first(env,`SELECT COUNT(*) clicks30d,SUM(CASE WHEN c.created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) clicks24h,MAX(c.created_at) last_at FROM click_events c JOIN sessions s ON s.session_id=c.session_id WHERE c.created_at>=datetime('now','-30 days') AND COALESCE(c.source,'') NOT IN ('internal-test','synthetic','health-check','ci') AND s.classification IN ('likely-human','human')`),
    first(env,`SELECT COUNT(*) clicks30d,SUM(CASE WHEN c.created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) clicks24h,MAX(c.created_at) last_at FROM click_events c WHERE c.created_at>=datetime('now','-30 days') AND COALESCE(c.source,'') NOT IN ('internal-test','synthetic','health-check','ci') AND EXISTS (SELECT 1 FROM funnel_events f WHERE f.session_id=c.session_id AND f.event_type='page_confirmed')`),
    first(env,`SELECT COUNT(*) clicks7d,SUM(CASE WHEN c.created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) clicks24h,MAX(c.created_at) last_at FROM click_events c WHERE c.created_at>=datetime('now','-7 days') AND COALESCE(c.source,'') NOT IN ('internal-test','synthetic','health-check','ci') AND EXISTS (SELECT 1 FROM traffic_guard_events g WHERE g.session_id=c.session_id AND g.decision='allowed')`),
    first(env,`SELECT COUNT(*) clicks30d,SUM(CASE WHEN c.created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) clicks24h,SUM(CASE WHEN c.affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized30d,MAX(c.created_at) last_at FROM click_events c JOIN sessions s ON s.session_id=c.session_id WHERE c.created_at>=datetime('now','-30 days') AND COALESCE(c.source,'') NOT IN ('internal-test','synthetic','health-check','ci') AND s.classification IN ('likely-human','human') AND EXISTS (SELECT 1 FROM funnel_events f WHERE f.session_id=c.session_id AND f.event_type='page_confirmed')`),
    first(env,`SELECT COUNT(*) events30d,SUM(CASE WHEN created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) events24h,MAX(created_at) last_at FROM funnel_events WHERE event_type='outbound_clicked' AND created_at>=datetime('now','-30 days')`)
  ]);
  return {
    status:'observed',
    generatedAt:new Date().toISOString(),
    readOnly:true,
    rawClickEvents:{windowDays:30,...raw},
    humanSessionClassified:{windowDays:30,...human},
    pageConfirmedLinked:{windowDays:30,...pageConfirmed},
    guardAllowedLinked:{windowDays:7,...guard},
    commandCenterQualified:{windowDays:30,...qualified},
    funnelOutboundEvents:{windowDays:30,...funnel},
    interpretation:'Compare rawClickEvents with commandCenterQualified. A gap means click events exist but are being filtered from the Command Center outbound metric.'
  };
}

export default {
  async fetch(request,env,ctx){
    const response=await base.fetch(request,env,ctx);
    const url=new URL(request.url);
    if(request.method!=='GET'||url.pathname!==HEALTH_PATH||!response.ok)return response;
    let data;try{data=await response.json()}catch{return response}
    data.outboundDiagnostic=await outboundDiagnostic(env);
    const headers=new Headers(response.headers);
    headers.set('Content-Type','application/json; charset=UTF-8');
    headers.set('Cache-Control','no-store');
    headers.delete('Content-Length');
    headers.delete('Content-Encoding');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
