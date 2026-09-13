import base from './agent-protocol-worker.js';

const AGENTREADY_SURFACE='agentready-index';
const AGENTREADY_MCP='https://www.agentready.it.com/api/mcp';
const AGENTREADY_DIRECTORY='https://www.agentready.it.com/directory';
const WEEKLY_CRON='15 3 * * *';

async function agentReadyDue(env){
  const row=await env.DB.prepare(`SELECT COUNT(*) AS recent FROM distribution_events WHERE surface_slug=?1 AND event_type='automatic_index_refresh' AND status='completed' AND created_at>=datetime('now','-7 days')`).bind(AGENTREADY_SURFACE).first();
  return Number(row?.recent||0)===0;
}

async function recordAgentReadySuccess(env,detail){
  const eventId=`agentready_${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO distribution_opportunities(surface_slug,surface_name,surface_type,audience_fit,authority,traffic_potential,backlink_value,acceptance_probability,automation_potential,effort_cost,distribution_score,status,action_url,live_url,human_required,last_checked_at,next_action,created_at,updated_at) VALUES(?1,'AgentReady','agent_discovery_index_api',94,72,76,70,99,100,5,88,'verified',?2,?3,0,datetime('now'),'Refresh automatically every seven days within the free quota and measure machine discovery value.',datetime('now'),datetime('now')) ON CONFLICT(surface_slug) DO UPDATE SET status='verified',action_url=excluded.action_url,live_url=excluded.live_url,human_required=0,last_checked_at=datetime('now'),next_action=excluded.next_action,updated_at=datetime('now')`).bind(AGENTREADY_SURFACE,AGENTREADY_MCP,AGENTREADY_DIRECTORY),
    env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,destination_url,detail,observed_at,created_at) VALUES(?1,?2,'automatic_index_refresh','completed','product','https://trytoolscout.org/',?3,?4,datetime('now'),datetime('now'))`).bind(eventId,AGENTREADY_SURFACE,AGENTREADY_DIRECTORY,String(detail||'AgentReady accepted the automatic ToolScout index refresh.').slice(0,1000))
  ]);
}

async function recordAgentReadyFailure(env,detail){
  try{
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,asset_type,source_url,destination_url,detail,observed_at,created_at) VALUES(?1,?2,'automatic_index_refresh','failed','product','https://trytoolscout.org/',?3,?4,datetime('now'),datetime('now'))`).bind(`agentready_${crypto.randomUUID()}`,AGENTREADY_SURFACE,AGENTREADY_DIRECTORY,String(detail||'AgentReady refresh failed.').slice(0,1000)).run();
  }catch{}
}

async function refreshAgentReady(env){
  if(!env?.DB||!(await agentReadyDue(env)))return;
  try{
    const response=await fetch(AGENTREADY_MCP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'refresh_site',arguments:{domain:'trytoolscout.org'}}})});
    const text=await response.text();
    let payload=null;try{payload=JSON.parse(text)}catch{}
    if(!response.ok||payload?.error||payload?.result?.isError){
      throw new Error(`AgentReady ${response.status}: ${text.slice(0,600)}`);
    }
    const detail=payload?.result?.content?.map(item=>item?.text).filter(Boolean).join(' ')||'AgentReady accepted the automatic ToolScout index refresh.';
    await recordAgentReadySuccess(env,detail);
  }catch(error){
    await recordAgentReadyFailure(env,String(error?.message||error));
  }
}

export default {
  async fetch(request,env,ctx){return base.fetch(request,env,ctx);},
  async scheduled(event,env,ctx){
    if(base.scheduled)await base.scheduled(event,env,ctx);
    if(event?.cron===WEEKLY_CRON)ctx.waitUntil(refreshAgentReady(env));
  }
};
