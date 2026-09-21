import {partitionChairmanTasks} from './chairman-task-quality.js';
import base from './affiliate-human-action-entry-worker.js';
import { normalizeAffiliateState } from './affiliate-operations.js';
import { growthActionMetrics } from './distribution-impact-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
const OWNER_EMAIL='pcaiano@gmail.com';
const HUMAN_ACTION_LIMIT=12;
const BACKLINK_BOOTSTRAP_FLOOR=10;
const BACKLINK_ATTEMPT_MIN_24H=6;
const BACKLINK_STAGNATION_HOURS=72;
const BACKLINK_STAGNATION_MIN_ATTEMPTS_7D=12;
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
const GROWTH_RND_EXECUTION_BINDINGS=Object.freeze({
  search_amplification:['content_amplification','distribution_amplification','deepen_existing_search_asset','improve_click_capture','protect_current_ranking','strengthen_internal_links','observe_low_sample_ranking','search_measurement'],
  news_compounding:['catalog_impact_review','content_amplification','search_update_angle','vendor_amplification','verify_news_materiality','verify_official_source'],
  affiliate_leakage_recovery:['prepare_affiliate_application_pack','capture_approved_referral_link','activate_affiliate_route','production_verify_affiliate_route','monitor_affiliate_decision'],
  catalog_expansion:['discover_catalog_candidates','verify_first_party_sources','admit_only_after_quality_gates','research_first_party_candidate_profile','monitor_runtime_coverage_profile'],
  automation_gap_reduction:['autonomous_route_qualification','repair_stalled_route_execution','resolve_supported_route_auth','surface_only_true_human_route_gate','surface_only_true_human_gate']
});
function parseJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function growthRndTitle(type){
  if(type==='search_amplification')return 'Search demand amplification';
  if(type==='news_compounding')return 'Software update compounding';
  if(type==='affiliate_leakage_recovery')return 'Affiliate leakage recovery';
  if(type==='catalog_expansion')return 'Catalog expansion';
  if(type==='automation_gap_reduction')return 'Human gate reduction';
  return String(type||'Growth experiment').replaceAll('_',' ');
}
function growthRndSubjectMatch(type,subjectType){
  const s=String(subjectType||'');
  if(type==='search_amplification')return s==='search';
  if(type==='news_compounding')return s==='news_update';
  if(type==='affiliate_leakage_recovery')return s==='affiliate';
  if(type==='catalog_expansion')return s.startsWith('catalog_');
  if(type==='automation_gap_reduction')return s==='surface';
  return true;
}
function growthRndEvidenceItem(row){
  const signal=parseJson(row?.signal_json||'{}',{});
  return {opportunity_key:row?.opportunity_key||null,title:signal.title||signal.cluster||row?.subject_key||row?.opportunity_key||'Growth opportunity',priority:Number(n(row?.priority_score).toFixed(1)),impressions:n(signal.impressions),clicks:n(signal.clicks),position:signal.position==null?null:Number(signal.position),lane:signal.lane||null};
}
function growthRndState(tasks,sourceBound){
  const counts={pending:0,claimed:0,attempted:0,deferred:0,verified:0,human_required:0,executor_missing:0,stalled:0,blocked:0};
  for(const task of tasks||[]){const k=String(task.status||'');if(Object.prototype.hasOwnProperty.call(counts,k))counts[k]++}
  if(!sourceBound)return {status:'unbound',counts};
  if(!tasks?.length)return {status:'awaiting_contract_sync',counts};
  if(counts.executor_missing||counts.blocked)return {status:'blocked',counts};
  if(counts.stalled)return {status:'stalled',counts};
  if(counts.human_required)return {status:'human_required',counts};
  if(counts.claimed||counts.attempted)return {status:'executing',counts};
  if(counts.pending)return {status:'ready',counts};
  if(counts.deferred)return {status:'queued',counts};
  if(counts.verified)return {status:'measuring',counts};
  return {status:'observed',counts};
}
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
      safeAll(env,`SELECT tool_slug,COUNT(*) clicks,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized FROM verified_outbound_events WHERE created_at>=datetime('now','-30 days') GROUP BY tool_slug`)
    ]);
    const pipelineMap=new Map((pipeline?.verified_programs||[]).map(x=>[x.slug,x]));
    const workflowMap=new Map(workflowRows.map(x=>[x.tool_slug,x]));
    const clickMap=new Map(clickRows.map(x=>[x.tool_slug,{clicks:n(x.clicks),monetized:n(x.monetized)}]));
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
      const ct=clickMap.get(tool.slug)||{clicks:0,monetized:0};groups[group].push({slug:tool.slug,name:tool.name||tool.slug,status,clicks30d:ct.clicks,monetizedClicks30d:ct.monetized});
    }
    for(const items of Object.values(groups))items.sort((a,b)=>b.clicks30d-a.clicks30d||a.name.localeCompare(b.name));
    const summarize=items=>({count:items.length,clicks30d:items.reduce((s,x)=>s+n(x.clicks30d),0),monetizedClicks30d:items.reduce((s,x)=>s+n(x.monetizedClicks30d),0),items});
    return {status:'observed',windowDays:30,clickDefinition:'First-party verified /go/ outbound navigation only. Pre-integrity browser-confirmed clicks are diagnostic and excluded from canonical coverage.',active:summarize(groups.active),pending:summarize(groups.pending),rejected:summarize(groups.rejected)};
  }catch(e){return {status:'unavailable',reason:String(e?.message||e)}}
}
function affiliateCoverageWidget(){return `<section class="widget" data-widget="affiliate-status" data-detail="1" style="--w:12;--h:6"><div class="widgetHead"><div><div class="widgetKicker">Affiliate · status · clicks</div><div class="widgetTitle">Affiliate Coverage Status</div></div><div class="widgetMeta">Verified outbound · 30d</div></div><div class="widgetBody" id="affiliateCoverageStatusBody"><div class="empty">Refresh to load affiliate status.</div></div><div class="resizeHandle"></div></section>`}
function autonomousGrowthWidget(){return `<section class="widget" data-widget="autonomous-growth" data-detail="1" style="--w:12;--h:6"><div class="widgetHead"><div><div class="widgetKicker">Growth · autonomous loop</div><div class="widgetTitle">Autonomous Growth</div></div><div class="widgetMeta">Discovery → action → verified human impact</div></div><div class="widgetBody" id="autonomousGrowthBody"><div class="empty">Refresh to load autonomous growth.</div></div><div class="resizeHandle"></div></section>`}

