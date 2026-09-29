const WATCHLIST_QUEUE_BLOCK=new Set(['airtable','klaviyo']);
const HUMAN_DISCOVERY_STATES=new Set(['ready_to_apply','human_action_required']);
const QUALIFIED_EVIDENCE=/(official_publisher_affiliate_program|official_affiliate_watchlist)/i;

const slugOf=item=>String(item?.id||item?.tool_slug||'').trim().toLowerCase();
function normalizedUrl(value){
  try{
    const u=new URL(String(value||''));
    if(u.protocol!=='https:')return'';
    u.hash='';
    return u.toString().replace(/\/$/,'');
  }catch{return''}
}

export async function affiliateChairmanAdmissionState(env){
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
  return{blocked,qualified,approvedNeedsLink};
}

export function affiliateChairmanAllowed(item,state){
  const slug=slugOf(item),status=String(item?.status||'').trim().toLowerCase();
  if(!slug||state.blocked.has(slug))return false;
  if(status==='approved_needs_link')return state.approvedNeedsLink.has(slug);
  if(!HUMAN_DISCOVERY_STATES.has(status))return false;
  const proof=state.qualified.get(slug);
  if(!proof||proof.status!==status)return false;
  return normalizedUrl(item?.action_url)===proof.url;
}

export function filterChairmanQueueAffiliates(queue,state){
  if(!queue||typeof queue!=='object')return queue;
  const items=(Array.isArray(queue.items)?queue.items:[]).filter(item=>item.engine!=='affiliate'||affiliateChairmanAllowed(item,state));
  const broken=(Array.isArray(queue.broken_links)?queue.broken_links:[]).filter(item=>item.engine!=='affiliate'||affiliateChairmanAllowed(item,state));
  const external=(Array.isArray(queue.external_verification_issues)?queue.external_verification_issues:[]).filter(item=>item.engine!=='affiliate'||affiliateChairmanAllowed(item,state));
  return{
    ...queue,
    items,
    broken_links:broken,
    external_verification_issues:external,
    total:items.length,
    estimated_minutes:items.reduce((sum,item)=>sum+Number(item.estimated_minutes||0),0),
    rule:'Affiliate human actions require qualified publisher-affiliate evidence, high-confidence discovery and an exact validated application URL. Watchlist, no-program, rejected and paused states are excluded.'
  };
}
