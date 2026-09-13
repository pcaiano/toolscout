const AGENTREADY_SURFACE='agentready-index';
const AGENTREADY_MCP='https://www.agentready.it.com/api/mcp';
const AGENTREADY_DIRECTORY='https://www.agentready.it.com/directory';
const AGENTREADY_DOMAIN='trytoolscout.org';

const MACHINE_SURFACE_SQL=`(
  LOWER(COALESCE(surface_type,'')) LIKE '%agent%'
  OR LOWER(COALESCE(surface_type,'')) LIKE '%machine%'
  OR LOWER(COALESCE(surface_type,'')) LIKE '%registry%'
  OR LOWER(COALESCE(surface_type,'')) LIKE '%api_directory%'
  OR surface_slug IN ('agenttool-sh','ora-ai','agentready-index','ard-registry','smartbench-ard','neuronto-ard')
)`;
const DIRECTORY_SURFACE_SQL=`(
  LOWER(COALESCE(surface_type,'')) LIKE '%directory%'
  OR LOWER(COALESCE(surface_type,'')) LIKE '%registry%'
  OR LOWER(COALESCE(surface_type,'')) LIKE '%launch%'
)`;

async function dbAll(env,sql){
  try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}
}
async function dbFirst(env,sql){
  try{return await env.DB.prepare(sql).first()}catch{return null}
}
function countStatuses(rows){
  const out={};
  for(const row of rows||[])out[String(row.status||'unknown')]=Number(row.count||0);
  return out;
}

async function snapshot(env){
  const [surfaces,autoAdapters,discoverySources,autoSubmissions,events,directoryCounts]=await Promise.all([
    dbAll(env,`SELECT surface_slug,surface_name,surface_type,status,live_url,action_url,distribution_score,human_required,updated_at FROM distribution_opportunities WHERE ${MACHINE_SURFACE_SQL} ORDER BY CASE WHEN status IN ('verified','live') THEN 0 WHEN status IN ('submitted','pending_review','scheduled') THEN 1 WHEN status='ready_to_submit' THEN 2 ELSE 3 END,distribution_score DESC LIMIT 50`),
    dbAll(env,`SELECT policy_state AS status,COUNT(*) count FROM distribution_auto_adapters GROUP BY policy_state ORDER BY count DESC`),
    dbFirst(env,`SELECT COUNT(*) active_sources,MAX(last_scanned_at) last_scanned_at,SUM(COALESCE(relevant_links_seen,0)) relevant_links_seen FROM distribution_discovery_sources WHERE status='active'`),
    dbAll(env,`SELECT status,COUNT(*) count FROM distribution_submissions WHERE human_required=0 AND (submission_type='auto_discovered_json' OR surface_slug IN ('agenttool-sh','ora-ai','agentready-index','indexnow')) GROUP BY status ORDER BY count DESC`),
    dbAll(env,`SELECT surface_slug,event_type,status,detail,created_at FROM distribution_events WHERE event_type IN ('external_discovery_refresh','autonomous_distribution_qualification','submission_execution_refresh','autonomous_submission_verification','automatic_index_refresh','automatic_index_verification') ORDER BY created_at DESC LIMIT 30`),
    dbFirst(env,`SELECT COUNT(*) total,SUM(CASE WHEN COALESCE(human_required,0)=0 THEN 1 ELSE 0 END) automatic_candidates,SUM(CASE WHEN COALESCE(human_required,0)=0 AND status IN ('ready_to_submit','submitted','verified','live') THEN 1 ELSE 0 END) automatic_pipeline,SUM(CASE WHEN status IN ('verified','live') THEN 1 ELSE 0 END) verified FROM distribution_opportunities WHERE ${DIRECTORY_SURFACE_SQL}`)
  ]);
  const adapterStatus=countStatuses(autoAdapters);
  const submissionStatus=countStatuses(autoSubmissions);
  const verified=surfaces.filter(x=>['verified','live'].includes(String(x.status))).length;
  const submittedPending=surfaces.filter(x=>['ready_to_submit','submitted','pending_review','scheduled'].includes(String(x.status))).length;
  const automatic=surfaces.filter(x=>Number(x.human_required||0)===0).length;
  const agentReady=surfaces.find(x=>x.surface_slug===AGENTREADY_SURFACE)||null;
  return {
    status:'observed',
    verified,
    submitted_pending:submittedPending,
    automatic_surfaces:automatic,
    auto_adapter_status:adapterStatus,
    automatic_submission_status:submissionStatus,
    auto_adapters_verified:Number(adapterStatus.verified||0),
    discovery_sources_active:Number(discoverySources?.active_sources||0),
    discovery_relevant_links_seen:Number(discoverySources?.relevant_links_seen||0),
    last_discovery_scan_at:discoverySources?.last_scanned_at||null,
    last_automatic_event_at:events[0]?.created_at||null,
    directory_discovery:{
      total:Number(directoryCounts?.total||0),
      automatic_candidates:Number(directoryCounts?.automatic_candidates||0),
      automatic_pipeline:Number(directoryCounts?.automatic_pipeline||0),
      verified:Number(directoryCounts?.verified||0)
    },
    agentready:agentReady?{status:agentReady.status,url:agentReady.live_url||agentReady.action_url||AGENTREADY_DIRECTORY,updated_at:agentReady.updated_at||null}:{status:'not_recorded',url:AGENTREADY_DIRECTORY,updated_at:null},
    surfaces:surfaces.map(x=>({slug:x.surface_slug,name:x.surface_name,type:x.surface_type,status:x.status,url:x.live_url||x.action_url||null,score:Number(x.distribution_score||0),automatic:Number(x.human_required||0)===0,updated_at:x.updated_at||null})),
    recent_events:events
  };
}

