import base from './affiliate-human-action-entry-worker.js';
import { normalizeAffiliateState } from './affiliate-operations.js';
import { growthActionMetrics } from './distribution-impact-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const OWNER_EMAIL='pcaiano@gmail.com';
const HUMAN_ACTION_LIMIT=12;
const ACTIVE_AFFILIATE_STATES=new Set(['active','verified','earning']);
const PENDING_AFFILIATE_STATES=new Set(['submitted','pending_review']);
const REJECTED_AFFILIATE_STATES=new Set(['rejected']);

function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/analytics-v2'||path==='/analytics-v2/'||path==='/analytics-v2.html'}
async function digestHex(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
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
async function accessAuthenticated(request,ctx){
  const email=request.headers.get('Cf-Access-Authenticated-User-Email')||request.headers.get('cf-access-authenticated-user-email')||'';
  if(String(email).toLowerCase()===OWNER_EMAIL)return true;
  try{
    if(!ctx?.access)return false;
    const identity=await ctx.access.getIdentity();
    return String(identity?.email||'').toLowerCase()===OWNER_EMAIL;
  }catch{return false}
}
function safeUrl(value){
  try{
    const u=new URL(String(value||''));
    if(u.protocol!=='https:')return null;
    const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if(h==='localhost'||h==='0.0.0.0'||h==='127.0.0.1'||h==='::1'||h.endsWith('.localhost')||h.endsWith('.local')||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;
    return u.toString();
  }catch{return null}
}
async function safeAll(env,sql){
  try{return (await env.DB.prepare(sql).all()).results||[]}catch{return []}
}
async function safeFirst(env,sql){
  try{return await env.DB.prepare(sql).first()}catch{return null}
}
async function assetJson(request,env,path,fallback){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}
}
async function assetText(request,env,path,fallback=''){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.text():fallback}catch{return fallback}
}
function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function timeMs(value){const t=Date.parse(String(value||'').replace(' ','T')+(String(value||'').includes('T')?'':'Z'));return Number.isFinite(t)?t:0}
function workflowCounts(rows){const out={};for(const row of rows){const k=String(row.status||'unknown');out[k]=(out[k]||0)+n(row.count)}return out}
function hoursSince(value){const t=timeMs(value);return t?Math.max(0,(Date.now()-t)/3600000):null}
function freshWithin(value,hours){const age=hoursSince(value);return age!==null&&age<=hours}
function estimateMinutes(action){
  if(action.engine==='affiliate'){
    if(action.status==='approved_needs_link')return 2;
    if(action.status==='ready_to_apply')return 5;
    return 4;
  }
  if(/hacker-news|indie-hackers/i.test(action.id||''))return 8;
  if(/captcha|account|login|sign in/i.test(action.reason||''))return 4;
  return 5;
}
function expectedImpact(action){
  if(action.engine==='affiliate'){
    const clicks=n(action.metric);
    return clicks>0?`Recover monetization on ${clicks} browser-confirmed unmonetized outbound click${clicks===1?'':'s'} / 30d`:'Expand monetized affiliate coverage';
  }
  const score=n(action.metric);
  return score?`Distribution opportunity score ${Math.round(score)}/100`:'Unlock a blocked distribution surface';
}
function afterAction(action){
  if(action.engine==='affiliate'){
    if(action.status==='approved_needs_link')return 'Affiliate engine records the link-acquisition state; production activation remains gated until the verified referral URL is in the canonical affiliate registry.';
    return 'Affiliate engine removes the task, monitors the existing application/review state and waits for evidence-backed approval or rejection.';
  }
  return 'Distribution engine removes the human gate, records the submission event and resumes monitoring, attribution and automatic public verification where a machine-verifiable route exists.';
}
function effectiveAffiliateStatus({active,pipelineRow,workflowRow}){
  const persisted=normalizeAffiliateState(workflowRow?.status);
  if(active)return ACTIVE_AFFILIATE_STATES.has(persisted)?persisted:'active';
  if(!pipelineRow&&!workflowRow)return 'research_required';
  const pipelineState=normalizeAffiliateState(pipelineRow?.status);
  if(!workflowRow)return pipelineState;
  if(!pipelineRow)return persisted;
  const rank={research_required:0,program_exists:1,ready_to_apply:2,human_action_required:3,submitted:4,pending_review:4,blocked:5,rejected:5,paused:5,no_program_found:5,approved_needs_link:6,link_acquired:7,active:8,verified:9,earning:10};
  const pr=rank[pipelineState]||0,wr=rank[persisted]||0;
  if(pr!==wr)return pr>wr?pipelineState:persisted;
  return timeMs(pipelineRow?.last_verified)>timeMs(workflowRow?.updated_at)?pipelineState:persisted;
}
async function affiliateCoverageStatusSnapshot(request,env){
  try{
    const [tools,pipeline,affiliate,workflowRows,clickRows]=await Promise.all([
      assetJson(request,env,'/data/tools.json',[]),
      assetJson(request,env,'/data/affiliate-pipeline.json',{verified_programs:[]}),
      assetJson(request,env,'/data/affiliate.json',{}),
      safeAll(env,`SELECT tool_slug,status,updated_at FROM affiliate_workflow`),
      safeAll(env,`SELECT c.tool_slug,COUNT(*) clicks FROM click_events c JOIN sessions s ON s.session_id=c.session_id WHERE c.created_at>=datetime('now','-30 days') AND s.classification IN ('likely-human','human') AND c.source NOT IN ('internal-test','synthetic','health-check','ci') AND EXISTS (SELECT 1 FROM funnel_events f WHERE f.session_id=c.session_id AND f.event_type='page_confirmed') GROUP BY c.tool_slug`)
    ]);
    const pipelineMap=new Map((pipeline?.verified_programs||[]).map(x=>[x.slug,x]));
    const workflowMap=new Map(workflowRows.map(x=>[x.tool_slug,x]));
    const clickMap=new Map(clickRows.map(x=>[x.tool_slug,n(x.clicks)]));
    const groups={active:[],pending:[],rejected:[]};
    for(const tool of tools||[]){
      const route=affiliate?.[tool.slug]||{};
      const active=Boolean(route.enabled&&route.url);
      const status=effectiveAffiliateStatus({active,pipelineRow:pipelineMap.get(tool.slug)||null,workflowRow:workflowMap.get(tool.slug)||null});
      let group=null;
      if(ACTIVE_AFFILIATE_STATES.has(status))group='active';
      else if(PENDING_AFFILIATE_STATES.has(status))group='pending';
      else if(REJECTED_AFFILIATE_STATES.has(status))group='rejected';
      if(!group)continue;
      groups[group].push({slug:tool.slug,name:tool.name||tool.slug,status,clicks30d:clickMap.get(tool.slug)||0});
    }
    for(const items of Object.values(groups))items.sort((a,b)=>b.clicks30d-a.clicks30d||a.name.localeCompare(b.name));
    const summarize=items=>({count:items.length,clicks30d:items.reduce((s,x)=>s+n(x.clicks30d),0),items});
    return {status:'observed',windowDays:30,clickDefinition:'Browser-confirmed outbound clicks only; internal and synthetic traffic excluded.',active:summarize(groups.active),pending:summarize(groups.pending),rejected:summarize(groups.rejected)};
  }catch(e){return {status:'unavailable',reason:String(e?.message||e)}}
}
function affiliateCoverageWidget(){return `<section class="widget" data-widget="affiliate-status" style="--w:12;--h:6"><div class="widgetHead"><div><div class="widgetKicker">Affiliate · status · clicks</div><div class="widgetTitle">Affiliate Coverage Status</div></div><div class="widgetMeta">Browser-confirmed clicks · 30d</div></div><div class="widgetBody" id="affiliateCoverageStatusBody"><div class="empty">Refresh to load affiliate status.</div></div><div class="resizeHandle"></div></section>`}
function autonomousGrowthWidget(){return `<section class="widget" data-widget="autonomous-growth" style="--w:12;--h:6"><div class="widgetHead"><div><div class="widgetKicker">Growth · autonomous loop</div><div class="widgetTitle">Autonomous Growth</div></div><div class="widgetMeta">Discovery → action → verified human impact</div></div><div class="widgetBody" id="autonomousGrowthBody"><div class="empty">Refresh to load autonomous growth.</div></div><div class="resizeHandle"></div></section>`}
function catalogGrowthWidget(){return `<section class="widget" data-widget="catalog-growth" style="--w:6;--h:5"><div class="widgetHead"><div><div class="widgetKicker">Catalog · factual quality · coverage</div><div class="widgetTitle">Catalog Growth & Quality</div></div><div class="widgetMeta" id="catalogGrowthMeta">Shared growth brain</div></div><div class="widgetBody" id="catalogGrowthBody"><div class="empty">Refresh to load catalog state.</div></div><div class="resizeHandle"></div></section>`}
function catalogGrowthScript(){return `<script data-catalog-growth-renderer="v1">(function(){const n=v=>Number(v||0).toLocaleString(),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));function draw(d){const root=document.getElementById('catalogGrowthBody'),meta=document.getElementById('catalogGrowthMeta'),x=d?.growthOps?.engines?.catalog;if(!root)return;if(!x){root.innerHTML='<div class="empty">Catalog growth evidence unavailable.</div>';return}if(meta)meta.textContent=x.report_age_days==null?'Shared growth brain':'Evidence '+n(x.report_age_days)+'d old';root.innerHTML='<div class="metricGrid">'+
metric('Catalog tools',n(x.tools),'Current catalog')+
metric('Source healthy',n(x.source_healthy),n(x.source_warnings)+' warnings')+
metric('Coverage gaps',n(x.coverage_gaps),n(x.active_opportunities)+' active growth/quality opportunities')+
metric('Changed sources',n(x.content_changes),n(x.quarantined)+' quarantined')+
metric('Profiles held',n(x.profile_holds),'Evidence gates')+
metric('Freshness target',n(x.freshness_target_days)+'d',x.freshness_status)+
'</div><div class="note" style="margin-top:10px">'+esc(x.rule||'')+'</div>'}const original=window.render;if(typeof original==='function')window.render=function(d){original(d);draw(d)}})();</script>`}
function autonomousGrowthScript(){return `<script>(function(){const n=v=>Number(v||0).toLocaleString(),p=v=>Number(v||0).toFixed(0)+'%',esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));function renderAutonomousGrowth(d){const r=document.getElementById('autonomousGrowthBody');if(!r)return;const x=d?.growthOps?.autonomousGrowth;if(!x||x.status!=='observed'){r.innerHTML='<div class="empty">Autonomous growth evidence is unavailable.</div>';return}r.innerHTML='<div class="grid4">'+
'<div class="metric"><small>Active opportunities</small><b>'+n(x.active_opportunities)+'</b><span>'+n(x.tool_opportunities)+' tool · '+n(x.surface_opportunities)+' surface · '+n(x.affiliate_opportunities)+' affiliate · '+n(x.catalog_opportunities)+' catalog · '+n(x.search_opportunities)+' search</span></div>'+
'<div class="metric"><small>Autonomous actions · 7d</small><b>'+n(x.autonomous_actions_7d)+'</b><span>'+p(x.autonomy_rate_pct)+' autonomous vs resolved human gates</span></div>'+
'<div class="metric"><small>Attributed sessions · 30d</small><b>'+n(x.attributed_human_sessions_30d)+'</b><span>'+n(x.attributed_outbound_30d)+' outbound · '+n(x.attributed_monetized_outbound_30d)+' monetized</span></div>'+
'<div class="metric"><small>External proof</small><b>'+n(x.verified_placements)+'</b><span>'+n(x.verified_backlinks)+' backlinks · '+n(x.contact_routes)+' alternate routes</span></div></div>'+
'<div class="row" style="margin-top:10px"><div><div class="rowName">Chairman Queue</div><div class="rowMeta">Human intervention should trend down as machine-resolvable routes are learned.</div></div><div class="value">'+n(x.chairman_queue)+'</div></div>'+
'<div class="meta" style="margin-top:8px">'+esc(x.attribution_rule||'')+'</div>'}const original=window.render;if(typeof original==='function')window.render=function(d){original(d);renderAutonomousGrowth(d)}})();</script>`}
function affiliateCoverageScript(){return `<style>.affiliateStatusTable{width:100%;border-collapse:collapse;font-size:12px}.affiliateStatusTable th,.affiliateStatusTable td{padding:9px 8px;border-top:1px solid var(--line);text-align:left}.affiliateStatusTable thead th{border-top:0;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.affiliateStatusTable th:last-child,.affiliateStatusTable td:last-child{text-align:right}.affiliateStatusSummary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}</style><script>(function(){const e=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m])),nn=v=>Number(v||0).toLocaleString(),sl=v=>String(v||'').replaceAll('_',' ');function rg(g,label){return(Array.isArray(g?.items)?g.items:[]).map(x=>({name:x.name,status:x.status||label,clicks:x.clicks30d||0,group:label}))}function renderAffiliateCoverageStatus(d){const root=document.getElementById('affiliateCoverageStatusBody');if(!root)return;const s=d?.affiliateCoverageStatus||{};if(s.status!=='observed'){root.innerHTML='<div class="empty">Affiliate coverage status is temporarily unavailable.</div>';return}const order={active:0,pending:1,rejected:2};const rows=[...rg(s.active,'active'),...rg(s.pending,'pending'),...rg(s.rejected,'rejected')].sort((a,b)=>order[a.group]-order[b.group]||b.clicks-a.clicks||a.name.localeCompare(b.name));const summary='<div class="affiliateStatusSummary"><span class="pill good">Active '+nn(s.active?.count)+' · '+nn(s.active?.clicks30d)+' clicks</span><span class="pill info">Pending '+nn(s.pending?.count)+' · '+nn(s.pending?.clicks30d)+' clicks</span><span class="pill bad">Rejected '+nn(s.rejected?.count)+' · '+nn(s.rejected?.clicks30d)+' clicks</span></div>';const table=rows.length?'<table class="affiliateStatusTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Clicks</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+e(x.name)+'</td><td>'+e(sl(x.status))+'</td><td>'+nn(x.clicks)+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">No active, pending or rejected affiliate programmes found.</div>';root.innerHTML=summary+table}const original=window.render;if(typeof original==='function')window.render=function(d){original(d);renderAffiliateCoverageStatus(d)}})();</script>`}
async function verifyActionUrl(url){
  const safe=safeUrl(url);
  const checkedAt=new Date().toISOString();
  if(!safe)return {ok:false,http_status:null,checked_at:checkedAt,reason:'invalid_https_url',failure_scope:'internal'};
  const reachableStatus=status=>(status>=200&&status<400)||(status>=400&&status<500&&status!==404&&status!==410);
  try{
    const head=await fetch(safe,{method:'HEAD',redirect:'manual',headers:{'User-Agent':'ToolScout-Chairman-Queue/2.0'},signal:AbortSignal.timeout(3500)});
    const headStatus=n(head.status);
    if(reachableStatus(headStatus))return {ok:true,http_status:headStatus,checked_at:checkedAt,reason:null,method:'HEAD',failure_scope:null};
  }catch{}
  try{
    const get=await fetch(safe,{method:'GET',redirect:'manual',headers:{'User-Agent':'ToolScout-Chairman-Queue/2.0','Accept':'text/html,application/xhtml+xml','Range':'bytes=0-0'},signal:AbortSignal.timeout(5000)});
    const getStatus=n(get.status);
    if(reachableStatus(getStatus))return {ok:true,http_status:getStatus||null,checked_at:checkedAt,reason:null,method:'GET_fallback',failure_scope:null};
    const reason=(getStatus===404||getStatus===410)?'remote_url_not_found':(getStatus>=500?'remote_5xx_after_get_fallback':'remote_verification_unavailable');
    return {ok:false,http_status:getStatus||null,checked_at:checkedAt,reason,method:'GET_fallback',failure_scope:'external'};
  }catch{return {ok:false,http_status:null,checked_at:checkedAt,reason:'head_and_get_verification_failed',method:'GET_fallback',failure_scope:'external'}}
}
async function baseHumanActions(request,env,ctx){
  try{
    const u=new URL('/analytics/api/human-actions',request.url);
    const r=await base.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env,ctx);
    if(!r.ok)return {affiliate:[],distribution:[]};
    return await r.json();
  }catch{return {affiliate:[],distribution:[]}}
}
async function chairmanQueue(request,env,ctx,{verifyLinks=true}={}){
  const raw=await baseHumanActions(request,env,ctx);
  const editorialRows=await safeAll(env,`SELECT queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,created_at,updated_at FROM distribution_editorial_queue WHERE human_required=1 AND status='prepared' AND target_url IS NOT NULL ORDER BY CASE WHEN target_name='Stremit' THEN 0 ELSE 1 END,updated_at DESC LIMIT 20`);
  const editorial=editorialRows.map(row=>{
    const target=String(row.target_name||'Community');
    const publicationType=row.channel_type==='community_stack'?'Stack':'Post';
    const isStremit=target==='Stremit';
    const instructions=isStremit&&publicationType==='Stack'
      ?'Open the New stack page. Paste the prepared title. Paste the prepared description. Add ToolScout, ChatGPT, Make and GitHub in that order. Use each Role line in the prepared content as the use case for that tool. Review the stack, then publish it. Do not buy promotion.'
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
  });
  const input=[...(raw.affiliate||[]),...(raw.distribution||[]),...editorial];
  const rows=await Promise.all(input.map(async action=>{
    const minutes=action.editorial_queue_id?6:estimateMinutes(action);
    const verification=verifyLinks?await verifyActionUrl(action.action_url):{ok:Boolean(safeUrl(action.action_url)),http_status:null,checked_at:null,reason:null};
    const impactScore=action.engine==='affiliate'?(n(action.metric)*20+40):n(action.metric);
    const whyHuman=action.editorial_queue_id?'Publication requires an authenticated community account and a human review of the final public post or stack.':(action.reason||'This step requires owner authentication, judgement or irreversible third-party action.');
    const after=action.editorial_queue_id?'Mark it published in the Chairman Queue. The Distribution Engine removes the task and continues attribution and performance measurement for the Stremit surface.':afterAction(action);
    return {...action,estimated_minutes:minutes,expected_impact:expectedImpact(action),expected_impact_score:Number(impactScore.toFixed(1)),why_human:whyHuman,after_action:after,link_verification:verification};
  }));
  const actionable=rows.filter(x=>x.link_verification?.ok).sort((a,b)=>(b.expected_impact_score/Math.max(1,b.estimated_minutes))-(a.expected_impact_score/Math.max(1,a.estimated_minutes))).slice(0,HUMAN_ACTION_LIMIT);
  const brokenLinks=rows.filter(x=>!x.link_verification?.ok&&x.link_verification?.failure_scope==='internal');
  const externalVerificationIssues=rows.filter(x=>!x.link_verification?.ok&&x.link_verification?.failure_scope==='external');
  return {status:'connected',total:actionable.length,estimated_minutes:actionable.reduce((sum,x)=>sum+n(x.estimated_minutes),0),items:actionable,broken_links:brokenLinks,external_verification_issues:externalVerificationIssues,rule:'Only current engine states with a reachable HTTPS action URL enter the Chairman Queue. Prepared community publication tasks include the exact payload needed to complete the human action.'};
}
async function growthOpsSnapshot(request,env,ctx,stats){
  const [affiliateLatest,affiliateWeekOld,affiliateStatuses,affiliateDiscovery,affiliatePacks,affiliateRoutes,distributionStatuses,distribution24,distribution7,deliveryStates,distEvents,affiliateHistory,gsc,sitemap,contentIntel,organicGrowth,aeoGeo,machineReadability,catalogFreshness,catalogHealth,toolProfileHolds,catalogRuntimeState,catalogRuntimeCandidates,catalogRuntimeGaps,latestAudienceEvent,latestContentPublish,distributionNetworkStates,distributionPlacements]=await Promise.all([
    safeFirst(env,`SELECT human_outbound_clicks,monetized_human_outbound_clicks,unmonetized_human_outbound_clicks,weighted_coverage,queue_size,traffic_truth,created_at FROM affiliate_coverage_runs WHERE traffic_truth='browser_confirmed' ORDER BY created_at DESC LIMIT 1`),
    safeFirst(env,`SELECT human_outbound_clicks,monetized_human_outbound_clicks,unmonetized_human_outbound_clicks,weighted_coverage,queue_size,traffic_truth,created_at FROM affiliate_coverage_runs WHERE traffic_truth='browser_confirmed' AND created_at<=datetime('now','-7 days') ORDER BY created_at DESC LIMIT 1`),
    safeAll(env,`SELECT status,COUNT(*) count FROM affiliate_workflow GROUP BY status ORDER BY count DESC`),
    safeFirst(env,`SELECT COUNT(*) total,SUM(CASE WHEN status!='research_required' THEN 1 ELSE 0 END) qualified,SUM(CASE WHEN automation_mode='human' THEN 1 ELSE 0 END) human,MAX(last_checked) last_checked FROM affiliate_program_discovery`),
    safeFirst(env,`SELECT COUNT(*) total,SUM(CASE WHEN status='prepared' THEN 1 ELSE 0 END) prepared,MAX(prepared_at) last_prepared_at FROM affiliate_application_packs`),
    safeFirst(env,`SELECT COUNT(*) total,SUM(CASE WHEN production_status='verified' THEN 1 ELSE 0 END) verified,SUM(CASE WHEN external_status='failed' OR production_status='failed' THEN 1 ELSE 0 END) failed,MAX(verified_at) last_verified_at FROM affiliate_route_verification`),
    safeAll(env,`SELECT status,COUNT(*) count FROM distribution_opportunities GROUP BY status ORDER BY count DESC`),
    safeFirst(env,`SELECT COUNT(*) events,SUM(CASE WHEN status IN ('completed','verified','live','submitted') THEN 1 ELSE 0 END) successful,SUM(CASE WHEN status IN ('failed','error','rejected') THEN 1 ELSE 0 END) failed,MAX(created_at) last_event_at FROM distribution_events WHERE created_at>=datetime('now','-24 hours')`),
    safeFirst(env,`SELECT COUNT(*) events,SUM(CASE WHEN status IN ('completed','verified','live','submitted') THEN 1 ELSE 0 END) successful,SUM(CASE WHEN status IN ('failed','error','rejected') THEN 1 ELSE 0 END) failed,MAX(created_at) last_event_at FROM distribution_events WHERE created_at>=datetime('now','-7 days')`),
    safeAll(env,`SELECT verification_state AS status,COUNT(*) count FROM distribution_delivery_state GROUP BY verification_state ORDER BY count DESC`),
    safeAll(env,`SELECT surface_slug,event_type,status,detail,human_sessions,outbound_clicks,monetized_outbound,revenue,created_at FROM distribution_events ORDER BY created_at DESC LIMIT 30`),
    safeAll(env,`SELECT tool_slug,previous_state,new_state,actor_source,notes,created_at FROM affiliate_workflow_history ORDER BY created_at DESC LIMIT 30`),
    assetJson(request,env,'/reports/gsc-signals.json',{items:[],generatedAt:null}),
    assetText(request,env,'/sitemap.xml',''),
    assetJson(request,env,'/reports/content-intelligence.json',{generatedAt:null}),
    assetJson(request,env,'/reports/organic-growth-opportunities.json',{generatedAt:null,summary:{}}),
    assetJson(request,env,'/reports/aeo-geo-readiness.json',{generatedAt:null,failures:null,warnings:null}),
    assetJson(request,env,'/reports/machine-readability.json',{generatedAt:null,failures:null,warnings:null}),
    assetJson(request,env,'/reports/catalog-freshness-coverage.json',{generatedAt:null,summary:{},coverage:[],contentChanges:[],quarantined:[]}),
    assetJson(request,env,'/reports/catalog-health.json',{summary:{},tools:[]}),
    assetJson(request,env,'/reports/tool-profile-holds.json',{generatedAt:null,count:0,items:[]}),
    safeFirst(env,`SELECT COUNT(*) total,SUM(CASE WHEN quality_status='healthy' THEN 1 ELSE 0 END) healthy,SUM(CASE WHEN quality_status='change_detected' THEN 1 ELSE 0 END) changed,SUM(CASE WHEN quality_status='confirmed_broken' THEN 1 ELSE 0 END) suppressed,SUM(CASE WHEN source_status NOT IN ('ok','broken') THEN 1 ELSE 0 END) warnings,MAX(last_checked_at) last_checked_at FROM catalog_runtime_state`),
    safeFirst(env,`SELECT COUNT(*) total,MAX(verified_at) last_admitted_at FROM catalog_runtime_candidates WHERE status='admitted_coverage'`),
    safeFirst(env,`SELECT COUNT(*) total,MAX(updated_at) last_gap_at FROM catalog_market_gaps WHERE status='research_required'`),
    safeFirst(env,`SELECT MAX(created_at) AS last_event_at FROM audience_events`),
    safeFirst(env,`SELECT MAX(created_at) AS last_publish_at,COUNT(*) AS published_30d FROM audience_events WHERE event_type='content_published' AND status='published' AND created_at>=datetime('now','-30 days')`),
    safeAll(env,`SELECT status,COUNT(*) count FROM distribution_network_outreach GROUP BY status ORDER BY count DESC`),
    safeFirst(env,`SELECT COUNT(*) placements,COALESCE(SUM(backlink_verified),0) backlinks FROM distribution_placements WHERE placement_verified=1`)
  ]);
  const queue=await chairmanQueue(request,env,ctx,{verifyLinks:true});
  const [growthState,contactRouteState,autonomyEvents,humanEvents,actionImpact]=await Promise.all([
    safeFirst(env,`SELECT COUNT(*) active,SUM(CASE WHEN subject_type='tool' THEN 1 ELSE 0 END) tools,SUM(CASE WHEN subject_type='surface' THEN 1 ELSE 0 END) surfaces,SUM(CASE WHEN subject_type='search' THEN 1 ELSE 0 END) search,SUM(CASE WHEN subject_type='affiliate' THEN 1 ELSE 0 END) affiliate,SUM(CASE WHEN subject_type LIKE 'catalog_%' THEN 1 ELSE 0 END) catalog,MAX(last_evaluated_at) last_evaluated_at FROM growth_opportunity_state WHERE status='active'`),
    safeFirst(env,`SELECT COUNT(*) routes,COUNT(DISTINCT surface_slug) surfaces FROM distribution_contact_routes WHERE status='discovered'`),
    safeFirst(env,`SELECT COUNT(*) n FROM distribution_events WHERE created_at>=datetime('now','-7 days') AND status IN ('completed','verified','live','submitted') AND event_type NOT IN ('human_gate_resolved','editorial_human_resolved')`),
    safeFirst(env,`SELECT COUNT(*) n FROM distribution_events WHERE created_at>=datetime('now','-7 days') AND event_type IN ('human_gate_resolved','editorial_human_resolved')`),
    growthActionMetrics(env)
  ]);
  const distCounts=workflowCounts(distributionStatuses),affCounts=workflowCounts(affiliateStatuses),deliveryCounts=workflowCounts(deliveryStates),networkCounts=workflowCounts(distributionNetworkStates);
  const indexedItems=(gsc.items||[]).filter(x=>n(x.impressions)>0),gscImpressions=indexedItems.reduce((sum,x)=>sum+n(x.impressions),0),gscClicks=indexedItems.reduce((sum,x)=>sum+n(x.clicks),0),sitemapUrls=[...String(sitemap).matchAll(/<loc>/g)].length;
  const liveSurfaces=await safeAll(env,`SELECT surface_slug,surface_name,surface_type,status,live_url,action_url,distribution_score,updated_at FROM distribution_opportunities WHERE status IN ('verified','live','submitted','pending_review','scheduled','human_action_required') ORDER BY CASE WHEN status IN ('verified','live') THEN 0 WHEN status IN ('submitted','pending_review','scheduled') THEN 1 ELSE 2 END,distribution_score DESC LIMIT 60`);
  const ledger=[...distEvents.map(x=>({at:x.created_at,engine:'distribution',subject:x.surface_slug||'engine',action:x.event_type,result:x.status||'observed',detail:x.detail||null,human_sessions:x.human_sessions,outbound_clicks:x.outbound_clicks,monetized_outbound:x.monetized_outbound,revenue:x.revenue})),...affiliateHistory.map(x=>({at:x.created_at,engine:'affiliate',subject:x.tool_slug,action:`${x.previous_state||'new'} → ${x.new_state}`,result:x.new_state,detail:x.notes||x.actor_source||null,human_sessions:null,outbound_clicks:null,monetized_outbound:null,revenue:null}))].sort((a,b)=>timeMs(b.at)-timeMs(a.at)).slice(0,40);
  const latestCoverage=affiliateLatest?.weighted_coverage==null?null:Number(affiliateLatest.weighted_coverage)*100,weekCoverage=affiliateWeekOld?.weighted_coverage==null?null:Number(affiliateWeekOld.weighted_coverage)*100;
  const audienceConnected=stats?.audienceGrowth?.status==='connected'&&stats?.engagement?.status==='connected',contentReportFresh=freshWithin(contentIntel?.generatedAt,36),contentPublishFresh=freshWithin(latestContentPublish?.last_publish_at,96);
  const seoEvidence=[gsc?.generatedAt,organicGrowth?.generatedAt,aeoGeo?.generatedAt,machineReadability?.generatedAt],seoFresh=seoEvidence.every(x=>freshWithin(x,36)),seoFailures=n(aeoGeo?.failures)+n(machineReadability?.failures),seoWarnings=n(aeoGeo?.warnings)+n(machineReadability?.warnings);
  const catalogGenerated=catalogRuntimeState?.last_checked_at||catalogFreshness?.generatedAt||catalogHealth?.summary?.generatedAt||null,catalogAgeMs=catalogGenerated?Date.now()-timeMs(catalogGenerated):null,catalogAgeDays=catalogAgeMs==null?null:Math.max(0,Math.floor(catalogAgeMs/86400000)),catalogFresh=catalogGenerated?catalogAgeMs<=7*86400000:false;
  const catalogSummary=catalogFreshness?.summary||{},catalogCoverage=Array.isArray(catalogFreshness?.coverage)?catalogFreshness.coverage:[],catalogChanges=Array.isArray(catalogFreshness?.contentChanges)?catalogFreshness.contentChanges:[],catalogQuarantined=Array.isArray(catalogFreshness?.quarantined)?catalogFreshness.quarantined:[];
  const healthIssues=[...(queue.broken_links||[]).map(x=>({severity:'bug',engine:x.engine||'unknown',code:'broken_human_action_link',title:x.title||x.id||'Human action',detail:x.link_verification?.reason||'ToolScout produced an invalid human-action URL.',url:x.action_url||null})),...(queue.external_verification_issues||[]).map(x=>({severity:'warning',engine:x.engine||'unknown',code:'external_action_verification_unavailable',title:x.title||x.id||'Human action',detail:`External destination could not be machine-verified (${x.link_verification?.reason||'unknown external response'}). This is not classified as an internal ToolScout bug; the distribution engine will re-check and re-discover persistent stale routes.`,url:x.action_url||null})),...(!contentPublishFresh&&contentReportFresh?[{severity:'warning',engine:'content',code:'publishing_heartbeat_partial',title:'Content Engine publishing heartbeat',detail:'Content Intelligence refreshed successfully, but no recent verified content_published event is available in D1. Publishing visibility is partial rather than silently assumed healthy.',url:null}]:[]),...(!audienceConnected?[{severity:'bug',engine:'audience',code:'audience_adapter_unavailable',title:'Audience Engine',detail:stats?.audienceGrowth?.reason||stats?.engagement?.reason||'Audience adapter is not reporting connected state.',url:null}]:[]),...(!seoFresh?[{severity:'warning',engine:'seo-geo-aio',code:'growth_evidence_stale',title:'SEO / GEO / AIO evidence',detail:'One or more daily growth/readiness reports are missing or older than 36 hours.',url:null}]:[]),...(seoFailures>0?[{severity:'bug',engine:'seo-geo-aio',code:'readiness_failures',title:'SEO / GEO / AIO readiness',detail:`${seoFailures} readiness failure(s) are present in the latest validation reports.`,url:null}]:[])];
  const health={content:{status:contentPublishFresh?'observed':(contentReportFresh?'partial':'no_evidence'),last_event_at:latestContentPublish?.last_publish_at||contentIntel?.generatedAt||null,detail:contentPublishFresh?`${n(latestContentPublish?.published_30d)} verified content_published event(s) / 30d`:(contentReportFresh?'Content Intelligence is fresh; publishing heartbeat is only partially observed.':'No fresh Content Engine evidence.')},audience:{status:audienceConnected?'observed':'no_evidence',last_event_at:latestAudienceEvent?.last_event_at||stats?.audienceGrowth?.observedAt||null,detail:audienceConnected?`${n(stats?.audienceGrowth?.publishedReplies)} published replies · ${n(stats?.audienceGrowth?.outboundActions)} outbound actions · ${n(stats?.engagement?.pending)} pending review`:'Audience adapter is not connected.'},seo_geo_aio:{status:seoFailures>0?'failed':(seoFresh?(seoWarnings>0?'warning':'observed'):'no_evidence'),last_event_at:[...seoEvidence].sort((a,b)=>timeMs(b)-timeMs(a))[0]||null,detail:`${n(organicGrowth?.summary?.actionableOpportunities)} actionable search opportunities · ${seoFailures} readiness failures · ${seoWarnings} warnings`,evidence:{gsc:gsc?.generatedAt||null,organic:organicGrowth?.generatedAt||null,aeo_geo:aeoGeo?.generatedAt||null,machine_readability:machineReadability?.generatedAt||null}},catalog:{status:catalogFresh?'observed':'warning',last_event_at:catalogGenerated,detail:`${n(catalogSummary.sourceHealthy)} healthy sources · ${n(catalogSummary.sourceWarnings)} warnings · ${n(catalogSummary.coverageGaps)} coverage gaps · ${n(toolProfileHolds?.count)} profile holds`},issues:healthIssues};
  const autonomousActions=n(autonomyEvents?.n),humanInterventions=n(humanEvents?.n),autonomyDenominator=autonomousActions+humanInterventions;
  const autonomousGrowth={status:'observed',window_days:30,active_opportunities:n(growthState?.active),tool_opportunities:n(growthState?.tools),surface_opportunities:n(growthState?.surfaces),affiliate_opportunities:n(growthState?.affiliate),catalog_opportunities:n(growthState?.catalog),search_opportunities:n(growthState?.search),last_evaluated_at:growthState?.last_evaluated_at||null,autonomous_actions_7d:autonomousActions,human_interventions_7d:humanInterventions,autonomy_rate_pct:autonomyDenominator?Number((autonomousActions/autonomyDenominator*100).toFixed(1)):0,chairman_queue:n(queue.total),contact_routes:n(contactRouteState?.routes),contact_route_surfaces:n(contactRouteState?.surfaces),verified_placements:n(distributionPlacements?.placements),verified_backlinks:n(distributionPlacements?.backlinks),prepared_growth_actions_30d:n(actionImpact?.preparedActions),attributed_growth_actions_30d:n(actionImpact?.attributedActions),attributed_human_sessions_30d:n(actionImpact?.browserConfirmedSessions),attributed_outbound_30d:n(actionImpact?.outboundClicks),attributed_monetized_outbound_30d:n(actionImpact?.monetizedOutbound),attribution_rule:actionImpact?.attribution||'Exact growth action marker plus browser-confirmed likely-human session. Missing evidence is never counted as impact.'};
  return {chairmanQueue:queue,autonomousGrowth,engines:{affiliate:{version:'2.1',status:affiliateLatest?'running':'awaiting_strict_evidence',last_run_at:affiliateLatest?.created_at||null,traffic_truth:'browser_confirmed',human_outbound_30d:n(affiliateLatest?.human_outbound_clicks),monetized_outbound_30d:n(affiliateLatest?.monetized_human_outbound_clicks),unmonetized_outbound_30d:n(affiliateLatest?.unmonetized_human_outbound_clicks),weighted_coverage_pct:latestCoverage,coverage_change_7d_pp:latestCoverage!=null&&weekCoverage!=null?Number((latestCoverage-weekCoverage).toFixed(1)):null,recoverable_queue:n(affiliateLatest?.queue_size),workflow_status:affCounts,discovery:{total:n(affiliateDiscovery?.total),qualified:n(affiliateDiscovery?.qualified),human:n(affiliateDiscovery?.human),last_checked:affiliateDiscovery?.last_checked||null},application_packs:{total:n(affiliatePacks?.total),prepared:n(affiliatePacks?.prepared),last_prepared_at:affiliatePacks?.last_prepared_at||null},routes:{total:n(affiliateRoutes?.total),verified:n(affiliateRoutes?.verified),failed:n(affiliateRoutes?.failed),last_verified_at:affiliateRoutes?.last_verified_at||null}},catalog:{version:'1.0',status:catalogFresh?'running':'stale_evidence',tools:n(catalogSummary.tools||catalogHealth?.summary?.tools)+n(catalogRuntimeCandidates?.total),source_healthy:n(catalogRuntimeState?.healthy||catalogSummary.sourceHealthy||catalogHealth?.summary?.sourceLinks?.healthy),source_warnings:n(catalogRuntimeState?.warnings||catalogSummary.sourceWarnings||catalogHealth?.summary?.sourceLinks?.warnings),coverage_gaps:Math.max(n(catalogSummary.coverageGaps||catalogCoverage.filter(x=>n(x.gap)>0).length),n(catalogRuntimeGaps?.total)),content_changes:Math.max(n(catalogChanges.length),n(catalogRuntimeState?.changed)),quarantined:Math.max(n(catalogQuarantined.length),n(catalogRuntimeState?.suppressed)),profile_holds:n(toolProfileHolds?.count),runtime_candidates:n(catalogRuntimeCandidates?.total),active_opportunities:n(growthState?.catalog),report_age_days:catalogAgeDays,freshness_target_days:7,freshness_status:catalogFresh?'within target':'refresh required',last_runtime_check:catalogRuntimeState?.last_checked_at||null,last_runtime_admission:catalogRuntimeCandidates?.last_admitted_at||null,rule:'Catalog growth is affiliate-neutral. Official-source verification and factual quality gates control admission, suppression and profile refresh; ambiguous changes are flagged rather than silently rewritten; catalog inclusion never implies ranking eligibility.'},distribution:{status:'running',version:'2.1',last_activity_at:distribution24?.last_event_at||distribution7?.last_event_at||null,events_24h:n(distribution24?.events),successful_24h:n(distribution24?.successful),failed_24h:n(distribution24?.failed),events_7d:n(distribution7?.events),successful_7d:n(distribution7?.successful),failed_7d:n(distribution7?.failed),opportunity_status:distCounts,delivery_status:deliveryCounts,network_status:networkCounts,network_candidates:Object.values(networkCounts).reduce((a,b)=>a+n(b),0),network_queued:n(networkCounts.queued),network_contact_found:n(networkCounts.contact_found),network_sent:n(networkCounts.sent),network_adopted:n(networkCounts.adopted),verified_placements:n(distributionPlacements?.placements),verified_backlinks:n(distributionPlacements?.backlinks),attributed_human_sessions_30d:n(stats?.distributionImpact?.humanSessions),attributed_outbound_30d:n(stats?.distributionImpact?.outboundClicks),attributed_monetized_outbound_30d:n(stats?.distributionImpact?.monetizedOutbound)}},footprint:{search:{source:'Google Search Console Search Analytics API',observed_pages:indexedItems.length,impressions:gscImpressions,clicks:gscClicks,generated_at:gsc.generatedAt||null,sitemap_urls:sitemapUrls,note:'Observed pages are URLs with Search Console impressions in the imported window; this is evidence of search visibility, not a complete Google index count.'},distribution:{live_verified:n(distCounts.live)+n(distCounts.verified),submitted_pending:n(distCounts.submitted)+n(distCounts.pending_review)+n(distCounts.scheduled),human_gates:n(distCounts.human_action_required),surfaces:liveSurfaces.map(x=>({slug:x.surface_slug,name:x.surface_name,type:x.surface_type,status:x.status,url:x.live_url||x.action_url||null,score:n(x.distribution_score),updated_at:x.updated_at||null}))}},ledger,health,generated_at:new Date().toISOString()};
}
function chairmanPayloadEnhancer(){
  return `<script data-chairman-payload-renderer="v3">(function(){
    if(typeof taskHtml!=='function'||window.__toolscoutChairmanPayloadV3)return;
    window.__toolscoutChairmanPayloadV3=true;
    const originalTaskHtml=taskHtml;
    const localEsc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    const copyButton=(label,value)=>value?'<button class="btn" type="button" data-chairman-copy="'+encodeURIComponent(String(value))+'">'+localEsc(label)+'</button>':'';
    taskHtml=function(x){
      let html=originalTaskHtml(x);
      if(!x||!x.editorial_queue_id||html.includes('Publication payload'))return html;
      const payload='<details open style="margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card2)"><summary style="cursor:pointer;font-weight:800">Publication payload · '+localEsc(x.publication_type||'Post')+'</summary>'+
        '<div class="taskReason" style="margin-top:10px"><b>Steps:</b><div style="white-space:pre-wrap;margin-top:5px">'+localEsc(x.instructions||'')+'</div>'+copyButton('Copy steps',x.instructions)+'</div>'+
        '<div class="taskReason" style="margin-top:10px"><b>Title:</b><div style="white-space:pre-wrap;margin-top:5px">'+localEsc(x.prepared_title||'')+'</div>'+copyButton('Copy title',x.prepared_title)+'</div>'+
        '<div class="taskReason" style="margin-top:10px"><b>Content:</b><div style="white-space:pre-wrap;margin-top:5px;max-height:340px;overflow:auto;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card)">'+localEsc(x.prepared_body||'')+'</div>'+copyButton('Copy content',x.prepared_body)+'</div>'+
        '</details>';
      return html.replace('<div class="taskActions">',payload+'<div class="taskActions">');
    };
    document.addEventListener('click',function(e){
      const b=e.target.closest('[data-chairman-copy]');
      if(!b)return;
      e.preventDefault();e.stopPropagation();
      const value=decodeURIComponent(b.getAttribute('data-chairman-copy')||''),old=b.textContent;
      navigator.clipboard.writeText(value).then(()=>{b.textContent='Copied';setTimeout(()=>b.textContent=old,1200)}).catch(()=>{b.textContent='Copy failed';setTimeout(()=>b.textContent=old,1600)});
    });
    try{if(typeof snapshot!=='undefined'&&snapshot&&typeof renderChairman==='function')renderChairman(snapshot)}catch{}
  })();</script>`;
}
async function servePage(request,env,ctx){
  if(!(await accessAuthenticated(request,ctx)))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  if(!env.ADMIN_TOKEN)return new Response('Command Center unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  const asset=await env.ASSETS.fetch(new Request(new URL('/analytics-v2/',request.url).toString(),request));
  if(!asset.ok)return asset;
  const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.append('Set-Cookie',`${SESSION_COOKIE}=${await sessionValue(env.ADMIN_TOKEN,sessionBucket())}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  let html=await asset.text();
  const footprintAnchor='<section class="widget" data-widget="footprint"';
  if(!html.includes('data-widget="autonomous-growth"'))html=html.replace(footprintAnchor,autonomousGrowthWidget()+'\n\n    '+footprintAnchor);
  if(!html.includes('data-widget="catalog-growth"'))html=html.replace(footprintAnchor,catalogGrowthWidget()+'\n\n    '+footprintAnchor);
  if(!html.includes('data-widget="affiliate-status"'))html=html.replace(footprintAnchor,affiliateCoverageWidget()+'\n\n    '+footprintAnchor);
  if(!html.includes('renderAutonomousGrowth'))html=html.replace('</body>',autonomousGrowthScript()+'</body>');
  if(!html.includes('data-catalog-growth-renderer="v1"'))html=html.replace('</body>',catalogGrowthScript()+'</body>');
  if(!html.includes('renderAffiliateCoverageStatus'))html=html.replace('</body>',affiliateCoverageScript()+'</body>');
  if(!html.includes('data-chairman-payload-renderer="v3"'))html=html.replace('</body>',chairmanPayloadEnhancer()+'</body>');
  headers.delete('Content-Length');
  return new Response(html,{status:asset.status,headers});
}
async function protectedStats(request,env,ctx){
  if(!(await validSession(request,env)))return Response.json({error:'command_center_session_expired'},{status:401,headers:JSON_H});
  const upstream=await base.fetch(request,env,ctx);if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return new Response('Command Center stats unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
  const [growthOps,affiliateCoverageStatus]=await Promise.all([growthOpsSnapshot(request,env,ctx,data),affiliateCoverageStatusSnapshot(request,env)]);
  return Response.json({...data,growthOps,affiliateCoverageStatus},{headers:JSON_H});
}
async function distributionHumanAction(request,env){
  if(!(await validSession(request,env)))return Response.json({ok:false,error:'command_center_session_expired'},{status:401,headers:JSON_H});
  let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H})}
  const rawId=String(body.surface_slug||'').trim().slice(0,180),action=String(body.action||'').trim().toLowerCase();
  if(!rawId||!['submitted','skipped'].includes(action))return Response.json({ok:false,error:'invalid_action'},{status:400,headers:JSON_H});
  if(rawId.startsWith('editorial:')){
    const queueId=rawId.slice('editorial:'.length);
    const row=await env.DB.prepare(`SELECT queue_id,target_name,target_url,asset_url,status FROM distribution_editorial_queue WHERE queue_id=?`).bind(queueId).first();
    if(!row||row.status!=='prepared')return Response.json({ok:false,error:'editorial_action_not_active'},{status:409,headers:JSON_H});
    const next=action==='submitted'?'published':'skipped';
    await env.DB.prepare(`UPDATE distribution_editorial_queue SET status=?,updated_at=datetime('now') WHERE queue_id=? AND status='prepared'`).bind(next,queueId).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,asset_id,source_url,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`editorial_${crypto.randomUUID()}`,String(row.target_name||'community').toLowerCase().replace(/[^a-z0-9]+/g,'-'),'editorial_human_resolved',next,'community',queueId,row.asset_url||null,row.target_url||null,`${row.target_name||'Community'} editorial action marked ${next} from Chairman Queue.`).run().catch(()=>{});
    return Response.json({ok:true,queue_id:queueId,status:next,resume:'distribution_measurement'},{headers:JSON_H});
  }
  const slug=rawId.toLowerCase().slice(0,120);
  const row=await env.DB.prepare(`SELECT surface_slug,status,human_required,action_url FROM distribution_opportunities WHERE surface_slug=?`).bind(slug).first();
  if(!row||!n(row.human_required))return Response.json({ok:false,error:'human_gate_not_active'},{status:409,headers:JSON_H});
  const next=action==='submitted'?'submitted':'skipped',nextAction=action==='submitted'?'Human submission confirmed. Engine resumes monitoring and attribution; automatic public verification runs where a machine-verifiable route exists.':'Owner skipped this opportunity. Reconsider only if new evidence materially changes expected value.';
  await env.DB.prepare(`UPDATE distribution_opportunities SET status=?,human_required=0,next_action=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(next,nextAction,slug).run();
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`human_${crypto.randomUUID()}`,slug,'human_gate_resolved',next,'distribution_engine',nextAction).run();
  return Response.json({ok:true,surface_slug:slug,status:next,resume:'verification_measurement'},{headers:JSON_H});
}

export default {async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='GET'&&analyticsPath(url.pathname))return servePage(request,env,ctx);if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return protectedStats(request,env,ctx);if(request.method==='GET'&&url.pathname==='/analytics/api/chairman-queue'){if(!(await validSession(request,env)))return Response.json({error:'command_center_session_expired'},{status:401,headers:JSON_H});return Response.json(await chairmanQueue(request,env,ctx,{verifyLinks:true}),{headers:JSON_H})}if(request.method==='POST'&&url.pathname==='/analytics/api/distribution-human-action')return distributionHumanAction(request,env);return base.fetch(request,env,ctx)},async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined}};