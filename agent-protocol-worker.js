import base from './command-center-affiliate-table-worker.js';
import { withPrivateAssets } from './private-assets.js';
import { augmentMachineDiscoveryStats, decorateMachineDiscoveryPage, syncAgentReadyVerified } from './machine-discovery-extension.js';

const WATCHLIST_QUEUE_BLOCK=new Set(['airtable','klaviyo']);
const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const HUMAN_DISCOVERY_STATES=new Set(['ready_to_apply','human_action_required']);
const QUALIFIED_EVIDENCE=/(official_publisher_affiliate_program|official_affiliate_watchlist)/i;
const AGENTREADY_CRON='15 3 * * *';

function slugOf(item){return String(item?.id||item?.tool_slug||'').trim().toLowerCase()}
function normalizedUrl(value){try{const u=new URL(String(value||''));if(u.protocol!=='https:')return '';u.hash='';return u.toString().replace(/\/$/,'')}catch{return ''}}
function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/analytics-v2'||path==='/analytics-v2/'||path==='/analytics-v2.html'}

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
  data=await augmentMachineDiscoveryStats(data,env);
  return Response.json(data,{headers:JSON_H});
}

async function filteredChairmanQueue(request,env,ctx){
  const upstream=await base.fetch(request,env,ctx);
  if(!upstream.ok)return upstream;
  let data;try{data=await upstream.json()}catch{return upstream}
  const state=await affiliateAdmissionState(env);
  return Response.json(filterChairmanQueue(data,state),{headers:JSON_H});
}

async function decoratedAnalytics(request,env,ctx){
  return decorateMachineDiscoveryPage(await base.fetch(request,env,ctx));
}

const filteredBase={
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/human-actions')return filteredHumanActions(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return filteredStats(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/chairman-queue')return filteredChairmanQueue(request,env,ctx);
    if(request.method==='GET'&&analyticsPath(url.pathname))return decoratedAnalytics(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const result=base.scheduled?await base.scheduled(event,env,ctx):undefined;
    if(event?.cron===AGENTREADY_CRON)ctx.waitUntil(syncAgentReadyVerified(env));
    return result;
  }
};

export default withPrivateAssets(filteredBase);