export async function augmentMachineDiscoveryStats(data,env){
  const machineDiscovery=await snapshot(env);
  const growthOps=data?.growthOps||{};
  return {...data,growthOps:{...growthOps,footprint:{...(growthOps.footprint||{}),machine_discovery:machineDiscovery},engines:{...(growthOps.engines||{}),distribution:{...(growthOps.engines?.distribution||{}),machine_discovery:machineDiscovery}}}};
}

function widget(){
  return `<section class="widget" data-widget="machine-discovery" style="--w:5;--h:5"><div class="widgetHead"><div><div class="widgetKicker">AI and directory footprint</div><div class="widgetTitle">Machine Discovery</div></div><div class="widgetMeta" id="machineDiscoveryMeta">Automatic evidence</div></div><div class="widgetBody" id="machineDiscoveryBody"><div class="empty">Refresh to load machine discovery.</div></div><div class="resizeHandle"></div></section>`;
}
function script(){
  return `<script>(function(){function renderMachineDiscovery(d){const m=d?.growthOps?.footprint?.machine_discovery||{},root=document.getElementById('machineDiscoveryBody'),meta=document.getElementById('machineDiscoveryMeta');if(!root)return;if(meta)meta.textContent=m.last_automatic_event_at?'Active '+dt(m.last_automatic_event_at):'No recent automatic evidence';const dir=m.directory_discovery||{};root.innerHTML='<div class="metricGrid">'+metric('AI surfaces verified',num(m.verified||0),num(m.automatic_surfaces||0)+' machine eligible')+metric('Submitted / pending',num(m.submitted_pending||0),'Awaiting public verification')+metric('Directories found',num(dir.total||0),num(dir.automatic_candidates||0)+' no-human candidates')+metric('Automatic directory pipeline',num(dir.automatic_pipeline||0),num(dir.verified||0)+' verified')+'</div><div style="margin-top:9px">'+row('Discovery sources',num(m.discovery_sources_active||0),m.last_discovery_scan_at?dt(m.last_discovery_scan_at):'No source scan timestamp')+row('Auto adapters verified',num(m.auto_adapters_verified||0),'Discovered submission APIs')+row('AgentReady',m.agentready?.status||'not recorded',m.agentready?.url||'')+'</div><div style="margin-top:8px">'+(m.surfaces||[]).slice(0,8).map(x=>row(x.name||x.slug,x.status,(x.type||'machine surface')+(x.automatic?' · automatic':''))).join('')+'</div>'}const original=window.render;if(typeof original==='function')window.render=function(d){original(d);renderMachineDiscovery(d)};const grid=document.getElementById('grid');if(grid)grid.addEventListener('click',function(e){const w=e.target.closest('.widget[data-widget="machine-discovery"]');if(!w||e.target.closest('a,button,.resizeHandle'))return;const d=typeof snapshot!=='undefined'?snapshot:{},m=d?.growthOps?.footprint?.machine_discovery||{},dir=m.directory_discovery||{};modalRows('Machine Discovery','AI + DIRECTORIES',row('Verified AI surfaces',num(m.verified||0),num(m.automatic_surfaces||0)+' machine eligible')+row('Directories discovered',num(dir.total||0),num(dir.automatic_candidates||0)+' no-human candidates')+row('Automatic directory pipeline',num(dir.automatic_pipeline||0),num(dir.verified||0)+' verified')+row('Active discovery sources',num(m.discovery_sources_active||0),m.last_discovery_scan_at?dt(m.last_discovery_scan_at):'')+row('Verified auto adapters',num(m.auto_adapters_verified||0),'OpenAPI/no-auth submission routes')+(m.surfaces||[]).map(x=>row(x.name||x.slug,x.status,(x.type||'surface')+(x.url?' · URL recorded':''))).join(''))})})();</script>`;
}
export async function decorateMachineDiscoveryPage(response){
  if(!response.ok||!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  let html=await response.text();
  const anchor='<section class="widget" data-widget="footprint"';
  if(!html.includes('data-widget="machine-discovery"'))html=html.replace(anchor,widget()+'\n\n    '+anchor);
  if(!html.includes('renderMachineDiscovery'))html=html.replace('</body>',script()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function resultText(payload){
  const parts=[];
  for(const item of payload?.result?.content||[])if(item?.text)parts.push(String(item.text));
  if(payload?.result?.structuredContent)parts.push(JSON.stringify(payload.result.structuredContent));
  if(payload?.result&&!parts.length)parts.push(JSON.stringify(payload.result));
  return parts.join(' ');
}
function askUrl(text){
  const match=String(text||'').match(/https:\/\/(?:www\.)?agentready\.it\.com\/api\/sites\/[a-z0-9-]+\/ask/i);
  return match?match[0]:null;
}
async function call(name,args){
  const response=await fetch(AGENTREADY_MCP,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'ToolScout Distribution Engine/2.0'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}}),signal:AbortSignal.timeout(70000)});
  const raw=await response.text();
  let payload=null;try{payload=JSON.parse(raw)}catch{}
  if(!response.ok||!payload||payload?.error||payload?.result?.isError)throw new Error(`AgentReady ${name} ${response.status}: ${raw.slice(0,600)}`);
  return {payload,text:resultText(payload)};
}
async function recentRefresh(env){
  try{
    const row=await env.DB.prepare(`SELECT COUNT(*) AS recent FROM distribution_events WHERE surface_slug=?1 AND event_type='automatic_index_refresh' AND status IN ('submitted','completed','verified') AND created_at>=datetime('now','-7 days')`).bind(AGENTREADY_SURFACE).first();
    return Number(row?.recent||0)>0;
  }catch{return false}
}
async function record(env,status,detail,liveUrl=null,eventType='automatic_index_refresh'){
  const eventId=`agentready_${crypto.randomUUID()}`,text=String(detail||'').slice(0,1500);
  if(status==='verified'){
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,live_url,human_required,last_checked_at,next_action,created_at,updated_at) VALUES(?1,'AgentReady','agent_discovery_index_api',94,72,76,70,99,100,5,88,'verified',?2,?3,0,datetime('now'),'Verified in AgentReady. Refresh automatically no more than once every seven days and measure agent discovery value.',datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET status='verified',action_url=excluded.action_url,live_url=COALESCE(excluded.live_url,distribution_opportunities.live_url),human_required=0,last_checked_at=datetime('now'),next_action=excluded.next_action,updated_at=datetime('now')`).bind(AGENTREADY_SURFACE,AGENTREADY_MCP,liveUrl||AGENTREADY_DIRECTORY),
      env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,destination_url,detail,observed_at,created_at) VALUES(?1,?2,?3,'verified','product','https://trytoolscout.org/',?4,?5,datetime('now'),datetime('now'))`).bind(eventId,AGENTREADY_SURFACE,eventType,liveUrl||AGENTREADY_DIRECTORY,text||'AgentReady public index verification confirmed.')
    ]);
    return;
  }
  if(status==='submitted'){
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,live_url,human_required,last_checked_at,next_action,created_at,updated_at) VALUES(?1,'AgentReady','agent_discovery_index_api',94,72,76,70,99,100,5,88,'submitted',?2,NULL,0,datetime('now'),'AgentReady accepted the refresh/index request. Verification will continue automatically without consuming another refresh while the seven-day gate is active.',datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET status=CASE WHEN distribution_opportunities.status IN ('verified','live') THEN distribution_opportunities.status ELSE 'submitted' END,action_url=excluded.action_url,human_required=0,last_checked_at=datetime('now'),next_action=CASE WHEN distribution_opportunities.status IN ('verified','live') THEN distribution_opportunities.next_action ELSE excluded.next_action END,updated_at=datetime('now')`).bind(AGENTREADY_SURFACE,AGENTREADY_MCP),
      env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,destination_url,detail,observed_at,created_at) VALUES(?1,?2,?3,'submitted','product','https://trytoolscout.org/',?4,?5,datetime('now'),datetime('now'))`).bind(eventId,AGENTREADY_SURFACE,eventType,AGENTREADY_DIRECTORY,text||'AgentReady accepted the automatic ToolScout index request.')
    ]);
    return;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,destination_url,detail,observed_at,created_at) VALUES(?1,?2,?3,?4,'product','https://trytoolscout.org/',?5,?6,datetime('now'),datetime('now'))`).bind(eventId,AGENTREADY_SURFACE,eventType,status,AGENTREADY_DIRECTORY,text||`AgentReady ${status}.`).run();
}
async function verify(env){
  const listing=await call('list_sites',{});
  const found=new RegExp(`\\b${AGENTREADY_DOMAIN.replaceAll('.','\\.')}\\b`,'i').test(listing.text);
  if(!found)return false;
  const publicAsk=askUrl(listing.text);
  await record(env,'verified',`AgentReady list_sites includes ${AGENTREADY_DOMAIN}.${publicAsk?` Public ask endpoint: ${publicAsk}`:''}`,publicAsk||AGENTREADY_DIRECTORY,'automatic_index_verification');
  return true;
}
export async function syncAgentReadyVerified(env){
  if(!env?.DB)return;
  try{if(await verify(env))return}catch(error){try{await record(env,'pending',`AgentReady verification check failed: ${String(error?.message||error)}`,null,'automatic_index_verification')}catch{}}
  if(await recentRefresh(env))return;
  try{
    const refresh=await call('refresh_site',{domain:AGENTREADY_DOMAIN});
    await record(env,'submitted',refresh.text||'AgentReady accepted the automatic ToolScout refresh/index request.',null,'automatic_index_refresh');
    try{await verify(env)}catch{}
  }catch(error){try{await record(env,'failed',String(error?.message||error),null,'automatic_index_refresh')}catch{}}
}
