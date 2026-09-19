import base from './command-center-autoload-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const PUBLIC_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const TIME_ZONE='Europe/Lisbon';

async function digestHex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function validSession(request,env){
  if(!env.ADMIN_TOKEN)return false;
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if(!match)return false;
  const supplied=decodeURIComponent(match[1]);
  const bucket=sessionBucket();
  for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;
  return false;
}
function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
async function safeFirst(env,sql,bindings=[]){
  try{return await env.DB.prepare(sql).bind(...bindings).first()}catch{return null}
}
async function safeAll(env,sql,bindings=[]){
  try{return (await env.DB.prepare(sql).bind(...bindings).all()).results||[]}catch{return []}
}
async function assetJson(request,env,path,fallback={}){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}
}
async function assetText(request,env,path,fallback=''){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.text():fallback}catch{return fallback}
}
function parseSqliteUtc(value){
  const text=String(value||'').trim();
  if(!text)return null;
  const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));
  return Number.isFinite(d.getTime())?d:null;
}
function sqliteUtc(date){return date.toISOString().replace('T',' ').slice(0,19)}
function zonedParts(value,timeZone=TIME_ZONE){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value instanceof Date?value:new Date(value));
  return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
}
function zonedDayKey(value,timeZone=TIME_ZONE){const p=zonedParts(value,timeZone);return `${p.year}-${p.month}-${p.day}`}
function offsetMs(value,timeZone=TIME_ZONE){
  const d=value instanceof Date?value:new Date(value),p=zonedParts(d,timeZone);
  const localAsUtc=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
  return localAsUtc-Math.floor(d.getTime()/1000)*1000;
}
function zonedMidnight(dayKey,timeZone=TIME_ZONE){
  const [y,m,d]=dayKey.split('-').map(Number);
  const localUtc=Date.UTC(y,m-1,d,0,0,0);
  let guess=localUtc;
  for(let i=0;i<3;i++)guess=localUtc-offsetMs(new Date(guess),timeZone);
  return new Date(guess);
}
function stateCounts(rows){const out={};for(const row of rows){const k=String(row.status||'unknown');out[k]=(out[k]||0)+n(row.count)}return out}
function daysInMonthForKey(key){const [y,m]=key.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()}
function firstTouchBuckets(rows){
  const first=new Map();
  for(const row of rows){const id=String(row.visitor_id||'');if(id&&!first.has(id))first.set(id,row)}
  const buckets={search:0,ai_referral:0,distribution:0,social:0,dark_direct_deep:0,direct_home:0,tracked_campaign:0,other_referral:0,unattributed:0};
  const ai=['chatgpt.com','chat.openai.com','perplexity.ai','claude.ai','gemini.google.com','copilot.microsoft.com','poe.com','you.com','grok.com'];
  const social=['linkedin.com','lnkd.in','x.com','twitter.com','t.co','bsky.app','facebook.com','instagram.com','reddit.com','threads.net'];
  const distribution=['uneed.best','producthunt.com','saashub.com','peerlist.io','tinylaunch.com','betalist.com','indiehackers.com'];
  const search=['google.','bing.com','search.yahoo.com','duckduckgo.com','search.brave.com','ecosia.org','yandex.','baidu.com'];
  const hostMatch=(host,list)=>list.some(x=>x.endsWith('.')?host.startsWith(x)||host.includes('.'+x):host===x||host.endsWith('.'+x));
  for(const row of first.values()){
    const source=String(row.source||'direct').toLowerCase(),host=String(row.referrer_host||'').toLowerCase(),path=String(row.path||'/');
    if(hostMatch(host,ai)||/(chatgpt|openai|perplexity|claude|gemini|copilot|poe|grok)/.test(source)){buckets.ai_referral++;continue}
    if(hostMatch(host,search)||/^ref:(google\.|bing\.com|duckduckgo\.com|search\.brave\.com|search\.yahoo\.com)/.test(source)){buckets.search++;continue}
    if(hostMatch(host,distribution)||/(uneed|producthunt|saashub|peerlist|tinylaunch|betalist|indiehackers|rss|websub)/.test(source)){buckets.distribution++;continue}
    if(hostMatch(host,social)||/(linkedin|twitter|bluesky|facebook|instagram|reddit|threads|utm_source=x)/.test(source)){buckets.social++;continue}
    if(source==='direct'&&!host){if(path==='/'||path==='/index.html')buckets.direct_home++;else buckets.dark_direct_deep++;continue}
    if(source.includes('utm_source=')||source!=='direct'){buckets.tracked_campaign++;continue}
    if(host||source.startsWith('ref:')){buckets.other_referral++;continue}
    buckets.unattributed++;
  }
  return {total:first.size,buckets:Object.entries(buckets).filter(([,visitors])=>visitors>0).map(([key,visitors])=>({key,visitors}))};
}
function queueItem(action){
  const affiliate=action.engine==='affiliate',editorial=Boolean(action.editorial_queue_id),metric=n(action.metric);
  const minutes=editorial?6:(affiliate?(action.status==='approved_needs_link'?2:5):(/hacker-news|indie-hackers/i.test(action.id||'')?8:5));
  const impactScore=affiliate?(metric*20+40):metric;
  const whyHuman=editorial?'Publication requires an authenticated community account and a final human review before a public post or Stack goes live.':(action.reason||'This step requires owner authentication, judgement or a third-party action.');
  const after=editorial?'Mark it published in the Chairman Queue. The Distribution Engine then removes the task and continues attribution and performance measurement.':(affiliate?'Affiliate Coverage Engine resumes the canonical workflow and waits for evidence-backed approval or activation.':'Distribution Engine resumes verification, attribution and measurement after the human gate is recorded.');
  return {...action,estimated_minutes:minutes,expected_impact_score:Number(impactScore.toFixed(1)),why_human:whyHuman,expected_impact:affiliate?(metric?`Recover monetization on ${metric} browser-confirmed unmonetized outbound click${metric===1?'':'s'} / 30d`:'Expand monetized affiliate coverage'):(editorial?'Publish a prepared community contribution and begin measuring attributable referral quality.':(metric?`Distribution opportunity score ${Math.round(metric)}/100`:'Unlock a blocked distribution surface')),after_action:after};
}
async function editorialQueueRows(env){
  return safeAll(env,`SELECT queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,updated_at
    FROM distribution_editorial_queue
    WHERE human_required=1 AND status='prepared' AND target_url IS NOT NULL
    ORDER BY CASE WHEN target_name='Stremit' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 20`);
}
function editorialAction(row){
  const target=String(row.target_name||'Community'),publicationType=row.channel_type==='community_stack'?'Stack':'Post',isStremit=target==='Stremit';
  const instructions=isStremit&&publicationType==='Stack'
    ?'Open the New stack page. Paste the prepared title and description. Add ToolScout, ChatGPT, Make and GitHub in that order. Use each Role line in the prepared content as the use case for that tool. Review the Stack, then publish it. Do not buy promotion.'
    :isStremit
      ?'Open the Stremit composer. Paste the prepared title and content, verify the ToolScout link, then publish if it fits the community context.'
      :'Open the community destination. Review the prepared title and content against current rules, then publish if appropriate.';
  return {
    engine:'distribution',
    id:`editorial:${row.queue_id}`,
    editorial_queue_id:row.queue_id,
    title:`${target}: ${row.suggested_title||'Prepared community contribution'}`,
    status:'prepared',
    reason:row.angle||'Prepared community distribution action requiring human review.',
    action_url:row.target_url,
    metric:isStremit?72:45,
    metric_label:'editorial priority',
    source_of_truth:'distribution_editorial_queue',
    publication_type:publicationType,
    prepared_title:row.suggested_title||'',
    prepared_body:row.suggested_body||'',
    instructions,
    source_asset_url:row.asset_url||null
  };
}
async function lightweightQueue(request,env,ctx){
  try{
    const [rawResponse,editorialRows]=await Promise.all([
      base.fetch(new Request(new URL('/analytics/api/human-actions',request.url).toString(),{method:'GET',headers:request.headers}),env,ctx),
      editorialQueueRows(env)
    ]);
    const raw=rawResponse.ok?await rawResponse.json():{affiliate:[],distribution:[]};
    const nonEditorial=[...(raw.affiliate||[]),...(raw.distribution||[])].filter(x=>!x.editorial_queue_id&&!String(x.id||'').startsWith('editorial:'));
    const editorial=editorialRows.map(editorialAction);
    const items=[...nonEditorial,...editorial].map(queueItem).sort((a,b)=>(b.expected_impact_score/Math.max(1,b.estimated_minutes))-(a.expected_impact_score/Math.max(1,a.estimated_minutes))).slice(0,12);
    return {status:'connected',total:items.length,estimated_minutes:items.reduce((sum,x)=>sum+n(x.estimated_minutes),0),items,broken_links:[],external_verification_issues:[],payload_version:'chairman-editorial-v3',rule:'Current canonical engine states plus prepared editorial actions read directly from D1. Editorial tasks include publication type, exact instructions, title and prepared content.'};
  }catch(error){return {status:'partial',total:0,estimated_minutes:0,items:[],broken_links:[],external_verification_issues:[],reason:String(error?.message||error)}}
}
async function resilientSnapshot(request,env,ctx){
  const now=new Date(),todayKey=zonedDayKey(now),monthKey=todayKey.slice(0,7),todayStart=zonedMidnight(todayKey),monthStart=zonedMidnight(monthKey+'-01'),last24Start=new Date(now.getTime()-86400000),window30Start=new Date(now.getTime()-30*86400000);
  const todaySql=sqliteUtc(todayStart),monthSql=sqliteUtc(monthStart),last24Sql=sqliteUtc(last24Start),window30Sql=sqliteUtc(window30Start);
  const [visitors,trackingMeta,sessions,commercial,affiliateByTool,affiliateWorkflowRows,distribution24,distributionStatuses,distributionLive,affiliateStatuses,affiliateRecoverable,trendRows,todayVisitorRows,externalTruth,trafficTruthAsset,sitemap,queue]=await Promise.all([
    safeFirst(env,`SELECT COUNT(DISTINCT visitor_id) sinceTracking,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) last24,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) today,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) monthToDate FROM visitor_events`,[last24Sql,todaySql,monthSql]),
    safeFirst(env,`SELECT value FROM visitor_tracking_meta WHERE key='tracking_started_at' LIMIT 1`),
    safeFirst(env,`SELECT COUNT(DISTINCT CASE WHEN f.created_at>=? THEN f.session_id END) last24,COUNT(DISTINCT CASE WHEN f.created_at>=? THEN f.session_id END) today,COUNT(DISTINCT CASE WHEN f.created_at>=? THEN f.session_id END) monthToDate,COUNT(DISTINCT CASE WHEN f.created_at>=? THEN f.session_id END) window30 FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE f.event_type='page_confirmed' AND s.classification IN ('likely-human','human')`,[last24Sql,todaySql,monthSql,window30Sql]),
    safeFirst(env,`SELECT COUNT(*) outbound,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized FROM verified_outbound_events WHERE created_at>=?`,[window30Sql]),
    safeAll(env,`SELECT tool_slug,COUNT(*) clicks,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized FROM verified_outbound_events WHERE created_at>=? GROUP BY tool_slug`,[window30Sql]),
    safeAll(env,`SELECT tool_slug,status,program_name,updated_at FROM affiliate_workflow`),
    safeFirst(env,`SELECT COUNT(*) events,SUM(CASE WHEN status IN ('success','completed','live','verified','submitted','ok') THEN 1 ELSE 0 END) successful,SUM(CASE WHEN status IN ('failed','error') THEN 1 ELSE 0 END) failed,MAX(COALESCE(observed_at,created_at)) last_activity_at FROM distribution_events WHERE created_at>=?`,[last24Sql]),
    safeAll(env,`SELECT status,COUNT(*) count FROM distribution_opportunities GROUP BY status`),
    safeAll(env,`SELECT surface_slug,surface_name,surface_type,status,COALESCE(live_url,action_url) url,distribution_score,updated_at FROM distribution_opportunities WHERE status IN ('live','verified') ORDER BY updated_at DESC LIMIT 8`),
    safeAll(env,`SELECT status,COUNT(*) count FROM affiliate_workflow GROUP BY status`),
    safeFirst(env,`SELECT COUNT(*) count FROM affiliate_workflow WHERE status IN ('ready_to_apply','human_action_required','approved_needs_link','link_acquired')`),
    safeAll(env,`SELECT f.session_id,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE f.event_type='page_confirmed' AND s.classification IN ('likely-human','human') AND f.created_at>=datetime('now','-31 days') ORDER BY f.created_at ASC`),
    safeAll(env,`SELECT visitor_id,path,source,referrer_host,created_at FROM visitor_events WHERE created_at>=? ORDER BY created_at ASC`,[todaySql]),
    assetJson(request,env,'/data/external-analytics-truth.json',{}),
    assetJson(request,env,'/data/traffic-truth.json',{}),
    assetText(request,env,'/sitemap.xml',''),
    lightweightQueue(request,env,ctx)
  ]);
  const [growthState,growthRnd,contactRoutes,autonomyEvents,humanEvents,placements,catalogRuntime,catalogCandidates,catalogGaps,newsCandidates]=await Promise.all([
    safeFirst(env,`SELECT COUNT(*) active,SUM(CASE WHEN subject_type='tool' THEN 1 ELSE 0 END) tools,SUM(CASE WHEN subject_type='surface' THEN 1 ELSE 0 END) surfaces,SUM(CASE WHEN subject_type='search' THEN 1 ELSE 0 END) search,SUM(CASE WHEN subject_type='affiliate' THEN 1 ELSE 0 END) affiliate,SUM(CASE WHEN subject_type LIKE 'catalog_%' THEN 1 ELSE 0 END) catalog,SUM(CASE WHEN subject_type='news_update' THEN 1 ELSE 0 END) news,MAX(last_evaluated_at) last_evaluated_at FROM growth_opportunity_state WHERE status='active'`),
    safeFirst(env,`SELECT COUNT(*) active,MAX(updated_at) last_evaluated_at FROM growth_rnd_experiments WHERE status='active'`),
    safeFirst(env,`SELECT COUNT(*) routes,COUNT(DISTINCT surface_slug) surfaces FROM distribution_contact_routes WHERE status='discovered'`),
    safeFirst(env,`SELECT COUNT(*) n FROM distribution_events WHERE created_at>=datetime('now','-7 days') AND status IN ('completed','verified','live','submitted') AND event_type NOT IN ('human_gate_resolved','editorial_human_resolved')`),
    safeFirst(env,`SELECT COUNT(*) n FROM distribution_events WHERE created_at>=datetime('now','-7 days') AND event_type IN ('human_gate_resolved','editorial_human_resolved')`),
    safeFirst(env,`SELECT COUNT(*) placements,COALESCE(SUM(backlink_verified),0) backlinks FROM distribution_placements WHERE placement_verified=1`),
    safeFirst(env,`SELECT COUNT(*) total,SUM(CASE WHEN quality_status='healthy' THEN 1 ELSE 0 END) healthy,SUM(CASE WHEN quality_status='change_detected' THEN 1 ELSE 0 END) changed,SUM(CASE WHEN quality_status='confirmed_broken' THEN 1 ELSE 0 END) suppressed,SUM(CASE WHEN source_status NOT IN ('ok','broken') THEN 1 ELSE 0 END) warnings,MAX(last_checked_at) last_checked_at FROM catalog_runtime_state`),
    safeFirst(env,`SELECT COUNT(*) total,MAX(verified_at) last_admitted_at FROM catalog_runtime_candidates WHERE status='admitted_coverage'`),
    safeFirst(env,`SELECT COUNT(*) total FROM catalog_market_gaps WHERE status='research_required'`),
    safeFirst(env,`SELECT COUNT(*) total,MAX(updated_at) last_candidate_at FROM software_news_candidates WHERE status IN ('candidate','verified','published')`)
  ]);
  const trackingSince=parseSqliteUtc(trackingMeta?.value),trackingDay=trackingSince?zonedDayKey(trackingSince):todayKey;
  const coverage={last24Complete:Boolean(trackingSince&&trackingSince.getTime()<=now.getTime()-86400000),todayComplete:Boolean(trackingSince&&trackingDay<todayKey),monthToDateComplete:Boolean(trackingSince&&trackingDay.slice(0,7)<monthKey)};
  const dayOfMonth=Number(todayKey.slice(8,10))||1,daysInMonth=daysInMonthForKey(todayKey),mtdSessions=n(sessions?.monthToDate),dailyAverageMTD=mtdSessions/dayOfMonth,projectedMonth=Math.round(dailyAverageMTD*daysInMonth);
  const outbound=n(commercial?.outbound),monetized=n(commercial?.monetized),unmonetized=Math.max(0,outbound-monetized),weightedCoverage=outbound?monetized/outbound:null;
  const affiliateStatusCounts=stateCounts(affiliateStatuses),distributionStatusCounts=stateCounts(distributionStatuses);
  const verifiedByTool=new Map((affiliateByTool||[]).map(x=>[String(x.tool_slug||''),{clicks:n(x.clicks),monetized:n(x.monetized)}]));
  const affiliateGroups={active:[],pending:[],rejected:[]};
  const activeStates=new Set(['active','verified','earning','link_acquired']);
  const pendingStates=new Set(['research_required','program_exists','ready_to_apply','human_action_required','submitted','pending_review','approved_needs_link','blocked','paused','watchlist']);
  const rejectedStates=new Set(['rejected','no_program_found']);
  for(const row of affiliateWorkflowRows||[]){
    const status=String(row.status||''),slug=String(row.tool_slug||'');if(!slug)continue;
    const group=activeStates.has(status)?'active':pendingStates.has(status)?'pending':rejectedStates.has(status)?'rejected':null;if(!group)continue;
    const t=verifiedByTool.get(slug)||{clicks:0,monetized:0};
    affiliateGroups[group].push({slug,name:row.program_name||slug,status,clicks30d:t.clicks,monetizedClicks30d:t.monetized});
  }
  const summarizeAffiliate=items=>({count:items.length,clicks30d:items.reduce((s,x)=>s+n(x.clicks30d),0),monetizedClicks30d:items.reduce((s,x)=>s+n(x.monetizedClicks30d),0),items:items.sort((a,b)=>b.monetizedClicks30d-a.monetizedClicks30d||b.clicks30d-a.clicks30d||a.name.localeCompare(b.name))});
  const affiliateCoverageStatus={status:'observed',windowDays:30,trafficTruth:'first_party_verified_navigation',clickDefinition:'First-party verified /go/ outbound navigation only. Pre-integrity clicks are diagnostic only.',humanOutbound30d:outbound,monetizedOutbound30d:monetized,unmonetizedOutbound30d:unmonetized,weightedCoverage,active:summarizeAffiliate(affiliateGroups.active),pending:summarizeAffiliate(affiliateGroups.pending),rejected:summarizeAffiliate(affiliateGroups.rejected)};
  const trendMap=new Map();
  for(const row of trendRows){const at=parseSqliteUtc(row.created_at),id=String(row.session_id||'');if(!at||!id)continue;const day=zonedDayKey(at);if(!trendMap.has(day))trendMap.set(day,new Set());trendMap.get(day).add(id)}
  const points=[];for(let i=29;i>=0;i--){const d=new Date(now.getTime()-i*86400000),day=zonedDayKey(d);points.push({day,sessions:trendMap.get(day)?.size||0})}
  const discoveryToday=firstTouchBuckets(todayVisitorRows);
  const gsc=externalTruth?.gsc||trafficTruthAsset?.googleSearchConsole||{};
  const ga4=externalTruth?.ga4||{};
  const sitemapUrls=(sitemap.match(/<loc>/g)||[]).length;
  const indexedPages=n(trafficTruthAsset?.googleSearchConsole?.pageCount);
  const distLiveCount=n(distributionStatusCounts.live)+n(distributionStatusCounts.verified);
  const distPending=n(distributionStatusCounts.submitted)+n(distributionStatusCounts.pending_review)+n(distributionStatusCounts.scheduled);
  const tracking={status:'observed',humanSessionsLast24Hours:n(sessions?.last24)};
  const visitorSnapshot={status:'observed',metric:'unique anonymous browser visitors',definition:'One first-party anonymous browser identifier counted once per reporting window. Sessions remain a separate behavior metric.',timezone:TIME_ZONE,trackingSince:trackingSince?.toISOString()||null,last24:n(visitors?.last24),today:n(visitors?.today),monthToDate:n(visitors?.monthToDate),sinceTracking:n(visitors?.sinceTracking),coverage};
  const traffic={today:n(sessions?.today),monthToDate:mtdSessions,dailyAverageMTD,projectedMonth};
  const canonicalCommercialTruth={status:'observed',source:'D1 verified_outbound_events',trafficTruth:'first_party_verified_navigation',windowDays:30,definition:'Outbound is counted only after first-party same-origin /go/ navigation proof from an established ToolScout browser session. Pre-integrity browser-confirmed clicks are diagnostic only and excluded.',humanOutbound:outbound,monetizedOutbound:monetized,unmonetizedOutbound:unmonetized,weightedCoverage,generatedAt:now.toISOString()};
  const distributionEngine={status:'running',last_activity_at:distribution24?.last_activity_at||null,events_24h:n(distribution24?.events),successful_24h:n(distribution24?.successful),failed_24h:n(distribution24?.failed),events_7d:0,successful_7d:0,failed_7d:0,opportunity_status:distributionStatusCounts,delivery_status:{},attributed_human_sessions_30d:0,attributed_outbound_30d:0,attributed_monetized_outbound_30d:0};
  const affiliateEngine={status:'running',last_run_at:null,traffic_truth:'first_party_verified_navigation',human_outbound_30d:outbound,monetized_outbound_30d:monetized,unmonetized_outbound_30d:unmonetized,weighted_coverage_pct:weightedCoverage==null?null:weightedCoverage*100,coverage_change_7d_pp:null,recoverable_queue:n(affiliateRecoverable?.count),workflow_status:affiliateStatusCounts,discovery:{total:0,qualified:0,human:0,last_checked:null}};
  const autonomousActions=n(autonomyEvents?.n),humanInterventions=n(humanEvents?.n),autonomyDenominator=autonomousActions+humanInterventions;
  const autonomousGrowth={
    status:'observed',
    window_days:30,
    active_opportunities:n(growthState?.active),
    tool_opportunities:n(growthState?.tools),
    surface_opportunities:n(growthState?.surfaces),
    affiliate_opportunities:n(growthState?.affiliate),
    catalog_opportunities:n(growthState?.catalog),
    news_opportunities:n(growthState?.news),
    search_opportunities:n(growthState?.search),
    rnd_experiments:n(growthRnd?.active),
    rnd_last_evaluated_at:growthRnd?.last_evaluated_at||null,
    last_evaluated_at:growthState?.last_evaluated_at||null,
    autonomous_actions_7d:autonomousActions,
    human_interventions_7d:humanInterventions,
    autonomy_rate_pct:autonomyDenominator?Number((autonomousActions/autonomyDenominator*100).toFixed(1)):0,
    chairman_queue:n(queue?.total),
    contact_routes:n(contactRoutes?.routes),
    contact_route_surfaces:n(contactRoutes?.surfaces),
    verified_placements:n(placements?.placements),
    verified_backlinks:n(placements?.backlinks),
    prepared_growth_actions_30d:0,
    attributed_growth_actions_30d:0,
    attributed_human_sessions_30d:0,
    attributed_outbound_30d:0,
    attributed_monetized_outbound_30d:0,
    attribution_rule:'Resilient mode reports only directly available D1 evidence. Missing action-attribution enrichment is shown as zero, never inferred.'
  };
  const catalogEngine={
    version:'1.1',
    status:catalogRuntime?.last_checked_at?'running':'awaiting_runtime_evidence',
    tools:n(catalogRuntime?.total)+n(catalogCandidates?.total),
    source_healthy:n(catalogRuntime?.healthy),
    source_warnings:n(catalogRuntime?.warnings),
    coverage_gaps:n(catalogGaps?.total),
    content_changes:n(catalogRuntime?.changed),
    quarantined:n(catalogRuntime?.suppressed),
    profile_holds:0,
    runtime_candidates:n(catalogCandidates?.total),
    active_opportunities:n(growthState?.catalog),
    report_age_days:catalogRuntime?.last_checked_at?Math.max(0,Math.floor((Date.now()-parseSqliteUtc(catalogRuntime.last_checked_at).getTime())/86400000)):null,
    freshness_target_days:7,
    freshness_status:catalogRuntime?.last_checked_at?'runtime observed':'awaiting runtime evidence',
    last_runtime_check:catalogRuntime?.last_checked_at||null,
    last_runtime_admission:catalogCandidates?.last_admitted_at||null,
    whats_new_candidates:n(newsCandidates?.total),
    rule:'Resilient mode reads Catalog Runtime directly from D1. Official-source quality gates remain authoritative and affiliate economics never affect editorial ranking.'
  };
  const healthIssues=[{engine:'command-center',severity:'warning',title:'Resilient snapshot active',detail:'Dashboard reads are isolated from external link verification and non-critical enrichment. This prevents a third-party or enrichment failure from returning HTTP 503.'}];
  if(queue.status!=='connected')healthIssues.push({engine:'chairman-queue',severity:'warning',title:'Human-action queue partially unavailable',detail:queue.reason||'Queue source did not return a complete snapshot.'});
  return {
    visitors:visitorSnapshot,
    tracking,
    traffic,
    funnel:{sessions:n(sessions?.window30),outboundClicks:outbound,sessionToOutboundCtr:n(sessions?.window30)?outbound/n(sessions?.window30)*100:0},
    commercial:{monetizedOutbound:monetized,totals:{outbound,monetizedOutbound:monetized},revenueGaps:[],trafficDefinition:canonicalCommercialTruth.definition},
    affiliateCoverage:{humanOutboundClicks:outbound,monetizedLikelyHumanClicks:monetized,unmonetizedLikelyHumanClicks:unmonetized,weightedCoverage,trafficTruth:'first_party_verified_navigation'},
    affiliateCoverageStatus,
    canonicalCommercialTruth,
    revenue:{confirmedRevenue:null,currency:'EUR',reportingStatus:'unavailable',ledgerRows:0},
    trafficTruth:{status:'observed',primaryMetric:'D1 exact visitors plus first-party verified outbound navigation',d1:{status:'observed',metric:'browser-confirmed sessions',last24:n(sessions?.last24),today:n(sessions?.today),monthToDate:mtdSessions,dailyAverageMTD,projectedMonth,humanOutbound:outbound,monetizedOutbound:monetized,unmonetizedOutbound:unmonetized,weightedCoverage,commercialTruth:'first_party_verified_navigation',commercialDefinition:canonicalCommercialTruth.definition},ga4,googleSearchConsole:{status:gsc.status||'observed',generatedAt:externalTruth?.generatedAt||trafficTruthAsset?.googleSearchConsole?.generatedAt||null,startDate:gsc.startDate||null,endDate:gsc.endDate||null,clicks:n(gsc.clicks),impressions:n(gsc.impressions),pageCount:indexedPages,coverage:'site-wide'}},
    trafficTrend:{status:'observed',metric:'browser-confirmed sessions',windowDays:30,points,generatedAt:now.toISOString()},
    discoveryAttribution:{status:'observed',timezone:TIME_ZONE,definition:'Known sources use referrer or campaign evidence. Unattributed deep entry means direct first entry on a non-home page and is not a proven channel.',today:discoveryToday,last24:{total:0,buckets:[]},generatedAt:now.toISOString()},
    growthOps:{chairmanQueue:queue,autonomousGrowth,engines:{affiliate:affiliateEngine,catalog:catalogEngine,distribution:distributionEngine},footprint:{search:{source:'Google Search Console',observed_pages:indexedPages,impressions:n(gsc.impressions),clicks:n(gsc.clicks),generated_at:externalTruth?.generatedAt||null,sitemap_urls:sitemapUrls,note:'Observed pages are URLs with Search Console evidence from the latest imported snapshot; this is not a complete Google index count.'},distribution:{live_verified:distLiveCount,submitted_pending:distPending,human_gates:n(distributionStatusCounts.human_action_required),surfaces:distributionLive.map(x=>({slug:x.surface_slug,name:x.surface_name,type:x.surface_type,status:x.status,url:x.url||null,score:n(x.distribution_score),updated_at:x.updated_at||null}))}},ledger:[],health:{content:{status:'no_evidence',last_event_at:null,detail:'Non-critical content enrichment is excluded from resilient dashboard reads.'},audience:{status:'no_evidence',last_event_at:null,detail:'Non-critical audience enrichment is excluded from resilient dashboard reads.'},seo_geo_aio:{status:gsc.status==='observed'?'partial':'no_evidence',last_event_at:externalTruth?.generatedAt||null,detail:`GSC snapshot: ${n(gsc.impressions)} impressions, ${n(gsc.clicks)} clicks. Heavy readiness enrichment is isolated from the dashboard read path.`},issues:healthIssues},generated_at:now.toISOString()},
    resilientCommandCenter:{active:true,version:2,generatedAt:now.toISOString(),reason:'isolate_dashboard_reads_from_resource_exhaustion',autonomousGrowthIncluded:true,catalogGrowthIncluded:true}
  };
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-resilient-health'){const editorial=await editorialQueueRows(env);const stremit=editorial.find(x=>x.target_name==='Stremit')||null;return Response.json({ok:true,service:'toolscout-command-center-resilient',version:5,statsMode:'direct-d1-resilient',externalLinkVerificationInStats:false,affiliateCanonicalTruth:'verified-outbound-v1',autonomousGrowthIncluded:true,catalogGrowthIncluded:true,chairmanPayloadVersion:'chairman-editorial-v3',preparedEditorialCount:editorial.length,stremitPayloadPresent:Boolean(stremit&&stremit.suggested_title&&stremit.suggested_body&&stremit.target_url)},{headers:PUBLIC_H})}
    if(request.method==='GET'&&(url.pathname==='/analytics/api/stats'||url.pathname==='/analytics/api/chairman-queue')){
      if(!(await validSession(request,env)))return Response.json({error:'command_center_session_expired'},{status:401,headers:JSON_H});
      if(url.pathname==='/analytics/api/chairman-queue')return Response.json(await lightweightQueue(request,env,ctx),{headers:JSON_H});
      try{return Response.json(await resilientSnapshot(request,env,ctx),{headers:JSON_H})}
      catch(error){return Response.json({error:'resilient_snapshot_failed',message:String(error?.message||error)},{status:500,headers:JSON_H})}
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
