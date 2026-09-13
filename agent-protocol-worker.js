import base from './command-center-affiliate-table-worker.js';
import { withPrivateAssets } from './private-assets.js';

const WATCHLIST_QUEUE_BLOCK=new Set(['airtable','klaviyo']);
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const HUMAN_DISCOVERY_STATES=new Set(['ready_to_apply','human_action_required']);
const QUALIFIED_EVIDENCE=/(official_publisher_affiliate_program|official_affiliate_watchlist)/i;
const AGENTREADY_SURFACE='agentready-index';
const AGENTREADY_MCP='https://www.agentready.it.com/api/mcp';
const AGENTREADY_DIRECTORY='https://www.agentready.it.com/directory';
const AGENTREADY_CRON='15 3 * * *';

function slugOf(item){return String(item?.id||item?.tool_slug||'').trim().toLowerCase()}
function normalizedUrl(value){try{const u=new URL(String(value||''));if(u.protocol!=='https:')return '';u.hash='';return u.toString().replace(/\/$/,'')}catch{return ''}}

async function affiliateAdmissionState(env){
  const blocked=new Set(WATCHLIST_QUEUE_BLOCK),qualified=new Map(),approvedNeedsLink=new Set();
  try{
    const [watchlist,discoveries,approved]=await Promise.all([
      env.DB.prepare(`SELECT tool_slug FROM affiliate_workflow WHERE status IN ('watchlist','no_program_found','rejected','paused')`).all(),
      env.DB.prepare(`SELECT tool_slug,status,application_url,automation_mode,confidence,evidence_json FROM affiliate_program_discovery WHERE status IN ('ready_to_apply','human_action_required')`).all(),
      env.DB.prepare(`SELECT tool_slug FROM affiliate_workflow WHERE status='approved_needs_link'`).all()
    ]);
    for(const row of watchlist?.results||[])blocked.add(String(row.tool_slug||'').trim().toLowerCase());
    for(const row of approved?.results||[])approvedNeedsLink.add(String(row.tool_slug||'').trim().toLowerCase());
    for(const row of discoveries?.results||[]){
      const slug=String(row.tool_slug||'').trim().toLowerCase();
      const status=String(row.status||'').trim().toLowerCase();
      const url=normalizedUrl(row.application_url);
      const human=String(row.automation_mode||'').trim().toLowerCase()==='human';
      const confidence=Number(row.confidence||0);
      const evidence=String(row.evidence_json||'');
      if(slug&&HUMAN_DISCOVERY_STATES.has(status)&&human&&confidence>=90&&url&&QUALIFIED_EVIDENCE.test(evidence))qualified.set(slug,{status,url});
    }
  }catch{}
  return {blocked,qualified,approvedNeedsLink};
}

function affiliateAllowed(item,state){
  const slug=slugOf(item),status=String(item?.status||'').trim().toLowerCase();
  if(!slug||state.blocked.has(slug))return false;
  if(status==='approved_needs_link')return state.approvedNeedsLink.has(slug);
  if(!HUMAN_DISCOVERY_STATES.has(status))return false;
  const proof=state.qualified.get(slug);
  if(!proof||proof.status!==status)return false;
  return normalizedUrl(item?.action_url)===proof.url;
}

function filterHumanActionData(data,state){
  const affiliate=(Array.isArray(data?.affiliate)?data.affiliate:[]).filter(item=>affiliateAllowed(item,state));
  const distribution=Array.isArray(data?.distribution)?data.distribution:[];
  return {...data,affiliate,distribution,total:affiliate.length+distribution.length};
}

function filterChairmanQueue(queue,state){
  if(!queue||typeof queue!=='object')return queue;
  const items=(Array.isArray(queue.items)?queue.items:[]).filter(item=>item.engine!=='affiliate'||affiliateAllowed(item,state));
  const broken=(Array.isArray(queue.broken_links)?queue.broken_links:[]).filter(item=>item.engine!=='affiliate'||affiliateAllowed(item,state));
  const external=(Array.isArray(queue.external_verification_issues)?queue.external_verification_issues:[]).filter(item=>item.engine!=='affiliate'||affiliateAllowed(item,state));
  return {...queue,items,broken_links:broken,external_verification_issues:external,total:items.length,estimated_minutes:items.reduce((sum,item)=>sum+Number(item.estimated_minutes||0),0),rule:'Affiliate human actions require qualified publisher-affiliate evidence, high-confidence discovery and an exact validated application URL. Watchlist, no-program, rejected and paused states are excluded.'};
}

