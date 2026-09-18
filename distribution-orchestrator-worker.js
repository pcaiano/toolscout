import base from './distribution-priority-worker.js';
import {distributionSurfaceMetrics} from './distribution-impact-worker.js';
import {runWithLedger} from './engine-run-ledger.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const safe=(v,n=3000)=>String(v??'').slice(0,n);
async function auth(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}
function classify(url){const p=new URL(url).pathname.toLowerCase();if(p.includes('-vs-'))return'comparison';if(p.includes('best-'))return'best_of';if(p.includes('alternatives'))return'alternatives';return'decision_asset';}
function angle(url,type){const slug=new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/,'').replace(/-/g,' ')||'software decision';if(type==='comparison')return`Independent comparison data and decision framing for ${slug}.`;if(type==='best_of')return`Evidence-led shortlist for ${slug}, with a buyer-intent angle rather than a generic tool dump.`;return`Independent ToolScout decision resource about ${slug}.`;}
function confirmedSessions(metric){return Math.max(0,Number(metric?.browser_confirmed_sessions??metric?.human_sessions??0)||0)}
function economicBoost(metric){
  if(!metric)return 0;
  const sessions=confirmedSessions(metric),outbound=Math.max(0,Number(metric.outbound_clicks)||0),monetized=Math.max(0,Number(metric.monetized_outbound)||0),revenue=Math.max(0,Number(metric.revenue)||0);
  const confidence=Math.min(1,sessions/5);
  const observed=Math.min(22,sessions*1.25+outbound*2+monetized*5)*(0.35+0.65*confidence);
  const revenueBoost=Math.min(28,revenue*2.5);
  return Number(Math.min(50,observed+revenueBoost).toFixed(2));
}
function evidenceGrade(metric){
  const sessions=confirmedSessions(metric),monetized=Math.max(0,Number(metric?.monetized_outbound)||0),revenue=Math.max(0,Number(metric?.revenue)||0);
  if(revenue>0)return'revenue_confirmed';
  if(sessions>=10&&monetized>=2)return'strong';
  if(sessions>=3||monetized>=1)return'emerging';
  if(sessions>=1)return'directional';
  return'none';
}
function paidPolicy(metric,cost){
  if(!cost)return{decision:'free_default',roi:null};
  const sessions=confirmedSessions(metric),revenue=metric?.revenue==null?null:Number(metric.revenue),sameCurrency=Boolean(metric?.currency&&cost.currency&&metric.currency===cost.currency);
  if(sameCurrency&&revenue!=null&&Number.isFinite(revenue)){
    const roi=cost.cost_amount>0?Number(((revenue-cost.cost_amount)/cost.cost_amount).toFixed(4)):null;
    if(revenue>cost.cost_amount)return{decision:'evidence_positive',roi};
    if(sessions>=10)return{decision:'hold_no_return',roi};
    return{decision:'experiment_measuring',roi};
  }
  return{decision:'experiment_measuring',roi:null};
}
async function learnEconomics(env){
  let metrics=[];
  try{metrics=await distributionSurfaceMetrics(env)}catch{return{ok:false,observed:0,updated:0,reason:'surface_metrics_unavailable'}}
  const bySlug=new Map(metrics.map(m=>[m.surface_slug,m]));
  const [q,costRows]=await Promise.all([
    env.DB.prepare(`SELECT surface_slug,distribution_score FROM distribution_opportunities WHERE surface_slug IS NOT NULL`).all(),
    env.DB.prepare(`SELECT surface_slug,cost_amount,currency,cost_type FROM distribution_surface_costs`).all().catch(()=>({results:[]}))
  ]);
  const costs=new Map((costRows.results||[]).map(c=>[c.surface_slug,{...c,cost_amount:Number(c.cost_amount||0)}]));
  let updated=0,positive=0,withEvidence=0,paidMeasuring=0;
  for(const row of q.results||[]){
    const existing=await env.DB.prepare(`SELECT baseline_score FROM distribution_economic_learning WHERE surface_slug=?`).bind(row.surface_slug).first();
    const baseline=Number(existing?.baseline_score??row.distribution_score??0);
    const metric=bySlug.get(row.surface_slug)||null;
    const sessions=confirmedSessions(metric),outbound=Math.max(0,Number(metric?.outbound_clicks)||0),monetized=Math.max(0,Number(metric?.monetized_outbound)||0);
    const boost=economicBoost(metric),learned=Number(Math.min(100,baseline+boost).toFixed(2)),grade=evidenceGrade(metric),cost=costs.get(row.surface_slug)||null,policy=paidPolicy(metric,cost);
    const sessionToOutbound=sessions?Number((outbound/sessions*100).toFixed(2)):0,monetizationRate=outbound?Number((monetized/outbound*100).toFixed(2)):0;
    if(boost>0)positive++;if(grade!=='none')withEvidence++;if(policy.decision==='experiment_measuring')paidMeasuring++;
    await env.DB.prepare(`INSERT INTO distribution_economic_learning(surface_slug,baseline_score,learned_score,human_sessions_30d,outbound_clicks_30d,monetized_outbound_30d,confirmed_revenue_30d,currency,economic_boost,last_observed_at,created_at,updated_at,browser_confirmed_sessions_30d,session_to_outbound_rate,monetization_rate,evidence_grade,paid_policy_decision,observed_cost,observed_cost_currency,observed_roi) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'),?,?,?,?,?,?,?,?) ON CONFLICT(surface_slug) DO UPDATE SET learned_score=excluded.learned_score,human_sessions_30d=excluded.human_sessions_30d,outbound_clicks_30d=excluded.outbound_clicks_30d,monetized_outbound_30d=excluded.monetized_outbound_30d,confirmed_revenue_30d=excluded.confirmed_revenue_30d,currency=excluded.currency,economic_boost=excluded.economic_boost,last_observed_at=datetime('now'),updated_at=datetime('now'),browser_confirmed_sessions_30d=excluded.browser_confirmed_sessions_30d,session_to_outbound_rate=excluded.session_to_outbound_rate,monetization_rate=excluded.monetization_rate,evidence_grade=excluded.evidence_grade,paid_policy_decision=excluded.paid_policy_decision,observed_cost=excluded.observed_cost,observed_cost_currency=excluded.observed_cost_currency,observed_roi=excluded.observed_roi`).bind(row.surface_slug,baseline,learned,sessions,outbound,monetized,metric?.revenue==null?null:Number(metric.revenue),metric?.currency||null,boost,sessions,sessionToOutbound,monetizationRate,grade,policy.decision,cost?.cost_amount??null,cost?.currency??null,policy.roi).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET distribution_score=?,observed_human_sessions=?,observed_outbound_clicks=?,observed_revenue=?,performance_score=?,learned_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(learned,sessions,outbound,metric?.revenue==null?0:Number(metric.revenue),boost,row.surface_slug).run();
    updated++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`econ_${crypto.randomUUID()}`,'distribution_economic_learning','completed','distribution_engine',`Economic learning updated ${updated} surface(s) using browser-confirmed sessions only; ${withEvidence} surface(s) have evidence, ${positive} received a positive observed-performance boost and ${paidMeasuring} paid experiment(s) remain in measurement. Missing evidence is never treated as traffic.`).run();
  return{ok:true,observed:metrics.length,updated,positive_boosts:positive,surfaces_with_evidence:withEvidence,paid_experiments_measuring:paidMeasuring,evidence_basis:'browser_confirmed'};
}
async function prepareEditorial(env,url,type){const targets=[['community','Hacker News / Show HN','https://news.ycombinator.com/'],['community','Indie Hackers','https://www.indiehackers.com/'],['community','Relevant Reddit communities','https://www.reddit.com/'],['community','Stremit','https://stremit.io/feed']];let n=0;for(const [channel,name,target] of targets){const id=`ed_${crypto.randomUUID()}`;const a=angle(url,type);const title=type==='comparison'?`We compared ${new URL(url).pathname.split('/').pop()?.replace(/\.html$/,'').replace(/-/g,' ')}`:`ToolScout research: ${new URL(url).pathname.split('/').pop()?.replace(/\.html$/,'').replace(/-/g,' ')}`;const body=name==='Stremit'?`${a}\n\nI built this around a practical question: which option fits the job, constraints and workflow best? The page keeps the facts structured, then adds a concise editorial view of the tradeoffs.\n\n${url}`:`${a}\n\nToolScout: ${url}\n\nPrepared automatically. Review community rules and context before posting.`;await env.DB.prepare(`INSERT INTO distribution_editorial_queue(queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'autonomy_pending',0,datetime('now'),datetime('now'))`).bind(id,url,channel,name,target,a,safe(title,300),safe(body,3000)).run();n++;}return n;}
let editorialQueueNormalized=null;
async function normalizeEditorialQueue(env){
  if(editorialQueueNormalized)return editorialQueueNormalized;
  editorialQueueNormalized=env.DB.prepare(`UPDATE distribution_editorial_queue SET status='autonomy_pending',human_required=0,updated_at=datetime('now') WHERE human_required=1 AND status='prepared' AND channel_type IN ('community','community_stack')`).run().catch(()=>null);
  return editorialQueueNormalized;
}
async function fanout(env,url){await normalizeEditorialQueue(env);const type=classify(url);await env.DB.prepare(`INSERT INTO distribution_asset_state(asset_url,asset_type,first_seen_at,last_seen_at,distributed_at) VALUES(?,?,datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(asset_url) DO UPDATE SET asset_type=excluded.asset_type,last_seen_at=datetime('now'),distributed_at=COALESCE(distribution_asset_state.distributed_at,datetime('now'))`).bind(url,type).run();const editorial=await prepareEditorial(env,url,type);await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`asset_${crypto.randomUUID()}`,'asset_distribution_triggered','completed',type,url,url,`Event-driven fanout prepared: syndication feed exposure, Submission Engine eligibility, Vendor Amplification eligibility and ${editorial} internal editorial/community autonomy candidates. They do not enter Chairman Queue unless a genuine human-only gate is later proven.`).run();return {ok:true,asset_url:url,asset_type:type,editorialPrepared:editorial};}
async function scanNew(request,env){let r;try{r=await env.ASSETS.fetch(new Request(new URL('/sitemap.xml',request.url)));}catch{return{ok:false,scanned:0,newAssets:0,reason:'sitemap_fetch_failed'}}if(!r.ok)return{ok:false,scanned:0,newAssets:0,reason:`sitemap_http_${r.status}`};const xml=await r.text();const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).filter(u=>/^https:\/\/trytoolscout\.org\//.test(u)&&/(best-|\-vs-|alternatives|compare)/i.test(u));let added=0;for(const url of urls.slice(0,150)){const row=await env.DB.prepare('SELECT asset_url FROM distribution_asset_state WHERE asset_url=?').bind(url).first();if(row)continue;await fanout(env,url);added++;}return{ok:true,scanned:urls.length,newAssets:added};}
export default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/api/distribution/orchestrate'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});let b={};try{b=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:H})}if(!b.asset_url||!/^https:\/\/trytoolscout\.org\//.test(String(b.asset_url)))return Response.json({error:'valid_toolscout_asset_url_required'},{status:400,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_fanout',triggerName:'manual_api'},()=>fanout(env,String(b.asset_url))),{headers:H});}if(u.pathname==='/api/distribution/orchestrate/scan'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:'manual_api'},()=>scanNew(request,env)),{headers:H});}if(u.pathname==='/api/distribution/economic-learning'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:'manual_api'},()=>learnEconomics(env)),{headers:H});}if(u.pathname==='/api/distribution/editorial-queue'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await normalizeEditorialQueue(env);const q=await env.DB.prepare(`SELECT queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,human_required,updated_at FROM distribution_editorial_queue ORDER BY created_at DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}return base.fetch(request,env,ctx);},async scheduled(event,env,ctx){await normalizeEditorialQueue(env);await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:event?.cron||'scheduled'},()=>learnEconomics(env));if(base.scheduled)await base.scheduled(event,env,ctx);if(event?.cron==='15 3 * * *')await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:event.cron},()=>scanNew(new Request('https://trytoolscout.org/'),env));}};
