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
const GROWTH_EVIDENCE_RANK={none:0,directional:1,emerging:2,strong:3,revenue_confirmed:4};
let growthSchemaReady=null;
async function ensureGrowthSchema(env){
  if(growthSchemaReady)return growthSchemaReady;
  growthSchemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_opportunity_state(
      opportunity_key TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      priority_score REAL NOT NULL DEFAULT 0,
      signal_json TEXT NOT NULL,
      action_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_opportunity_priority ON growth_opportunity_state(status,priority_score DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_opportunity_subject ON growth_opportunity_state(subject_type,subject_key)`)
  ]).catch(error=>{growthSchemaReady=null;throw error});
  return growthSchemaReady;
}
async function growthRows(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
async function growthAssetJson(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}
async function coordinateGrowthOpportunities(env){
  await ensureGrowthSchema(env);
  const [surfaces,tools,organicGrowth,aeoGeo,machineReadability]=await Promise.all([
    growthRows(env,`SELECT o.surface_slug,o.surface_name,o.surface_type,o.status,o.distribution_score,
      l.evidence_grade,l.browser_confirmed_sessions_30d,l.outbound_clicks_30d,l.monetized_outbound_30d,
      n.status network_status,n.adoption_kind
      FROM distribution_opportunities o
      LEFT JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug
      LEFT JOIN distribution_network_outreach n ON n.surface_slug=o.surface_slug
      WHERE o.surface_slug IS NOT NULL AND o.status NOT IN ('policy_blocked','rejected','skipped','unavailable_free')`),
    growthRows(env,`SELECT v.tool_slug,v.priority_score,v.status vendor_status,v.asset_url,
      p.status profile_status,a.policy_status,a.organic_social_allowed,a.direct_affiliate_link_allowed
      FROM distribution_vendor_amplification v
      LEFT JOIN content_social_profiles p ON p.tool_slug=v.tool_slug
      LEFT JOIN affiliate_social_policy a ON a.tool_slug=v.tool_slug
      WHERE v.tool_slug IS NOT NULL`),
    growthAssetJson(env,'/reports/organic-growth-opportunities.json',{generatedAt:null,opportunities:[],summary:{}}),
    growthAssetJson(env,'/reports/aeo-geo-readiness.json',{generatedAt:null,failures:null,warnings:null}),
    growthAssetJson(env,'/reports/machine-readability.json',{generatedAt:null,failures:null,warnings:null})
  ]);
  const searchOpportunities=Array.isArray(organicGrowth?.opportunities)?organicGrowth.opportunities:[];
  const searchBoostByTool=new Map();
  for(const op of searchOpportunities){
    const score=Math.max(0,Math.min(100,Number(op?.priorityScore||0)));
    for(const tool of Array.isArray(op?.topTools)?op.topTools:[]){
      const slug=String(tool||'').toLowerCase();if(!slug)continue;
      searchBoostByTool.set(slug,Math.max(searchBoostByTool.get(slug)||0,Math.min(15,score*0.2)));
    }
  }
  await env.DB.prepare(`UPDATE growth_opportunity_state SET status='dormant',updated_at=datetime('now') WHERE status='active'`).run().catch(()=>{});
  let active=0,toolCount=0,surfaceCount=0,searchCount=0;
  for(const row of surfaces){
    const evidence=String(row.evidence_grade||'none');
    const network=String(row.network_status||'');
    const score=Math.min(100,Math.max(0,Number(row.distribution_score||0)
      +(GROWTH_EVIDENCE_RANK[evidence]||0)*4
      +(network==='contact_route_found'?4:0)+(network==='contact_found'?7:0)+(network==='sent'?10:0)+(network==='adopted'?18:0)));
    const actions=['distribution_measurement'];
    if(!network||network==='queued'||network==='send_failed')actions.unshift('publisher_contact_discovery');
    if(network==='contact_route_found')actions.unshift('content_relevance_amplification');
    if(network==='contact_found')actions.unshift('publisher_outreach');
    if(network==='adopted')actions.unshift('scale_proven_surface');
    const signals={surface_status:row.status,network_status:network||null,evidence_grade:evidence,browser_confirmed_sessions_30d:Number(row.browser_confirmed_sessions_30d||0),outbound_clicks_30d:Number(row.outbound_clicks_30d||0),monetized_outbound_30d:Number(row.monetized_outbound_30d||0),adoption_kind:row.adoption_kind||null};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`surface:${row.surface_slug}`,'surface',row.surface_slug,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;surfaceCount++;
  }
  for(const row of tools){
    const profile=String(row.profile_status||'')==='verified';
    const affiliate=Number(row.organic_social_allowed)===1&&Number(row.direct_affiliate_link_allowed)===1;
    const vendor=String(row.vendor_status||'');
    const searchBoost=Number(searchBoostByTool.get(String(row.tool_slug||'').toLowerCase())||0);
    const score=Math.min(100,Math.max(0,Number(row.priority_score||0)+(profile?8:0)+(affiliate?12:0)+(vendor==='contact_found'?6:0)+(vendor==='sent'?10:0)+searchBoost));
    const actions=['vendor_amplification'];
    if(profile)actions.push('content_mention');
    if(affiliate)actions.push('affiliate_social');
    const signals={vendor_status:vendor,verified_social_profile:profile,affiliate_social_allowed:affiliate,search_priority_boost:Number(searchBoost.toFixed(2)),asset_url:row.asset_url||null,policy_status:row.policy_status||null};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`tool:${row.tool_slug}`,'tool',row.tool_slug,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;toolCount++;
  }
  for(const op of searchOpportunities.slice(0,40)){
    const intent=String(op?.intent||'').trim();if(!intent)continue;
    const priority=Math.max(0,Math.min(100,Number(op?.priorityScore||0)));
    const execution=Array.isArray(op?.executionPlan)?op.executionPlan:[];
    const actions=[...new Set([...execution,'content_amplification','distribution_amplification','search_measurement'])];
    const signals={
      lane:op?.lane||null,
      action:op?.action||null,
      evidence_confidence:op?.evidenceConfidence||null,
      monetization_readiness:op?.monetizationReadiness||null,
      impressions:Number(op?.searchSignal?.impressions||0),
      clicks:Number(op?.searchSignal?.clicks||0),
      ctr:Number(op?.searchSignal?.ctr||0),
      position:Number(op?.searchSignal?.position||0),
      top_tools:Array.isArray(op?.topTools)?op.topTools.slice(0,5):[],
      aeo_geo_failures:Number(aeoGeo?.failures||0),
      aeo_geo_warnings:Number(aeoGeo?.warnings||0),
      machine_readability_failures:Number(machineReadability?.failures||0),
      machine_readability_warnings:Number(machineReadability?.warnings||0),
      organic_report_generated_at:organicGrowth?.generatedAt||null
    };
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`search:${intent}`,'search',intent,Number(priority.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;searchCount++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(`growthcoord_${crypto.randomUUID()}`,'growth_opportunity_coordination','completed','growth_system',`Autonomous growth coordinator refreshed ${active} active opportunities: ${surfaceCount} distribution surfaces, ${toolCount} tool/vendor opportunities and ${searchCount} Search/GEO/AEO opportunities. Tool priorities inherit bounded boosts from observed search opportunities so Distribution, Content, SEO/GEO/AEO and Affiliate effort can converge on the same subjects.`).run().catch(()=>{});
  return {ok:true,active,surfaces:surfaceCount,tools:toolCount,search:searchCount,searchEvidenceGeneratedAt:organicGrowth?.generatedAt||null};
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
export default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/api/distribution/orchestrate'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});let b={};try{b=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:H})}if(!b.asset_url||!/^https:\/\/trytoolscout\.org\//.test(String(b.asset_url)))return Response.json({error:'valid_toolscout_asset_url_required'},{status:400,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_fanout',triggerName:'manual_api'},()=>fanout(env,String(b.asset_url))),{headers:H});}if(u.pathname==='/api/distribution/orchestrate/scan'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:'manual_api'},()=>scanNew(request,env)),{headers:H});}if(u.pathname==='/api/distribution/economic-learning'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:'manual_api'},()=>learnEconomics(env)),{headers:H});}if(u.pathname==='/api/growth/opportunities/refresh'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'growth',mission:'opportunity_coordination',triggerName:'manual_api'},()=>coordinateGrowthOpportunities(env)),{headers:H});}if(u.pathname==='/api/growth/opportunities'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await ensureGrowthSchema(env);const q=await env.DB.prepare(`SELECT opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,last_evaluated_at FROM growth_opportunity_state WHERE status='active' ORDER BY priority_score DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}if(u.pathname==='/api/distribution/editorial-queue'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await normalizeEditorialQueue(env);const q=await env.DB.prepare(`SELECT queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,human_required,updated_at FROM distribution_editorial_queue ORDER BY created_at DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}return base.fetch(request,env,ctx);},async scheduled(event,env,ctx){await normalizeEditorialQueue(env);await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:event?.cron||'scheduled'},()=>learnEconomics(env));if(event?.cron==='15 3 * * *')await runWithLedger(env,{engine:'growth',mission:'opportunity_coordination',triggerName:event.cron},()=>coordinateGrowthOpportunities(env));if(base.scheduled)await base.scheduled(event,env,ctx);if(event?.cron==='15 3 * * *')await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:event.cron},()=>scanNew(new Request('https://trytoolscout.org/'),env));}};