async function trafficTruth(request,env){
  try{
    const response=await env.ASSETS.fetch(new Request(new URL('/data/traffic-truth.json',request.url)));
    return response.ok?await response.json():{status:'unavailable',reason:`traffic truth asset ${response.status}`};
  }catch(error){return {status:'unavailable',reason:String(error?.message||error)}}
}

async function filteredHumanActions(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return upstream}
  const state=await affiliateAdmissionState(env);
  return Response.json(filterHumanActionData(data,state),{headers:JSON_H});
}

async function filteredStats(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return upstream}
  const [state,truth]=await Promise.all([affiliateAdmissionState(env),trafficTruth(request,env)]);
  if(data?.growthOps?.chairmanQueue){
    data={...data,growthOps:{...data.growthOps,chairmanQueue:filterChairmanQueue(data.growthOps.chairmanQueue,state)}};
  }
  data={...data,trafficTruth:truth,trafficIntegrity:{...(data.trafficIntegrity||{}),crossSourceStatus:truth?.reconciliation?.status||truth?.status||'unavailable',cloudflareRumStatus:truth?.cloudflareRum?.status||'unavailable',googleSearchConsoleStatus:truth?.googleSearchConsole?.status||'unavailable',truthGeneratedAt:truth?.generatedAt||null}};
  return Response.json(data,{headers:JSON_H});
}

async function filteredChairmanQueue(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return upstream}
  const state=await affiliateAdmissionState(env);
  return Response.json(filterChairmanQueue(data,state),{headers:JSON_H});
}

async function agentReadyDue(env){
  try{
    const row=await env.DB.prepare(`SELECT COUNT(*) AS recent FROM distribution_events WHERE surface_slug=?1 AND event_type='automatic_index_refresh' AND status='completed' AND created_at>=datetime('now','-7 days')`).bind(AGENTREADY_SURFACE).first();
    return Number(row?.recent||0)===0;
  }catch{return false}
}

async function recordAgentReady(env,status,detail){
  const eventId=`agentready_${crypto.randomUUID()}`;
  if(status==='completed'){
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,live_url,human_required,last_checked_at,next_action,created_at,updated_at) VALUES(?1,'AgentReady','agent_discovery_index_api',94,72,76,70,99,100,5,88,'verified',?2,?3,0,datetime('now'),'Refresh automatically every seven days within the free quota and measure machine discovery value.',datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET status='verified',action_url=excluded.action_url,live_url=excluded.live_url,human_required=0,last_checked_at=datetime('now'),next_action=excluded.next_action,updated_at=datetime('now')`).bind(AGENTREADY_SURFACE,AGENTREADY_MCP,AGENTREADY_DIRECTORY),
      env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,destination_url,detail,observed_at,created_at) VALUES(?1,?2,'automatic_index_refresh',?3,'product','https://trytoolscout.org/',?4,?5,datetime('now'),datetime('now'))`).bind(eventId,AGENTREADY_SURFACE,status,AGENTREADY_DIRECTORY,String(detail||'AgentReady accepted the automatic ToolScout index refresh.').slice(0,1000))
    ]);
    return;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,destination_url,detail,observed_at,created_at) VALUES(?1,?2,'automatic_index_refresh',?3,'product','https://trytoolscout.org/',?4,?5,datetime('now'),datetime('now'))`).bind(eventId,AGENTREADY_SURFACE,status,AGENTREADY_DIRECTORY,String(detail||'AgentReady refresh failed.').slice(0,1000)).run();
}

async function refreshAgentReady(env){
  if(!env?.DB||!(await agentReadyDue(env)))return;
  try{
    const response=await fetch(AGENTREADY_MCP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'refresh_site',arguments:{domain:'trytoolscout.org'}}})});
    const text=await response.text();
    let payload=null;try{payload=JSON.parse(text)}catch{}
    if(!response.ok||payload?.error||payload?.result?.isError)throw new Error(`AgentReady ${response.status}: ${text.slice(0,600)}`);
    const detail=payload?.result?.content?.map(item=>item?.text).filter(Boolean).join(' ')||'AgentReady accepted the automatic ToolScout index refresh.';
    await recordAgentReady(env,'completed',detail);
  }catch(error){
    try{await recordAgentReady(env,'failed',String(error?.message||error))}catch{}
  }
}

const filteredBase={
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/human-actions')return filteredHumanActions(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return filteredStats(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/chairman-queue')return filteredChairmanQueue(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const result=base.scheduled?await base.scheduled(event,env,ctx):undefined;
    if(event?.cron===AGENTREADY_CRON)ctx.waitUntil(refreshAgentReady(env));
    return result;
  }
};

export default withPrivateAssets(filteredBase);