function businessPulseWidget(){return `<section class="widget" data-widget="business-pulse" style="--w:12;--h:7"><div class="widgetHead"><div><div class="widgetKicker">Business truth · acquisition · authority · money</div><div class="widgetTitle">Business Pulse</div></div><div class="widgetMeta" id="businessPulseMeta">Current evidence</div></div><div class="widgetBody" id="businessPulseBody"><div class="empty">Refresh to load the business state.</div></div><div class="resizeHandle"></div></section>`}
function businessPulseScript(){return `<style>
.businessHeadline{border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:14px 15px;margin-bottom:10px}.businessHeadline b{display:block;font-size:18px;letter-spacing:-.02em}.businessHeadline span{display:block;color:var(--muted);font-size:11px;line-height:1.45;margin-top:4px}
.flywheel{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin:10px 0}.flyStage{border:1px solid var(--line);border-radius:11px;padding:9px;background:var(--card2)}.flyStage small{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.08em;font-weight:850}.flyStage b{display:block;font-size:12px;margin-top:4px}.flyStage.good{border-color:#245943}.flyStage.warn{border-color:#5d4a22}.flyStage.bad{border-color:#61312e}.businessGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.businessPanel{border-top:1px solid var(--line);padding-top:10px;margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:16px}.businessPanel .row{padding:7px 0}@media(max-width:900px){.flywheel{grid-template-columns:repeat(3,1fr)}.businessGrid{grid-template-columns:repeat(2,1fr)}.businessPanel{grid-template-columns:1fr}}@media(max-width:520px){.flywheel{grid-template-columns:repeat(2,1fr)}.businessGrid{grid-template-columns:1fr 1fr}}
</style><script data-business-pulse-renderer="v1">(function(){
const n=v=>Number(v||0).toLocaleString(),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),money=(v,c)=>{if(v===null||v===undefined)return 'Unknown';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c||'EUR',maximumFractionDigits:2}).format(Number(v||0))}catch{return String(v)}},dt=v=>v?new Date(String(v).replace(' ','T')+(String(v).includes('T')?'':'Z')).toLocaleString(undefined,{timeZone:'Europe/Lisbon'}):'—';
function stage(label,value,state){return '<div class="flyStage '+state+'"><small>'+esc(label)+'</small><b>'+esc(value)+'</b></div>'}
function renderBusinessPulse(d){
 const root=document.getElementById('businessPulseBody'),meta=document.getElementById('businessPulseMeta');if(!root)return;
 const x=d?.growthOps?.autonomousGrowth||{},foot=d?.growthOps?.footprint?.search||{},gs=d?.growthOps?.googleSearchReality||{},t=d?.traffic||{},f=d?.funnel||{},commercial=d?.commercial||{},rev=d?.revenue||{},q=d?.growthOps?.chairmanQueue||{},dist=d?.growthOps?.engines?.distribution||{};
 const humans24=Number(x.supervisor_strict_humans_24h||0),humans7=Number(x.supervisor_strict_humans_7d||0),out=Number(f.outboundClicks??x.attributed_outbound_30d??0),mon=Number(commercial?.totals?.monetizedOutbound??x.attributed_monetized_outbound_30d??0),revenue=rev.confirmedRevenue;
 const refs=Number(x.verified_referring_domains||0),floor=Number(x.backlink_bootstrap_floor||10),attempts=Number(x.backlink_attempts_24h||0),attemptMin=Number(x.backlink_attempt_min_24h||6),impressions=Number(gs?.searchPerformance?.window28d?.impressions??foot.impressions??0),clicks=Number(gs?.searchPerformance?.window28d?.clicks??foot.clicks??0);
 const loop=String(x.loop_status||'unknown'),authorityStalled=Boolean(x.backlink_stagnating),authorityGap=Boolean(x.backlink_throughput_gap);
 let headline='Flywheel is producing commercial signals.',detail='Keep scaling sources that generate verified humans and monetized outbound.';
 if(loop!=='healthy'){headline='Operational integrity needs attention.';detail='The flywheel cannot be trusted until the active execution or data-health issue is cleared.'}
 else if(humans7===0){headline='Engines are running. Human acquisition is not proven yet.';detail=authorityStalled?'Authority acquisition is stagnant, so the Growth Brain is rotating the channel mix.':authorityGap?'Authority throughput is below target, so discovery and outreach are being replenished.':'The immediate job is to turn external execution and Google demand into verified human visits.'}
 else if(out===0){headline='Verified humans are arriving. Outbound conversion is the next constraint.';detail='Keep acquisition running while improving the path from decision pages to vendor clicks.'}
 else if(mon===0){headline='Users are clicking vendors. Monetization coverage is the next constraint.';detail='Affiliate coverage should expand without changing editorial ranking.'}
 if(meta)meta.textContent='Snapshot '+dt(d?.growthOps?.generated_at||new Date().toISOString());
 const demandState=impressions>0?'good':'bad',authorityState=refs>=floor?'good':(refs>0?'warn':'bad'),acqState=humans7>0?'good':'bad',engState=out>0?'good':(humans7>0?'warn':'bad'),monState=(mon>0||Number(revenue||0)>0)?'good':'warn',learnState=loop==='healthy'?'good':'bad';
 const brain=String(x.supervisor_directive||'No directive').replaceAll('_',' ');
 const authorityNote=authorityStalled?'Channel mix rotation active':authorityGap?'Pipeline replenishment active':refs>=floor?'Bootstrap floor reached':'Authority acquisition active';
 root.innerHTML='<div class="businessHeadline"><b>'+esc(headline)+'</b><span>'+esc(detail)+'</span></div>'+
 '<div class="businessGrid">'+
 '<div class="metric"><small>Strict humans · 24h</small><b>'+n(humans24)+'</b><span>'+n(humans7)+' / 7d · '+n(t.monthToDate)+' MTD</span></div>'+
 '<div class="metric"><small>Google demand</small><b>'+n(impressions)+'</b><span>'+n(clicks)+' clicks · GSC observed</span></div>'+
 '<div class="metric"><small>Referring domains</small><b>'+n(refs)+' / '+n(floor)+'</b><span>'+n(x.verified_backlinks)+' verified backlinks</span></div>'+
 '<div class="metric"><small>Authority attempts · 24h</small><b>'+n(attempts)+' / '+n(attemptMin)+'</b><span>'+esc(authorityNote)+'</span></div>'+
 '<div class="metric"><small>Human outbound</small><b>'+n(out)+'</b><span>'+n(mon)+' monetized</span></div>'+
 '<div class="metric"><small>Confirmed revenue</small><b>'+esc(revenue==null?'Unknown':money(revenue,rev.currency))+'</b><span>Commercial evidence only</span></div>'+
 '<div class="metric"><small>External executions · 24h</small><b>'+n(x.supervisor_external_executions_24h)+'</b><span>'+n(x.external_executions_7d)+' / 7d</span></div>'+
 '<div class="metric"><small>Needs you</small><b>'+n(q.total)+'</b><span>'+n(q.estimated_minutes)+' min · Chairman Queue</span></div>'+
 '</div>'+
 '<div class="flywheel">'+stage('1 · Demand',impressions>0?'Observed':'Not proven',demandState)+stage('2 · Authority',refs+'/'+floor,authorityState)+stage('3 · Humans',n(humans7)+' / 7d',acqState)+stage('4 · Outbound',n(out),engState)+stage('5 · Monetize',n(mon),monState)+stage('6 · Learn',loop,learnState)+'</div>'+
 '<div class="businessPanel"><div>'+
 '<div class="row"><div><div class="rowName">Growth Brain now</div><div class="rowMeta">'+esc(brain)+'</div></div><div class="rowValue">'+esc(String(x.supervisor_status||'unknown'))+'</div></div>'+
 '<div class="row"><div><div class="rowName">Authority loop</div><div class="rowMeta">'+n(x.backlink_attempts_7d)+' qualified attempts / 7d · '+n(x.backlink_authority_queue)+' authority tasks in queue · '+n(x.sender_no_output_24h)+' no-output handoffs / 24h</div></div><div class="rowValue">'+esc(authorityStalled?'rotate':authorityGap?'replenish':'execute')+'</div></div>'+
 '<div class="row"><div><div class="rowName">Business trajectory</div><div class="rowMeta">The objective is sustainable income. Revenue, monetized outbound and repeatable human acquisition are the proof points; internal runs are not.</div></div><div class="rowValue">'+esc((mon>0||Number(revenue||0)>0)?'commercial signal':'not proven')+'</div></div>'+
 '</div><div>'+
 '<div class="row"><div><div class="rowName">Growth data freshness</div><div class="rowMeta">Growth Brain '+esc(dt(x.supervisor_last_evaluated_at))+' · distribution '+esc(dt(dist.last_activity_at))+'</div></div><div class="rowValue">'+esc(dt(d?.growthOps?.generated_at))+'</div></div>'+
 '<div class="row"><div><div class="rowName">Search evidence</div><div class="rowMeta">'+esc(gs.source||foot.source||'GSC')+' · '+n(gs?.searchPerformance?.observedPages??foot.observed_pages)+' visible pages · '+n(gs?.indexHealth?.indexed)+'/'+n(gs?.indexHealth?.inspected)+' URL Inspection pass</div></div><div class="rowValue">'+esc(dt(gs.generatedAt||foot.generated_at))+'</div></div>'+
 '<div class="row"><div><div class="rowName">Execution integrity</div><div class="rowMeta">'+n(x.execution_contract_stalled)+' stalled · '+n(x.execution_contract_missing)+' missing executors · '+n(x.loop_failed_core_runs_24h)+' unresolved core failures</div></div><div class="rowValue">'+esc(loop)+'</div></div>'+
 '</div></div>';
}
const original=window.render;if(typeof original==='function')window.render=function(d){original(d);renderBusinessPulse(d)}
})();</script>`}

function googleSearchRealityWidget(){return `<section class="widget" data-widget="google-search-reality" style="--w:12;--h:7"><div class="widgetHead"><div><div class="widgetKicker">Google Search Console · first-party read-only</div><div class="widgetTitle">Google Search Reality</div></div><div class="widgetMeta" id="googleSearchRealityMeta">Awaiting first-party evidence</div></div><div class="widgetBody" id="googleSearchRealityBody"><div class="empty">Refresh to load Google's view of ToolScout.</div></div><div class="resizeHandle"></div></section>`}
function googleSearchRealityScript(){return `<script data-google-search-reality-renderer="v1">(function(){
const n=v=>Number(v||0).toLocaleString(),num=v=>Number(v||0),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),pct=v=>v==null?'—':(Number(v)>=0?'+':'')+Number(v).toFixed(1)+'%',dt=v=>{try{return v?new Date(v).toLocaleString(undefined,{timeZone:'Europe/Lisbon'}):'—'}catch{return String(v||'—')}};
function metric(label,value,sub){return '<div class="metric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(sub||'')+'</span></div>'}
function draw(d){const root=document.getElementById('googleSearchRealityBody'),meta=document.getElementById('googleSearchRealityMeta');if(!root)return;const x=d?.growthOps?.googleSearchReality;if(!x||!x.generatedAt){root.innerHTML='<div class="empty">First-party Search Console telemetry has not completed yet.</div>';return}
const p=x.searchPerformance||{},w=p.window28d||{},r=p.recent7||{},prev=p.previous7||{},chg=p.change7d||{},idx=x.indexHealth||{},sm=x.sitemaps||{},ops=Array.isArray(x.opportunities)?x.opportunities:[];
const queueOf=o=>o?.queue||(o?.kind==='sitemap_redirect'||o?.kind==='canonical_mismatch'?'fix_now':o?.kind==='index_issue'?'index_recovery':o?.kind==='protect'?'protect':['striking_distance','high_impression_low_rank','ctr_opportunity'].includes(o?.kind)?'ranking_opportunities':'other');
const queues={fix_now:ops.filter(o=>queueOf(o)==='fix_now'),index_recovery:ops.filter(o=>queueOf(o)==='index_recovery'),ranking_opportunities:ops.filter(o=>queueOf(o)==='ranking_opportunities'),protect:ops.filter(o=>queueOf(o)==='protect')};
const hygieneBaseline='2026-09-21T20:47:35.000Z',postHygiene=Date.parse(x.generatedAt)>=Date.parse(hygieneBaseline);
if(meta)meta.textContent='Updated '+dt(x.generatedAt)+(postHygiene?'':' · pre-hygiene baseline');
root.innerHTML='<div class="metricGrid">'+
metric('Impressions · 28d',n(w.impressions),n(w.clicks)+' clicks · CTR '+Number(w.ctr||0).toFixed(2)+'%')+
metric('Average position · 28d',Number(w.position||0).toFixed(1),n(p.observedPages)+' Google-visible pages')+
metric('Impressions · 7d',n(r.impressions),pct(chg.impressionsPct)+' vs previous 7d')+
metric('Clicks · 7d',n(r.clicks),pct(chg.clicksPct)+' vs previous 7d')+
metric('URL Inspection',n(idx.indexed)+' / '+n(idx.inspected)+' indexed',n(idx.discoveredNotIndexed)+' discovered not indexed · '+n(idx.unknownToGoogle)+' unknown to Google')+
metric('Inspection coverage',Number(idx.inspectionCoveragePct||0).toFixed(1)+'%',n(idx.inspectionUniverseUrls)+' canonical sitemap URLs · '+n(idx.redirected)+' redirects')+
metric('Canonical mismatches',n(idx.canonicalMismatches),n(idx.failed)+' FAIL · '+n(idx.robotsBlocked)+' robots · '+n(idx.noindexBlocked)+' noindex')+
metric('Sitemaps',n(sm.submittedCount),sm.apiOk?'Search Console API healthy':'API problem')+
metric('Fix now',postHygiene?n(queues.fix_now.length):'Recheck','Redirects and canonical conflicts')+
metric('Index recovery',postHygiene?n(queues.index_recovery.length):'Recheck','Unknown or discovered but not indexed')+
metric('Ranking opportunities',n(queues.ranking_opportunities.length),'Authority concentrated on top 20 demand pages')+
metric('Protect',n(queues.protect.length),'First-page assets to defend')+
'</div>'+
'<div class="businessPanel"><div><div class="row"><div><div class="rowName">Google index view</div><div class="rowMeta">'+esc(idx.note||'')+'</div></div><div class="rowValue">'+(idx.inspected?Number(idx.indexedPct||0).toFixed(1)+'% pass':'—')+'</div></div>'+
'<div class="row"><div><div class="rowName">Device mix</div><div class="rowMeta">'+(Array.isArray(p.devices)&&p.devices.length?p.devices.slice(0,4).map(z=>esc(z.device)+': '+n(z.impressions)).join(' · '):'No device data')+'</div></div><div class="rowValue">'+n(r.impressions)+' 7d imp.</div></div></div>'+
'<div><div class="row"><div><div class="rowName">Growth Brain Search queues</div><div class="rowMeta">'+(postHygiene?'Technical queues use post-hygiene Google evidence.':'Technical Fix now and Index recovery are paused until Google is reinspected after the hygiene deployment.')+'</div></div><div class="rowValue">'+n(queues.ranking_opportunities.length)+' ranking</div></div>'+
(ops.length?ops.slice(0,6).map(o=>'<div class="task" style="margin-top:7px"><div class="rowName">'+esc(o.page||o.url||o.kind)+'</div><div class="rowMeta">'+esc(String(o.kind||'opportunity').replaceAll('_',' '))+' · score '+Number(o.score||0).toFixed(0)+' · '+n(o.impressions)+' imp. · pos '+Number(o.position||0).toFixed(1)+'</div><div class="taskReason">'+esc(String(o.action||'measure').replaceAll('_',' '))+'</div></div>').join(''):'<div class="empty">No priority Search opportunity in the current evidence.</div>')+'</div></div>'+
'<div class="note" style="margin-top:10px">Read-only source: '+esc(x.source||'Google Search Console')+'. Search Analytics does not guarantee every row; URL Inspection describes the version in Google\'s index, not a live test.</div>';
}
const original=window.render;if(typeof original==='function')window.render=function(d){original(d);draw(d)}
})();</script>`}

function catalogGrowthWidget(){return `<section class="widget" data-widget="catalog-growth" data-detail="1" style="--w:6;--h:5"><div class="widgetHead"><div><div class="widgetKicker">Catalog · factual quality · coverage</div><div class="widgetTitle">Catalog Growth & Quality</div></div><div class="widgetMeta" id="catalogGrowthMeta">Shared growth brain</div></div><div class="widgetBody" id="catalogGrowthBody"><div class="empty">Refresh to load catalog state.</div></div><div class="resizeHandle"></div></section>`}
function catalogGrowthScript(){return `<script data-catalog-growth-renderer="v1">(function(){const n=v=>Number(v||0).toLocaleString(),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));function draw(d){const root=document.getElementById('catalogGrowthBody'),meta=document.getElementById('catalogGrowthMeta'),x=d?.growthOps?.engines?.catalog;if(!root)return;if(!x){root.innerHTML='<div class="empty">Catalog growth evidence unavailable.</div>';return}if(meta)meta.textContent=x.report_age_days==null?'Shared growth brain':'Evidence '+n(x.report_age_days)+'d old';root.innerHTML='<div class="metricGrid">'+
metric('Catalog tools',n(x.tools),'Current catalog')+
metric('Source healthy',n(x.source_healthy),n(x.source_warnings)+' warnings')+
metric('Coverage gaps',n(x.coverage_gaps),n(x.active_opportunities)+' catalog opportunities in closed loop')+
metric('Changed sources',n(x.content_changes),n(x.quarantined)+' quarantined')+
metric('Profiles held',n(x.profile_holds),'Evidence gates')+
metric('Freshness target',n(x.freshness_target_days)+'d',x.freshness_status)+
'</div>'+(Array.isArray(x.recent_admissions)&&x.recent_admissions.length?'<details class="row" style="margin-top:10px" open><summary class="rowName" style="cursor:pointer">Recently added to catalog · '+n(x.recent_admissions.length)+'</summary><div style="margin-top:8px">'+x.recent_admissions.map(function(a){return '<div class="task" style="margin-top:7px"><div class="rowName"><a href="'+esc(a.toolscout_url||('/tools/'+a.slug))+'" target="_blank" rel="noopener">'+esc(a.name||a.slug)+'</a></div><div class="rowMeta">'+esc(a.category||'coverage')+' · '+esc(a.created_at||'')+'</div>'+(a.detail?'<div class="taskReason" style="margin-top:4px">'+esc(a.detail)+'</div>':'')+'</div>'}).join('')+'</div></details>':'')+'<div class="note" style="margin-top:10px">'+esc(x.rule||'')+'</div>'}const original=window.render;if(typeof original==='function')window.render=function(d){original(d);draw(d)}})();</script>`}
function autonomousGrowthScript(){return `<script>(function(){const n=v=>Number(v||0).toLocaleString(),p=v=>Number(v||0).toFixed(0)+'%',esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),when=v=>{try{return new Date(String(v||'').replace(' ','T')+'Z').toLocaleString()}catch{return String(v||'')}};function executionLog(items,total){items=Array.isArray(items)?items:[];if(!items.length)return '<details class="row" style="margin-top:10px"><summary class="rowName" style="cursor:pointer">External execution log · '+n(total)+'</summary><div class="rowMeta" style="margin-top:8px">No execution-level records available.</div></details>';return '<details class="row" style="margin-top:10px"><summary style="cursor:pointer"><span class="rowName">External execution log · '+n(total)+'</span><span class="rowMeta" style="margin-left:8px">Open to audit each action</span></summary><div style="margin-top:10px">'+items.map(function(i){var href=i.external_url||i.target_url||'';var action=href?'<a class="btn" style="margin-top:7px;display:inline-block" href="'+esc(href)+'" target="_blank" rel="noopener">Open evidence</a>':'';return '<div class="task" style="margin-top:8px"><div class="rowName">'+esc(i.label||i.type||i.id)+'</div><div class="rowMeta">'+esc(String(i.engine||'unknown'))+' · '+esc(String(i.type||'execution'))+' · '+esc(String(i.channel||'n/a'))+' · '+esc(String(i.status||'observed'))+' · '+esc(when(i.at))+'</div>'+(i.detail?'<div class="taskReason" style="margin-top:5px">'+esc(i.detail)+'</div>':'')+action+'</div>'}).join('')+'</div></details>'}function rndDetails(items,total){items=Array.isArray(items)?items:[];if(!items.length)return '<div class="row"><div><div class="rowName">Growth R&D</div><div class="rowMeta">No active bounded experiments.</div></div><div class="value">0</div></div>';return '<details class="row" open><summary style="cursor:pointer"><span class="rowName">Growth R&D · '+n(total)+'</span><span class="rowMeta" style="margin-left:8px">Evidence · hypothesis · action · owner · status · result</span></summary><div style="margin-top:10px">'+items.map(function(i){var actions=(Array.isArray(i.action_steps)?i.action_steps:[]).map(function(a){return esc(String(a).replaceAll('_',' '))}).join(' · ');var owners=esc(i.owner||'Growth Brain');var user=i.human_required?'Human action is required only through the Chairman Queue when a concrete verified gate is present.':'No action required from you.';return '<div class="task" style="margin-top:8px"><div class="rowName">'+esc(i.title||i.experiment_type||i.id)+'</div><div class="rowMeta" style="margin-top:5px"><b>Evidence:</b> '+esc(i.evidence_summary||'No evidence summary available.')+'</div><div class="rowMeta" style="margin-top:5px"><b>Hypothesis:</b> '+esc(i.hypothesis||'')+'</div><div class="rowMeta" style="margin-top:5px"><b>Action:</b> '+(actions||'No executable action bound')+'</div><div class="rowMeta" style="margin-top:5px"><b>Owner:</b> '+owners+'</div><div class="rowMeta" style="margin-top:5px"><b>Status:</b> '+esc(String(i.status||'unknown').replaceAll('_',' '))+' · source '+(i.source_bound?'bound':'missing')+' · execution contract '+(i.contract_bound?'bound':'missing')+'</div><div class="rowMeta" style="margin-top:5px"><b>Result:</b> '+esc(i.result||'No measured result yet.')+'</div><div class="note" style="margin-top:7px">'+esc(user)+'</div></div>'}).join('')+'</div></details>'}function renderAutonomousGrowth(d){const r=document.getElementById('autonomousGrowthBody');if(!r)return;const x=d?.growthOps?.autonomousGrowth;if(!x||x.status!=='observed'){r.innerHTML='<div class="empty">Autonomous growth evidence is unavailable.</div>';return}r.innerHTML='<div class="grid4">'+
'<div class="metric"><small>Active opportunities</small><b>'+n(x.active_opportunities)+'</b><span>'+n(x.tool_opportunities)+' tool · '+n(x.surface_opportunities)+' surface · '+n(x.affiliate_opportunities)+' affiliate · '+n(x.catalog_opportunities)+' catalog · '+n(x.news_opportunities)+' news · '+n(x.search_opportunities)+' search</span></div>'+
'<div class="metric"><small>External executions · 7d</small><b>'+n(x.external_executions_7d)+'</b><span>'+n(x.internal_cycles_7d)+' internal engine cycles kept separate</span></div>'+
'<div class="metric"><small>Attributed sessions · 30d</small><b>'+n(x.attributed_human_sessions_30d)+'</b><span>'+n(x.attributed_outbound_30d)+' outbound · '+n(x.attributed_monetized_outbound_30d)+' monetized</span></div>'+
'<div class="metric"><small>Public listings</small><b>'+n(x.verified_placements)+'</b><span>'+n(x.verified_backlinks)+' verified backlinks</span></div></div>'+
executionLog(x.external_execution_items,x.external_executions_7d)+
'<div class="row" style="margin-top:10px"><div><div class="rowName">Discovery & indexation</div><div class="rowMeta">'+n(x.search_visible_pages)+' GSC-visible pages · '+n(x.sitemap_urls)+' sitemap URLs · IndexNow automated · '+n(x.distribution_discovered)+' surfaces in discovery/research</div></div><div class="value">'+n(x.distribution_ready)+' ready</div></div>'+'<div class="row"><div><div class="rowName">Backlink acquisition</div><div class="rowMeta">'+n(x.verified_backlinks)+' verified backlinks across verified external surfaces · '+n(x.verified_placements)+' public listings · quality only · no paid ranking links · no reciprocal requirement</div></div><div class="value">'+(x.backlink_acquisition_required?'active':'monitoring')+'</div></div>'+
'<div class="row"><div><div class="rowName">Growth Brain verdict</div><div class="rowMeta">'+esc(String(x.supervisor_status||'unavailable').toUpperCase())+' · directive '+esc(String(x.supervisor_directive||'none'))+' · '+n(x.supervisor_strict_humans_24h)+' strict humans / 24h · '+n(x.supervisor_strict_humans_7d)+' / 7d · '+n(x.supervisor_external_executions_24h)+' external executions / 24h · '+n(x.supervisor_corrections)+' autonomous correction(s)</div></div><div class="value">'+esc(String(x.supervisor_status||'unavailable'))+'</div></div>'+
'<div class="row"><div><div class="rowName">Growth loop integrity</div><div class="rowMeta">'+esc(String(x.loop_status||'unknown').toUpperCase())+' · '+n(x.execution_contract_ready)+' ready · '+n(x.execution_contract_claimed)+' claimed · '+n(x.execution_contract_attempted)+' awaiting proof · '+n(x.execution_contract_deferred)+' deferred · '+n(x.execution_contract_stalled)+' stalled · '+n(x.loop_orphan_routes)+' orphan routes · '+n(x.loop_failed_core_runs_24h)+' failed core runs</div></div><div class="value">'+esc(String(x.loop_status||'unknown'))+'</div></div>'+
'<div class="row"><div><div class="rowName">Alternate distribution routes</div><div class="rowMeta">Public contact or amplification routes discovered across '+n(x.contact_route_surfaces)+' external surfaces. '+n(x.route_actions_in_progress)+' in progress · '+n(x.route_actions_verified_placement)+' verified placement · '+n(x.route_actions_verified_human)+' strict-human impact · '+n(x.route_actions_stalled)+' stalled. Placement is not counted as human impact.</div></div><div class="value">'+n(x.contact_routes)+'</div></div>'+
rndDetails(x.rnd_items,x.rnd_experiments)+'<div class="row"><div><div class="rowName">Chairman Queue</div><div class="rowMeta">Human intervention should trend down as machine-resolvable routes are learned.</div></div><div class="value">'+n(x.chairman_queue)+'</div></div>'+
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
  const quality=partitionChairmanTasks(rows);
  const actionable=quality.items.filter(x=>x.link_verification?.ok).sort((a,b)=>(b.expected_impact_score/Math.max(1,b.estimated_minutes))-(a.expected_impact_score/Math.max(1,a.estimated_minutes))).slice(0,HUMAN_ACTION_LIMIT);
  const brokenLinks=rows.filter(x=>!x.link_verification?.ok&&x.link_verification?.failure_scope==='internal');
  const externalVerificationIssues=rows.filter(x=>!x.link_verification?.ok&&x.link_verification?.failure_scope==='external');
  return {status:'connected',quality_holds:[...(raw.quality_holds||[]),...quality.quality_holds],quality_version:quality.quality_version,total:actionable.length,estimated_minutes:actionable.reduce((sum,x)=>sum+n(x.estimated_minutes),0),items:actionable,broken_links:brokenLinks,external_verification_issues:externalVerificationIssues,rule:'Only current engine states with a reachable HTTPS action URL enter the Chairman Queue. Prepared community publication tasks include the exact payload needed to complete the human action.'};
}
async function growthOpsSnapshot(request,env,ctx,stats){
  const [affiliateLatest,affiliateWeekOld,affiliateStatuses,affiliateDiscovery,affiliatePacks,affiliateRoutes,distributionStatuses,distribution24,distribution7,deliveryStates,distEvents,affiliateHistory,gsc,gscReality,sitemap,contentIntel,organicGrowth,aeoGeo,machineReadability,catalogFreshness,catalogHealth,toolProfileHolds,catalogRuntimeState,catalogRuntimeCandidates,catalogRuntimeGaps,catalogRecentAdmissions,latestAudienceEvent,latestContentPublish,distributionNetworkStates,distributionPlacements]=await Promise.all([
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
    assetJson(request,env,'/data/gsc-search-reality.json',{generatedAt:null,source:null,searchPerformance:{},indexHealth:{},sitemaps:{},opportunities:[]}),
    assetText(request,env,'/sitemap.xml',''),
    assetJson(request,env,'/reports/content-intelligence.json',{generatedAt:null}),
    assetJson(request,env,'/reports/organic-growth-opportunities.json',{generatedAt:null,summary:{}}),
    assetJson(request,env,'/reports/aeo-geo-readiness.json',{generatedAt:null,failures:null,warnings:null}),
    assetJson(request,env,'/reports/machine-readability.json',{generatedAt:null,failures:null,warnings:null}),
    assetJson(request,env,'/reports/catalog-freshness-coverage.json',{generatedAt:null,summary:{},coverage:[],contentChanges:[],quarantined:[]}),
    assetJson(request,env,'/reports/catalog-health.json',{summary:{},tools:[]}),
    assetJson(request,env,'/reports/tool-profile-holds.json',{generatedAt:null,count:0,items:[]}),
    safeFirst(env,`SELECT COUNT(*) total,SUM(CASE WHEN quality_status='healthy' THEN 1 ELSE 0 END) healthy,SUM(CASE WHEN quality_status='change_detected' THEN 1 ELSE 0 END) changed,SUM(CASE WHEN quality_status='confirmed_broken' THEN 1 ELSE 0 END) suppressed,SUM(CASE WHEN source_status NOT IN ('ok','broken') THEN 1 ELSE 0 END) warnings,MAX(last_checked_at) last_checked_at FROM catalog_runtime_state`),
    safeFirst(env,`SELECT COUNT(*) total,MAX(verified_at) last_admitted_at FROM catalog_runtime_candidates WHERE status IN ('published','admitted_coverage')`),
    safeFirst(env,`SELECT COUNT(*) total,MAX(updated_at) last_gap_at FROM catalog_market_gaps WHERE status='research_required'`),
    safeAll(env,`SELECT tool_slug,detail,evidence_json,created_at FROM catalog_runtime_events WHERE event_type='catalog_growth_admitted' AND status='completed' ORDER BY created_at DESC LIMIT 8`),
    safeFirst(env,`SELECT MAX(created_at) AS last_event_at FROM audience_events`),
    safeFirst(env,`SELECT MAX(created_at) AS last_publish_at,COUNT(*) AS published_30d FROM audience_events WHERE event_type='content_published' AND status='published' AND created_at>=datetime('now','-30 days')`),
    safeAll(env,`SELECT status,COUNT(*) count FROM distribution_network_outreach GROUP BY status ORDER BY count DESC`),
    safeFirst(env,`WITH proof AS (
      SELECT surface_slug FROM distribution_placements WHERE placement_verified=1
      UNION
      SELECT r.surface_slug FROM distribution_contact_route_actions a
      JOIN distribution_contact_routes r ON r.route_id=a.route_id
      WHERE a.status IN ('verified_placement','verified_human_impact')
      UNION
      SELECT surface_slug FROM distribution_opportunities WHERE status IN ('verified','live')
    ),
    external_proof AS (
      SELECT surface_slug FROM proof
      WHERE surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')
    )
    SELECT
      (SELECT COUNT(*) FROM external_proof) placements,
      (SELECT COUNT(DISTINCT surface_slug) FROM distribution_placements
        WHERE placement_verified=1 AND backlink_verified=1
          AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')) backlinks`)
  ]);
  const [authorityMetrics,authorityBacklinkRows]=await Promise.all([
    safeFirst(env,`SELECT
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-24 hours'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-24 hours')) attempts_24h,
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-7 days'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-7 days')) attempts_7d,
      (SELECT COUNT(*) FROM distribution_events WHERE event_type='authority_handoff_no_output' AND created_at>=datetime('now','-24 hours')) sender_no_output_24h,
      (SELECT MAX(first_verified_at) FROM distribution_placements WHERE placement_verified=1 AND backlink_verified=1 AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')) last_verified_at,
      (SELECT COUNT(*) FROM growth_execution_contract WHERE action IN ('backlink_reference_outreach','verify_backlink_acquisition','publisher_contact_discovery','execute_alternate_routes') AND status IN ('pending','claimed','attempted','deferred','stalled')) authority_queue`),
    safeAll(env,`SELECT public_url,first_verified_at,last_checked_at FROM distribution_placements WHERE placement_verified=1 AND backlink_verified=1 AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')`)
  ]);
  const queue=await chairmanQueue(request,env,ctx,{verifyLinks:false});
  const [growthCardCore,actionImpact,growthRndRows,growthRndSourceRows,growthRndExecutionRows]=await Promise.all([
    safeFirst(env,`WITH
      growth AS (
        SELECT COUNT(*) active,
          SUM(CASE WHEN subject_type='tool' THEN 1 ELSE 0 END) tools,
          SUM(CASE WHEN subject_type='surface' THEN 1 ELSE 0 END) surfaces,
          SUM(CASE WHEN subject_type='search' THEN 1 ELSE 0 END) search,
          SUM(CASE WHEN subject_type='affiliate' THEN 1 ELSE 0 END) affiliate,
          SUM(CASE WHEN subject_type LIKE 'catalog_%' THEN 1 ELSE 0 END) catalog,
          SUM(CASE WHEN subject_type='news_update' THEN 1 ELSE 0 END) news,
          SUM(CASE WHEN action_json IS NULL OR trim(action_json)='' OR trim(action_json)='[]' THEN 1 ELSE 0 END) empty_actions,
          MAX(last_evaluated_at) last_evaluated_at
        FROM growth_opportunity_state WHERE status='active'
      ),
      rnd AS (
        SELECT COUNT(*) active,MAX(updated_at) last_evaluated_at FROM growth_rnd_experiments WHERE status='active'
      ),
      routes AS (
        SELECT COUNT(*) routes,COUNT(DISTINCT surface_slug) surfaces FROM distribution_contact_routes
      ),
      route_actions AS (
        SELECT COUNT(*) total,
          SUM(CASE WHEN status IN ('queued','retry_due') THEN 1 ELSE 0 END) queued,
          SUM(CASE WHEN status IN ('researching','qualified_auto','executed_waiting_verification','issued_to_content') THEN 1 ELSE 0 END) in_progress,
          SUM(CASE WHEN status='verified_human_impact' THEN 1 ELSE 0 END) verified_human,
          SUM(CASE WHEN status='verified_placement' THEN 1 ELSE 0 END) verified_placement,
          SUM(CASE WHEN status='human_action_required' THEN 1 ELSE 0 END) human,
          SUM(CASE WHEN status='auth_required' THEN 1 ELSE 0 END) auth,
          SUM(CASE WHEN status='stalled' THEN 1 ELSE 0 END) stalled,
          SUM(CASE WHEN status IN ('policy_blocked','exhausted') THEN 1 ELSE 0 END) exhausted,
          SUM(CASE WHEN
            (status IN ('queued','retry_due','researching','qualified_auto') AND updated_at<datetime('now','-24 hours'))
            OR (status='issued_to_content' AND COALESCE(last_attempt_at,updated_at)<datetime('now','-80 hours'))
          THEN 1 ELSE 0 END) stale
        FROM distribution_contact_route_actions
      ),
      orphan_routes AS (
        SELECT COUNT(*) n FROM distribution_contact_routes r
        LEFT JOIN distribution_contact_route_actions a ON a.route_id=r.route_id
        WHERE r.status IN ('discovered','in_loop') AND a.route_id IS NULL
      ),
      actions AS (
        SELECT
          SUM(CASE WHEN created_at>=datetime('now','-7 days') AND status IN ('sent','verified','completed','attributed') THEN 1 ELSE 0 END) external_7d,
          SUM(CASE WHEN status IN ('prepared','issued','leased') AND updated_at<datetime('now','-72 hours') THEN 1 ELSE 0 END) stale
        FROM growth_action_events
      ),
      submissions AS (
        SELECT SUM(CASE WHEN surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-7 days') THEN 1 ELSE 0 END) external_7d
        FROM distribution_submissions
      ),
      engine_summary AS (
        SELECT
          SUM(CASE WHEN started_at>=datetime('now','-7 days') AND status='completed' THEN 1 ELSE 0 END) internal_cycles_7d,
          MAX(CASE WHEN engine='growth' AND mission='opportunity_coordination' AND status='completed' THEN completed_at END) loop_last_completed_at,
          MAX(CASE WHEN engine='growth' AND mission='opportunity_coordination' AND status='completed' THEN started_at END) loop_last_started_at
        FROM engine_runs
      ),
      failed_core AS (
        SELECT COUNT(*) n
        FROM engine_runs f
        WHERE f.started_at>=datetime('now','-24 hours')
          AND f.status='failed'
          AND ((f.engine='growth' AND f.mission IN ('opportunity_coordination','rnd_audit'))
            OR (f.engine='distribution' AND f.mission IN ('network_cycle','autonomous_cycle','economic_learning'))
            OR (f.engine='content' AND f.mission='social_intelligence'))
          AND NOT EXISTS (
            SELECT 1 FROM engine_runs c
            WHERE c.engine=f.engine AND c.mission=f.mission
              AND c.status='completed' AND c.started_at>f.started_at
          )
      ),
      human_events AS (
        SELECT COUNT(*) n FROM distribution_events
        WHERE created_at>=datetime('now','-7 days') AND event_type IN ('human_gate_resolved','editorial_human_resolved')
      ),
      supervisor AS (
        SELECT
          MAX(CASE WHEN engine='growth_brain' THEN status END) status,
          MAX(CASE WHEN engine='growth_brain' THEN directive END) directive,
          MAX(CASE WHEN engine='growth_brain' THEN strict_humans_24h END) strict_humans_24h,
          MAX(CASE WHEN engine='growth_brain' THEN strict_humans_7d END) strict_humans_7d,
          MAX(CASE WHEN engine='growth_brain' THEN attributed_humans_7d END) attributed_humans_7d,
          MAX(CASE WHEN engine='growth_brain' THEN external_executions_24h END) external_executions_24h,
          MAX(CASE WHEN engine='growth_brain' THEN external_executions_7d END) external_executions_7d,
          MAX(CASE WHEN engine='growth_brain' THEN correction_count END) correction_count,
          MAX(CASE WHEN engine='growth_brain' THEN last_correction_at END) last_correction_at,
          MAX(CASE WHEN engine='growth_brain' THEN last_evaluated_at END) last_evaluated_at
        FROM growth_supervisor_state
      ),
      execution_contract AS (
        SELECT
          SUM(CASE WHEN status='executor_missing' THEN 1 ELSE 0 END) missing,
          SUM(CASE WHEN status='stalled' THEN 1 ELSE 0 END) stalled,
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
          SUM(CASE WHEN status='claimed' THEN 1 ELSE 0 END) claimed,
          SUM(CASE WHEN status='attempted' THEN 1 ELSE 0 END) attempted,
          SUM(CASE WHEN status='deferred' THEN 1 ELSE 0 END) deferred,
          MIN(CASE WHEN status='pending' THEN created_at END) oldest_pending,
          MIN(CASE WHEN status='claimed' THEN claimed_at END) oldest_claimed,
          MIN(CASE WHEN status='attempted' THEN attempted_at END) oldest_attempted
        FROM growth_execution_contract
      )
      SELECT
        growth.active growth_active,growth.tools growth_tools,growth.surfaces growth_surfaces,growth.search growth_search,
        growth.affiliate growth_affiliate,growth.catalog growth_catalog,growth.news growth_news,growth.empty_actions growth_empty_actions,
        growth.last_evaluated_at growth_last_evaluated_at,
        rnd.active rnd_active,rnd.last_evaluated_at rnd_last_evaluated_at,
        routes.routes contact_routes,routes.surfaces contact_route_surfaces,
        route_actions.total route_actions_total,route_actions.queued route_actions_queued,route_actions.in_progress route_actions_in_progress,
        route_actions.verified_human route_actions_verified_human,route_actions.verified_placement route_actions_verified_placement,
        route_actions.human route_actions_human,route_actions.auth route_actions_auth,route_actions.stalled route_actions_stalled,
        route_actions.exhausted route_actions_exhausted,route_actions.stale route_actions_stale,
        orphan_routes.n orphan_routes,
        COALESCE(actions.external_7d,0)+COALESCE(submissions.external_7d,0) raw_external_executions_7d,
        actions.stale stale_growth_actions,
        engine_summary.internal_cycles_7d internal_cycles_7d,
        engine_summary.loop_last_completed_at loop_last_completed_at,engine_summary.loop_last_started_at loop_last_started_at,
        failed_core.n failed_core_runs_24h,human_events.n human_events_7d,
        supervisor.status supervisor_status,supervisor.directive supervisor_directive,
        supervisor.strict_humans_24h supervisor_strict_humans_24h,supervisor.strict_humans_7d supervisor_strict_humans_7d,
        supervisor.attributed_humans_7d supervisor_attributed_humans_7d,
        supervisor.external_executions_24h supervisor_external_executions_24h,
        supervisor.external_executions_7d supervisor_external_executions_7d,
        supervisor.correction_count supervisor_correction_count,
        supervisor.last_correction_at supervisor_last_correction_at,supervisor.last_evaluated_at supervisor_last_evaluated_at,
        execution_contract.missing execution_contract_missing,execution_contract.stalled execution_contract_stalled,
        execution_contract.pending execution_contract_pending,execution_contract.claimed execution_contract_claimed,
        execution_contract.attempted execution_contract_attempted,execution_contract.deferred execution_contract_deferred,
        execution_contract.oldest_pending execution_contract_oldest_pending,execution_contract.oldest_claimed execution_contract_oldest_claimed,
        execution_contract.oldest_attempted execution_contract_oldest_attempted
      FROM growth,rnd,routes,route_actions,orphan_routes,actions,submissions,engine_summary,failed_core,human_events,supervisor,execution_contract`),
    growthActionMetrics(env),
    safeAll(env,`SELECT experiment_key,experiment_type,subject_key,hypothesis,action_json,status,risk_class,expected_signal,created_at,last_evaluated_at,updated_at FROM growth_rnd_experiments WHERE status='active' ORDER BY updated_at DESC LIMIT 12`),
    safeAll(env,`SELECT opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,last_evaluated_at FROM growth_opportunity_state WHERE status='active' ORDER BY priority_score DESC LIMIT 200`),
    safeAll(env,`SELECT source_kind,source_id,opportunity_key,subject_type,subject_key,action,executor,engine,status,priority_score,last_result,updated_at FROM growth_execution_contract WHERE status<>'cancelled' ORDER BY priority_score DESC,updated_at DESC LIMIT 500`)
  ]);
  const growthState={active:n(growthCardCore?.growth_active),tools:n(growthCardCore?.growth_tools),surfaces:n(growthCardCore?.growth_surfaces),search:n(growthCardCore?.growth_search),affiliate:n(growthCardCore?.growth_affiliate),catalog:n(growthCardCore?.growth_catalog),news:n(growthCardCore?.growth_news),last_evaluated_at:growthCardCore?.growth_last_evaluated_at||null};
  const growthRnd={active:n(growthCardCore?.rnd_active),last_evaluated_at:growthCardCore?.rnd_last_evaluated_at||null};
  const contactRouteState={routes:n(growthCardCore?.contact_routes),surfaces:n(growthCardCore?.contact_route_surfaces)};
  const routeActionState={total:n(growthCardCore?.route_actions_total),queued:n(growthCardCore?.route_actions_queued),in_progress:n(growthCardCore?.route_actions_in_progress),verified_human:n(growthCardCore?.route_actions_verified_human),verified_placement:n(growthCardCore?.route_actions_verified_placement),human:n(growthCardCore?.route_actions_human),auth:n(growthCardCore?.route_actions_auth),stalled:n(growthCardCore?.route_actions_stalled),exhausted:n(growthCardCore?.route_actions_exhausted)};
  const externalExecutions={n:growthCardCore?.supervisor_external_executions_7d==null?n(growthCardCore?.raw_external_executions_7d):n(growthCardCore?.supervisor_external_executions_7d)};
  const internalCycles={n:n(growthCardCore?.internal_cycles_7d)};
  const humanEvents={n:n(growthCardCore?.human_events_7d)};
  const growthLoopRun={last_completed_at:growthCardCore?.loop_last_completed_at||null,last_started_at:growthCardCore?.loop_last_started_at||null};
  const orphanRoutes={n:n(growthCardCore?.orphan_routes)};
  const staleRouteActions={n:n(growthCardCore?.route_actions_stale)};
  const staleGrowthActions={n:n(growthCardCore?.stale_growth_actions)};
  const emptyOpportunityActions={n:n(growthCardCore?.growth_empty_actions)};
  const failedCoreRuns={n:n(growthCardCore?.failed_core_runs_24h)};
  const growthSupervisor={status:growthCardCore?.supervisor_status||null,directive:growthCardCore?.supervisor_directive||null,strict_humans_24h:n(growthCardCore?.supervisor_strict_humans_24h),strict_humans_7d:n(growthCardCore?.supervisor_strict_humans_7d),attributed_humans_7d:n(growthCardCore?.supervisor_attributed_humans_7d),external_executions_24h:n(growthCardCore?.supervisor_external_executions_24h),external_executions_7d:n(growthCardCore?.supervisor_external_executions_7d),correction_count:n(growthCardCore?.supervisor_correction_count),last_correction_at:growthCardCore?.supervisor_last_correction_at||null,last_evaluated_at:growthCardCore?.supervisor_last_evaluated_at||null};
  const executionContractState={
    integrity:'task-specific-bounded-v3',
    missing:n(growthCardCore?.execution_contract_missing),
    stalled:n(growthCardCore?.execution_contract_stalled),
    ready:n(growthCardCore?.execution_contract_pending),
    claimed:n(growthCardCore?.execution_contract_claimed),
    attempted:n(growthCardCore?.execution_contract_attempted),
    deferred:n(growthCardCore?.execution_contract_deferred),
    oldestPendingAgeHours:hoursSince(growthCardCore?.execution_contract_oldest_pending),
    oldestClaimedAgeHours:hoursSince(growthCardCore?.execution_contract_oldest_claimed),
    oldestAttemptedAgeHours:hoursSince(growthCardCore?.execution_contract_oldest_attempted)
  };
  executionContractState.inFlight=executionContractState.claimed+executionContractState.attempted;
  executionContractState.activeBacklog=executionContractState.ready+executionContractState.inFlight;
  const growthRndItems=(growthRndRows||[]).map(row=>{
    const parsedSteps=parseJson(row.action_json||'[]',[]);const steps=Array.isArray(parsedSteps)?parsedSteps:[];
    const executableActions=GROWTH_RND_EXECUTION_BINDINGS[row.experiment_type]||steps;
    const sourceCandidates=(growthRndSourceRows||[]).filter(op=>growthRndSubjectMatch(row.experiment_type,op.subject_type));
    const actionCandidates=sourceCandidates.filter(op=>{const actions=parseJson(op.action_json||'[]',[]);return Array.isArray(actions)&&actions.some(action=>executableActions.includes(action)||steps.includes(action))});
    const sourceRows=(actionCandidates.length?actionCandidates:sourceCandidates).slice(0,3);
    const sourceBound=sourceRows.length>0;
    const taskRows=(growthRndExecutionRows||[]).filter(task=>growthRndSubjectMatch(row.experiment_type,task.subject_type)&&executableActions.includes(String(task.action||'')));
    const state=growthRndState(taskRows,sourceBound);
    const evidence=sourceRows.map(growthRndEvidenceItem);
    const evidenceSummary=evidence.length?evidence.map(item=>item.impressions>0?item.title+': '+n(item.impressions)+' GSC impressions'+(item.position==null?'':' at avg position '+Number(item.position).toFixed(1)):item.title+': priority '+Number(item.priority).toFixed(0)+'/100').join(' | '):'No active source opportunity is currently bound to this experiment.';
    const owners=[...new Set(taskRows.map(task=>task.engine||task.executor).filter(Boolean))];
    const humanRequired=state.counts.human_required>0||taskRows.some(task=>task.executor==='human_gate');
    const signal=String(row.expected_signal||'target signal').replaceAll('_',' ');
    const result=state.counts.verified>0?state.counts.verified+' execution step'+(state.counts.verified===1?'':'s')+' verified. Measuring '+signal+'.':taskRows.length?'Execution is '+state.status+'. No verified outcome yet; measuring '+signal+'.':sourceBound?'Source opportunity found. Waiting for execution contract binding before claiming execution.':'No executable source opportunity is currently bound.';
    return {id:row.experiment_key,title:growthRndTitle(row.experiment_type),experiment_type:row.experiment_type,subject_key:row.subject_key||null,hypothesis:row.hypothesis,action_steps:steps,expected_signal:row.expected_signal||null,risk_class:row.risk_class||'bounded',status:state.status,evidence,evidence_summary:evidenceSummary,owners,owner:owners.length?owners.join(', '):'Growth Brain',execution_counts:state.counts,source_bound:sourceBound,contract_bound:taskRows.length>0,execution_bound:sourceBound&&taskRows.length>0,human_required:humanRequired,user_action:humanRequired?'Human action is required only through the Chairman Queue when a concrete verified gate is present.':'No action required from you.',result,last_evaluated_at:row.last_evaluated_at||row.updated_at||null};
  });
  const distCounts=workflowCounts(distributionStatuses),affCounts=workflowCounts(affiliateStatuses),deliveryCounts=workflowCounts(deliveryStates),networkCounts=workflowCounts(distributionNetworkStates);
  const authorityDomains=new Set();for(const row of authorityBacklinkRows||[]){try{const h=new URL(String(row.public_url||'')).hostname.toLowerCase().replace(/^www\./,'');if(h&&h!=='trytoolscout.org'&&!h.endsWith('.trytoolscout.org'))authorityDomains.add(h)}catch{}}
  const verifiedReferringDomains=authorityDomains.size,backlinkAttempts24=n(authorityMetrics?.attempts_24h),backlinkAttempts7=n(authorityMetrics?.attempts_7d),senderNoOutput24h=n(authorityMetrics?.sender_no_output_24h),backlinkAuthorityQueue=n(authorityMetrics?.authority_queue);
  const backlinkLastVerifiedAgeHours=hoursSince(authorityMetrics?.last_verified_at),backlinkRequired=verifiedReferringDomains<BACKLINK_BOOTSTRAP_FLOOR,backlinkThroughputGap=backlinkRequired&&backlinkAttempts24<BACKLINK_ATTEMPT_MIN_24H,backlinkStagnating=backlinkRequired&&backlinkAttempts7>=BACKLINK_STAGNATION_MIN_ATTEMPTS_7D&&(backlinkLastVerifiedAgeHours===null||backlinkLastVerifiedAgeHours>=BACKLINK_STAGNATION_HOURS);
  const indexedItems=(gsc.items||[]).filter(x=>n(x.impressions)>0),fallbackImpressions=indexedItems.reduce((sum,x)=>sum+n(x.impressions),0),fallbackClicks=indexedItems.reduce((sum,x)=>sum+n(x.clicks),0),gscWindow=gscReality?.searchPerformance?.window28d||{},gscImpressions=n(gscWindow.impressions||fallbackImpressions),gscClicks=n(gscWindow.clicks||fallbackClicks),sitemapUrls=[...String(sitemap).matchAll(/<loc>/g)].length;
  const liveSurfaces=await safeAll(env,`SELECT surface_slug,surface_name,surface_type,status,live_url,action_url,distribution_score,updated_at FROM distribution_opportunities WHERE status IN ('verified','live','submitted','pending_review','scheduled','human_action_required') ORDER BY CASE WHEN status IN ('verified','live') THEN 0 WHEN status IN ('submitted','pending_review','scheduled') THEN 1 ELSE 2 END,distribution_score DESC LIMIT 60`);
  const ledger=[...distEvents.map(x=>({at:x.created_at,engine:'distribution',subject:x.surface_slug||'engine',action:x.event_type,result:x.status||'observed',detail:x.detail||null,human_sessions:x.human_sessions,outbound_clicks:x.outbound_clicks,monetized_outbound:x.monetized_outbound,revenue:x.revenue})),...affiliateHistory.map(x=>({at:x.created_at,engine:'affiliate',subject:x.tool_slug,action:`${x.previous_state||'new'} → ${x.new_state}`,result:x.new_state,detail:x.notes||x.actor_source||null,human_sessions:null,outbound_clicks:null,monetized_outbound:null,revenue:null}))].sort((a,b)=>timeMs(b.at)-timeMs(a.at)).slice(0,40);
  const latestCoverage=affiliateLatest?.weighted_coverage==null?null:Number(affiliateLatest.weighted_coverage)*100,weekCoverage=affiliateWeekOld?.weighted_coverage==null?null:Number(affiliateWeekOld.weighted_coverage)*100;
  const audienceConnected=stats?.audienceGrowth?.status==='connected'&&stats?.engagement?.status==='connected',contentReportFresh=freshWithin(contentIntel?.generatedAt,36),contentPublishFresh=freshWithin(latestContentPublish?.last_publish_at,96);
  const seoEvidence=[gscReality?.generatedAt||gsc?.generatedAt,organicGrowth?.generatedAt,aeoGeo?.generatedAt,machineReadability?.generatedAt],seoFresh=seoEvidence.every(x=>freshWithin(x,36)),seoFailures=n(aeoGeo?.failures)+n(machineReadability?.failures),seoWarnings=n(aeoGeo?.warnings)+n(machineReadability?.warnings);
  const catalogGenerated=catalogRuntimeState?.last_checked_at||catalogFreshness?.generatedAt||catalogHealth?.summary?.generatedAt||null,catalogAgeMs=catalogGenerated?Date.now()-timeMs(catalogGenerated):null,catalogAgeDays=catalogAgeMs==null?null:Math.max(0,Math.floor(catalogAgeMs/86400000)),catalogFresh=catalogGenerated?catalogAgeMs<=7*86400000:false;
  const catalogSummary=catalogFreshness?.summary||{},catalogCoverage=Array.isArray(catalogFreshness?.coverage)?catalogFreshness.coverage:[],catalogChanges=Array.isArray(catalogFreshness?.contentChanges)?catalogFreshness.contentChanges:[],catalogQuarantined=Array.isArray(catalogFreshness?.quarantined)?catalogFreshness.quarantined:[];
  const growthLoopAgeHours=hoursSince(growthLoopRun?.last_completed_at);
  const growthEffectivenessUnavailable=actionImpact?.status!=='observed';
  const growthEffectivenessWarning=!growthEffectivenessUnavailable&&n(actionImpact?.maturedActions)>=8&&n(actionImpact?.maturedBrowserConfirmedSessions)===0;
  const growthLoopFailed=executionContractState.missing>0||n(orphanRoutes?.n)>0||n(emptyOpportunityActions?.n)>0||n(failedCoreRuns?.n)>0||(growthLoopAgeHours!==null&&growthLoopAgeHours>4);
  const growthLoopWarning=executionContractState.stalled>0
    ||(executionContractState.oldestClaimedAgeHours!==null&&executionContractState.oldestClaimedAgeHours>6)
    ||(executionContractState.oldestAttemptedAgeHours!==null&&executionContractState.oldestAttemptedAgeHours>24)
    ||n(staleRouteActions?.n)>0||n(staleGrowthActions?.n)>0||n(routeActionState?.stalled)>0
    ||growthEffectivenessUnavailable||growthEffectivenessWarning;
  const growthLoopStatus=growthLoopFailed?'failed':(growthLoopWarning?'warning':'healthy');
  const growthRndUnbound=growthRndItems.filter(item=>!item.source_bound);
  const growthRndContractGaps=growthRndItems.filter(item=>item.source_bound&&!item.contract_bound);
  const authorityIssues=[...(backlinkThroughputGap?[{severity:'warning',engine:'distribution',code:'authority_throughput_gap',title:'Backlink acquisition throughput below target',detail:`${backlinkAttempts24}/${BACKLINK_ATTEMPT_MIN_24H} qualified authority attempts in the last 24 hours while referring domains are ${verifiedReferringDomains}/${BACKLINK_BOOTSTRAP_FLOOR}. The Distribution Engine must replenish discovery and execute new authority routes.`,url:null}]:[]),...(backlinkStagnating?[{severity:'warning',engine:'distribution',code:'authority_channel_mix_stagnant',title:'Backlink channel mix is stagnant',detail:`${backlinkAttempts7} authority attempts / 7d without a new verified referring domain inside the ${BACKLINK_STAGNATION_HOURS}h stagnation window. The Growth Brain must rotate surface families instead of repeating the same routes.`,url:null}]:[]),...(senderNoOutput24h>=2?[{severity:'warning',engine:'distribution',code:'authority_sender_no_output',title:'Authority sender produced no output',detail:`${senderNoOutput24h} sender handoff(s) in 24h had no executable candidate. These are recorded as no-output cycles and trigger automatic pipeline replenishment.`,url:null}]:[])];
  const healthIssues=[...authorityIssues,...(growthRndUnbound.length?[{severity:'bug',engine:'growth',code:'rnd_experiment_unbound',title:'Growth R&D experiment without source opportunity',detail:`${growthRndUnbound.length} active Growth R&D experiment(s) have no active canonical opportunity to execute. They remain visible as a closed-loop integrity failure.`,url:null}]:[]),...(growthRndContractGaps.length?[{severity:'warning',engine:'growth',code:'rnd_execution_binding_pending',title:'Growth R&D execution binding pending',detail:`${growthRndContractGaps.length} active Growth R&D experiment(s) have source opportunities but no current execution-contract binding. They must not be reported as executing until the contract exists.`,url:null}]:[]),
    ...(n(orphanRoutes?.n)>0?[{severity:'bug',engine:'growth',code:'orphan_alternate_routes',title:'Growth loop orphan routes',detail:`${n(orphanRoutes?.n)} alternate distribution route(s) have no execution-state row. This is a closed-loop failure.`,url:null}]:[]),
    ...(n(emptyOpportunityActions?.n)>0?[{severity:'bug',engine:'growth',code:'opportunity_without_action',title:'Growth opportunity without action',detail:`${n(emptyOpportunityActions?.n)} active growth opportunity record(s) have no action plan.`,url:null}]:[]),
    ...(n(failedCoreRuns?.n)>0?[{severity:'bug',engine:'growth',code:'core_growth_runs_failed',title:'Growth core run failures',detail:`${n(failedCoreRuns?.n)} core Growth/Distribution/Content run(s) failed in the last 24 hours.`,url:null}]:[]),
    ...((growthLoopAgeHours!==null&&growthLoopAgeHours>4)?[{severity:'bug',engine:'growth',code:'growth_coordination_stale',title:'Growth coordination stale',detail:`The last completed opportunity-coordination run is ${growthLoopAgeHours.toFixed(1)} hours old. During active acquisition this must not fail silently.`,url:null}]:[]),
    ...(executionContractState.stalled>0?[{severity:'warning',engine:'growth',code:'execution_contract_stalled',title:'Execution Contract stalled tasks',detail:`${executionContractState.stalled} execution task(s) are stalled and remain visible until reclaimed or explicitly proved.`,url:null}]:[]),
    ...((executionContractState.oldestClaimedAgeHours!==null&&executionContractState.oldestClaimedAgeHours>6)?[{severity:'warning',engine:'growth',code:'execution_claim_stale',title:'Claimed execution task is stale',detail:`The oldest claimed execution task has been waiting ${executionContractState.oldestClaimedAgeHours.toFixed(1)} hours for an executor attempt.`,url:null}]:[]),
    ...((executionContractState.oldestAttemptedAgeHours!==null&&executionContractState.oldestAttemptedAgeHours>24)?[{severity:'warning',engine:'growth',code:'execution_proof_stale',title:'Execution proof is stale',detail:`The oldest attempted execution task has been waiting ${executionContractState.oldestAttemptedAgeHours.toFixed(1)} hours for task-specific proof.`,url:null}]:[]),
    ...(n(staleRouteActions?.n)>0?[{severity:'warning',engine:'growth',code:'stale_route_actions',title:'Alternate route actions stalled',detail:`${n(staleRouteActions?.n)} alternate-route action(s) exceeded their execution/verification window.`,url:null}]:[]),
    ...(n(staleGrowthActions?.n)>0?[{severity:'warning',engine:'growth',code:'stale_growth_actions',title:'Growth actions without outcome',detail:`${n(staleGrowthActions?.n)} growth action(s) have remained prepared/issued/leased for more than 72 hours without a terminal outcome.`,url:null}]:[]),
    ...(growthEffectivenessUnavailable?[{severity:'warning',engine:'growth',code:'growth_effectiveness_unavailable',title:'Growth effectiveness evidence unavailable',detail:'Growth actions are running, but strict-human action attribution could not be computed. The loop is not allowed to report healthy without effectiveness evidence.',url:null}]:[]),
    ...(growthEffectivenessWarning?[{severity:'warning',engine:'growth',code:'growth_actions_no_human_impact',title:'Growth actions without human impact',detail:`${n(actionImpact?.maturedActions)} growth action(s) are at least ${n(actionImpact?.actionMaturityHours)} hours old but have generated 0 strictly attributed human sessions. Execution is healthy, effectiveness is not yet proven.`,url:null}]:[]),
    ...(queue.broken_links||[]).map(x=>({severity:'bug',engine:x.engine||'unknown',code:'broken_human_action_link',title:x.title||x.id||'Human action',detail:x.link_verification?.reason||'ToolScout produced an invalid human-action URL.',url:x.action_url||null})),...(queue.external_verification_issues||[]).map(x=>({severity:'warning',engine:x.engine||'unknown',code:'external_action_verification_unavailable',title:x.title||x.id||'Human action',detail:`External destination could not be machine-verified (${x.link_verification?.reason||'unknown external response'}). This is not classified as an internal ToolScout bug; the distribution engine will re-check and re-discover persistent stale routes.`,url:x.action_url||null})),...(!contentPublishFresh&&contentReportFresh?[{severity:'warning',engine:'content',code:'publishing_heartbeat_partial',title:'Content Engine publishing heartbeat',detail:'Content Intelligence refreshed successfully, but no recent verified content_published event is available in D1. Publishing visibility is partial rather than silently assumed healthy.',url:null}]:[]),...(!audienceConnected?[{severity:'bug',engine:'audience',code:'audience_adapter_unavailable',title:'Audience Engine',detail:stats?.audienceGrowth?.reason||stats?.engagement?.reason||'Audience adapter is not reporting connected state.',url:null}]:[]),...(!seoFresh?[{severity:'warning',engine:'seo-geo-aio',code:'growth_evidence_stale',title:'SEO / GEO / AIO evidence',detail:'One or more daily growth/readiness reports are missing or older than 36 hours.',url:null}]:[]),...(seoFailures>0?[{severity:'bug',engine:'seo-geo-aio',code:'readiness_failures',title:'SEO / GEO / AIO readiness',detail:`${seoFailures} readiness failure(s) are present in the latest validation reports.`,url:null}]:[])];
  const health={content:{status:contentPublishFresh?'observed':(contentReportFresh?'partial':'no_evidence'),last_event_at:latestContentPublish?.last_publish_at||contentIntel?.generatedAt||null,detail:contentPublishFresh?`${n(latestContentPublish?.published_30d)} verified content_published event(s) / 30d`:(contentReportFresh?'Content Intelligence is fresh; publishing heartbeat is only partially observed.':'No fresh Content Engine evidence.')},audience:{status:audienceConnected?'observed':'no_evidence',last_event_at:latestAudienceEvent?.last_event_at||stats?.audienceGrowth?.observedAt||null,detail:audienceConnected?`${n(stats?.audienceGrowth?.publishedReplies)} published replies · ${n(stats?.audienceGrowth?.outboundActions)} outbound actions · ${n(stats?.engagement?.pending)} pending review`:'Audience adapter is not connected.'},seo_geo_aio:{status:seoFailures>0?'failed':(seoFresh?(seoWarnings>0?'warning':'observed'):'no_evidence'),last_event_at:[...seoEvidence].sort((a,b)=>timeMs(b)-timeMs(a))[0]||null,detail:`${n(organicGrowth?.summary?.actionableOpportunities)} actionable search opportunities · ${seoFailures} readiness failures · ${seoWarnings} warnings`,evidence:{gsc:gscReality?.generatedAt||gsc?.generatedAt||null,organic:organicGrowth?.generatedAt||null,aeo_geo:aeoGeo?.generatedAt||null,machine_readability:machineReadability?.generatedAt||null}},catalog:{status:catalogFresh?'observed':'warning',last_event_at:catalogGenerated,detail:`${n(catalogSummary.sourceHealthy)} healthy sources · ${n(catalogSummary.sourceWarnings)} warnings · ${n(catalogSummary.coverageGaps)} coverage gaps · ${n(toolProfileHolds?.count)} profile holds`},issues:healthIssues};
  const autonomousActions=n(externalExecutions?.n),humanInterventions=n(humanEvents?.n),autonomyDenominator=autonomousActions+humanInterventions;
  const observedRouteCount=Math.max(n(contactRouteState?.routes),n(routeActionState?.total));
  const observedRouteSurfaces=Math.max(n(contactRouteState?.surfaces),0);
  const autonomousGrowth={status:'observed',source:'d1_consolidated_growth_truth_v2',window_days:30,active_opportunities:n(growthState?.active),tool_opportunities:n(growthState?.tools),surface_opportunities:n(growthState?.surfaces),affiliate_opportunities:n(growthState?.affiliate),catalog_opportunities:n(growthState?.catalog),news_opportunities:n(growthState?.news),search_opportunities:n(growthState?.search),rnd_experiments:n(growthRnd?.active),rnd_last_evaluated_at:growthRnd?.last_evaluated_at||null,rnd_items:growthRndItems,last_evaluated_at:growthState?.last_evaluated_at||null,autonomous_actions_7d:autonomousActions,external_executions_7d:autonomousActions,internal_cycles_7d:n(internalCycles?.n),human_interventions_7d:humanInterventions,autonomy_rate_pct:autonomyDenominator?Number((autonomousActions/autonomyDenominator*100).toFixed(1)):0,chairman_queue:n(queue.total),contact_routes:observedRouteCount,contact_route_surfaces:observedRouteSurfaces,route_actions_total:n(routeActionState?.total),route_actions_queued:n(routeActionState?.queued),route_actions_in_progress:n(routeActionState?.in_progress),route_actions_verified_human:n(routeActionState?.verified_human),route_actions_verified_placement:n(routeActionState?.verified_placement),route_actions_human:n(routeActionState?.human),route_actions_auth:n(routeActionState?.auth),route_actions_stalled:n(routeActionState?.stalled),route_actions_exhausted:n(routeActionState?.exhausted),supervisor_status:growthSupervisor?.status||'unavailable',supervisor_directive:growthSupervisor?.directive||null,supervisor_strict_humans_24h:n(growthSupervisor?.strict_humans_24h),supervisor_strict_humans_7d:n(growthSupervisor?.strict_humans_7d),supervisor_attributed_humans_7d:n(growthSupervisor?.attributed_humans_7d),supervisor_external_executions_24h:n(growthSupervisor?.external_executions_24h),supervisor_external_executions_7d:n(growthSupervisor?.external_executions_7d),supervisor_corrections:n(growthSupervisor?.correction_count),supervisor_last_correction_at:growthSupervisor?.last_correction_at||null,supervisor_last_evaluated_at:growthSupervisor?.last_evaluated_at||null,loop_status:growthLoopStatus,loop_last_completed_at:growthLoopRun?.last_completed_at||null,loop_age_hours:growthLoopAgeHours,loop_orphan_routes:n(orphanRoutes?.n),loop_stale_route_actions:n(staleRouteActions?.n),loop_stale_growth_actions:n(staleGrowthActions?.n),loop_empty_opportunity_actions:n(emptyOpportunityActions?.n),loop_failed_core_runs_24h:n(failedCoreRuns?.n),execution_contract_integrity:executionContractState.integrity,execution_contract_missing:executionContractState.missing,execution_contract_stalled:executionContractState.stalled,execution_contract_ready:executionContractState.ready,execution_contract_claimed:executionContractState.claimed,execution_contract_attempted:executionContractState.attempted,execution_contract_in_flight:executionContractState.inFlight,execution_contract_deferred:executionContractState.deferred,execution_contract_active_backlog:executionContractState.activeBacklog,execution_contract_oldest_pending_age_hours:executionContractState.oldestPendingAgeHours,execution_contract_oldest_claimed_age_hours:executionContractState.oldestClaimedAgeHours,execution_contract_oldest_attempted_age_hours:executionContractState.oldestAttemptedAgeHours,verified_placements:n(distributionPlacements?.placements),verified_backlinks:n(distributionPlacements?.backlinks),verified_referring_domains:verifiedReferringDomains,backlink_bootstrap_floor:BACKLINK_BOOTSTRAP_FLOOR,backlink_attempt_min_24h:BACKLINK_ATTEMPT_MIN_24H,backlink_attempts_24h:backlinkAttempts24,backlink_attempts_7d:backlinkAttempts7,backlink_authority_queue:backlinkAuthorityQueue,backlink_last_verified_at:authorityMetrics?.last_verified_at||null,backlink_last_verified_age_hours:backlinkLastVerifiedAgeHours,backlink_throughput_gap:backlinkThroughputGap,backlink_stagnating:backlinkStagnating,backlink_stagnation_hours:BACKLINK_STAGNATION_HOURS,sender_no_output_24h:senderNoOutput24h,search_visible_pages:indexedItems.length,sitemap_urls:sitemapUrls,distribution_discovered:n(distCounts.discovered)+n(distCounts.candidate)+n(distCounts.research_required),distribution_ready:n(distCounts.ready_to_submit),distribution_submitted:n(distCounts.submitted)+n(distCounts.pending_review)+n(distCounts.scheduled),backlink_acquisition_required:backlinkRequired,prepared_growth_actions_30d:n(actionImpact?.preparedActions),attributed_growth_actions_30d:n(actionImpact?.attributedActions),attributed_human_sessions_30d:n(actionImpact?.browserConfirmedSessions),attributed_outbound_30d:n(actionImpact?.outboundClicks),attributed_monetized_outbound_30d:n(actionImpact?.monetizedOutbound),action_maturity_hours:n(actionImpact?.actionMaturityHours),matured_growth_actions:n(actionImpact?.maturedActions),matured_attributed_actions:n(actionImpact?.maturedAttributedActions),matured_attributed_human_sessions:n(actionImpact?.maturedBrowserConfirmedSessions),matured_outbound_clicks:n(actionImpact?.maturedOutboundClicks),effectiveness_status:growthEffectivenessUnavailable?'unavailable':(growthEffectivenessWarning?'warning':'observed'),attribution_rule:actionImpact?.attribution||'Exact growth action marker plus browser-confirmed likely-human session. Missing evidence is never counted as impact.'};
  return {chairmanQueue:queue,googleSearchReality:gscReality,autonomousGrowth,engines:{affiliate:{version:'2.1',status:affiliateLatest?'running':'awaiting_strict_evidence',last_run_at:affiliateLatest?.created_at||null,traffic_truth:'browser_confirmed',human_outbound_30d:n(affiliateLatest?.human_outbound_clicks),monetized_outbound_30d:n(affiliateLatest?.monetized_human_outbound_clicks),unmonetized_outbound_30d:n(affiliateLatest?.unmonetized_human_outbound_clicks),weighted_coverage_pct:latestCoverage,coverage_change_7d_pp:latestCoverage!=null&&weekCoverage!=null?Number((latestCoverage-weekCoverage).toFixed(1)):null,recoverable_queue:n(affiliateLatest?.queue_size),workflow_status:affCounts,discovery:{total:n(affiliateDiscovery?.total),qualified:n(affiliateDiscovery?.qualified),human:n(affiliateDiscovery?.human),last_checked:affiliateDiscovery?.last_checked||null},application_packs:{total:n(affiliatePacks?.total),prepared:n(affiliatePacks?.prepared),last_prepared_at:affiliatePacks?.last_prepared_at||null},routes:{total:n(affiliateRoutes?.total),verified:n(affiliateRoutes?.verified),failed:n(affiliateRoutes?.failed),last_verified_at:affiliateRoutes?.last_verified_at||null}},catalog:{version:'1.0',status:catalogFresh?'running':'stale_evidence',tools:n(catalogSummary.tools||catalogHealth?.summary?.tools)+n(catalogRuntimeCandidates?.total),source_healthy:n(catalogRuntimeState?.healthy||catalogSummary.sourceHealthy||catalogHealth?.summary?.sourceLinks?.healthy),source_warnings:n(catalogRuntimeState?.warnings||catalogSummary.sourceWarnings||catalogHealth?.summary?.sourceLinks?.warnings),coverage_gaps:Math.max(n(catalogSummary.coverageGaps||catalogCoverage.filter(x=>n(x.gap)>0).length),n(catalogRuntimeGaps?.total)),content_changes:Math.max(n(catalogChanges.length),n(catalogRuntimeState?.changed)),quarantined:Math.max(n(catalogQuarantined.length),n(catalogRuntimeState?.suppressed)),profile_holds:n(toolProfileHolds?.count),runtime_candidates:n(catalogRuntimeCandidates?.total),active_opportunities:n(growthState?.catalog),recent_admissions:(catalogRecentAdmissions||[]).map(x=>{let e={};try{e=JSON.parse(x.evidence_json||'{}')}catch{}return{slug:x.tool_slug,name:e.name||x.tool_slug,toolscout_url:e.toolscout_url||('/tools/'+x.tool_slug),source_url:e.source_url||null,category:e.category||null,created_at:x.created_at||null,detail:x.detail||null}}),report_age_days:catalogAgeDays,freshness_target_days:7,freshness_status:catalogFresh?'within target':'refresh required',last_runtime_check:catalogRuntimeState?.last_checked_at||null,last_runtime_admission:catalogRuntimeCandidates?.last_admitted_at||null,rule:'Catalog growth is affiliate-neutral. Official-source verification and factual quality gates control admission, suppression and profile refresh; ambiguous changes are flagged rather than silently rewritten; catalog inclusion never implies ranking eligibility.'},distribution:{status:'running',version:'2.2',last_activity_at:distribution24?.last_event_at||distribution7?.last_event_at||null,events_24h:n(distribution24?.events),successful_24h:n(distribution24?.successful),failed_24h:n(distribution24?.failed),events_7d:n(distribution7?.events),successful_7d:n(distribution7?.successful),failed_7d:n(distribution7?.failed),opportunity_status:distCounts,delivery_status:deliveryCounts,network_status:networkCounts,network_candidates:Object.values(networkCounts).reduce((a,b)=>a+n(b),0),network_queued:n(networkCounts.queued),network_contact_found:n(networkCounts.contact_found),network_sent:n(networkCounts.sent),network_adopted:n(networkCounts.adopted),verified_placements:n(distributionPlacements?.placements),verified_backlinks:n(distributionPlacements?.backlinks),attributed_human_sessions_30d:n(stats?.distributionImpact?.humanSessions),attributed_outbound_30d:n(stats?.distributionImpact?.outboundClicks),attributed_monetized_outbound_30d:n(stats?.distributionImpact?.monetizedOutbound)}},footprint:{search:{source:gscReality?.source||'Google Search Console Search Analytics API',observed_pages:indexedItems.length,impressions:gscImpressions,clicks:gscClicks,generated_at:gscReality?.generatedAt||gsc.generatedAt||null,sitemap_urls:sitemapUrls,index_inspected:n(gscReality?.indexHealth?.inspected),index_pass:n(gscReality?.indexHealth?.indexed),index_recovery_candidates:n(gscReality?.indexHealth?.indexRecoveryCandidates),index_discovered_not_indexed:n(gscReality?.indexHealth?.discoveredNotIndexed),index_unknown_to_google:n(gscReality?.indexHealth?.unknownToGoogle),sitemap_redirects:n(gscReality?.indexHealth?.redirected),canonical_mismatches:n(gscReality?.indexHealth?.canonicalMismatches),note:'Search Analytics shows observed Google visibility. URL Inspection separately reports the inspected sample of URLs in the Google index and is not treated as a complete index count unless coverage is 100%.'},distribution:{live_verified:n(distCounts.live)+n(distCounts.verified),submitted_pending:n(distCounts.submitted)+n(distCounts.pending_review)+n(distCounts.scheduled),human_gates:n(distCounts.human_action_required),surfaces:liveSurfaces.map(x=>({slug:x.surface_slug,name:x.surface_name,type:x.surface_type,status:x.status,url:x.live_url||x.action_url||null,score:n(x.distribution_score),updated_at:x.updated_at||null}))}},ledger,health,generated_at:new Date().toISOString()};
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
  const asset=await env.ASSETS.fetch(new Request(new URL('/analytics-v2',request.url).toString(),request));
  if(!asset.ok)return asset;
  const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.append('Set-Cookie',`${SESSION_COOKIE}=${await sessionValue(env.ADMIN_TOKEN,sessionBucket())}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`);
  let html=await asset.text();
  const businessAnchor='<section class="widget" data-widget="chairman"';
  const footprintAnchor='<section class="widget" data-widget="footprint"';
  if(!html.includes('data-widget="business-pulse"'))html=html.replace(businessAnchor,businessPulseWidget()+'\n\n    '+businessAnchor);
  if(!html.includes('data-widget="google-search-reality"'))html=html.replace(businessAnchor,googleSearchRealityWidget()+'\n\n    '+businessAnchor);
  if(!html.includes('data-widget="autonomous-growth"'))html=html.replace(footprintAnchor,autonomousGrowthWidget()+'\n\n    '+footprintAnchor);
  if(!html.includes('data-widget="catalog-growth"'))html=html.replace(footprintAnchor,catalogGrowthWidget()+'\n\n    '+footprintAnchor);
  if(!html.includes('data-widget="affiliate-status"'))html=html.replace(footprintAnchor,affiliateCoverageWidget()+'\n\n    '+footprintAnchor);
  if(!html.includes('data-business-pulse-renderer="v1"'))html=html.replace('</body>',businessPulseScript()+'</body>');
  if(!html.includes('data-google-search-reality-renderer="v1"'))html=html.replace('</body>',googleSearchRealityScript()+'</body>');
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
  await env.DB.prepare(`UPDATE human_gate_contract SET status=?,next_verification_at=CASE WHEN ?='verification_pending' THEN datetime('now') ELSE NULL END,owner_completed_at=CASE WHEN ?='verification_pending' THEN datetime('now') ELSE owner_completed_at END,updated_at=datetime('now') WHERE engine='distribution' AND subject_key=? AND status='open'`).bind(action==='submitted'?'verification_pending':'cancelled',action==='submitted'?'verification_pending':'cancelled',action==='submitted'?'verification_pending':'cancelled',slug).run();
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`human_${crypto.randomUUID()}`,slug,'human_gate_resolved',next,'distribution_engine',nextAction).run();
  return Response.json({ok:true,surface_slug:slug,status:next,resume:'verification_measurement'},{headers:JSON_H});
}

export default {async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='GET'&&analyticsPath(url.pathname))return servePage(request,env,ctx);if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return protectedStats(request,env,ctx);if(request.method==='GET'&&url.pathname==='/analytics/api/chairman-queue'){if(!(await validSession(request,env)))return Response.json({error:'command_center_session_expired'},{status:401,headers:JSON_H});return Response.json(await chairmanQueue(request,env,ctx,{verifyLinks:true}),{headers:JSON_H})}if(request.method==='POST'&&url.pathname==='/analytics/api/distribution-human-action')return distributionHumanAction(request,env);return base.fetch(request,env,ctx)},async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined}};