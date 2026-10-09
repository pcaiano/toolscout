// Read-only MCP buyer decision acceptance against the real Cloudflare Worker.
// Must run after a Workers Builds deployment, not replace its success check.
const BASE=(process.env.TOOLSCOUT_MCP_ORIGIN||'https://trytoolscout.org').replace(/\/$/,'');
const VERSION='2026-07-28';
const MAX_ATTEMPTS=Number(process.env.TOOLSCOUT_MCP_MAX_ATTEMPTS||20);
const RETRY_MS=Number(process.env.TOOLSCOUT_MCP_RETRY_MS||4000);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={checkedAt:new Date().toISOString(),origin:BASE,proof:'read-only external MCP JSON-RPC POST',attempts:0,ok:false,checks:[],errors:[]};
async function rpc(method,params={},id=1){
  const headers={'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache','MCP-Protocol-Version':VERSION,'Mcp-Method':method,'User-Agent':'ToolScout-MCP-Production-Acceptance/1.0'};
  if(method==='tools/call')headers['Mcp-Name']=params.name;
  const res=await fetch(BASE+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':VERSION,'io.modelcontextprotocol/clientInfo':{name:'ToolScout external buyer audit',version:'1.0'}}}}),signal:AbortSignal.timeout(15000)});
  const body=await res.json();
  if(!res.ok||body.jsonrpc!=='2.0'||body.id!==id||body.error)throw Error('MCP '+method+' failed (HTTP '+res.status+', code '+(body.error?.code||'n/a')+')');
  return body.result;
}
function buyerConstraintSatisfied(result,bound,expected){
  if(result.isError||!result.structuredContent||!Array.isArray(result.structuredContent.shortlist))return false;
  const t=result.structuredContent.shortlist.find(x=>x.slug==='webflow');
  if(!t||t.qualified_for_use_case!==true||t.plan_coherence?.selected_plan!=='Site Premium')return false;
  const price=t.constraint_evidence?.find(x=>x.currency==='USD'&&x.plan==='Site Premium'&&x.monthly_equivalent===expected&&x.amount_eur_month===undefined);
  if(!price||price.charge_amount!==expected||price.billing_cycle!=='monthly'||price.unit!=='subscription')return false;
  if(!t.requirement_evidence?.some(x=>x.requirement==='content management system'&&x.status==='verified'))return false;
  return bound>=expected;
}
async function verify(){
  const cardRes=await fetch(BASE+'/.well-known/agent-card.json',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
  if(!cardRes.ok)throw Error('Agent card HTTP '+cardRes.status);
  const card=await cardRes.json();
  if(!Array.isArray(card.supportedInterfaces)||!card.supportedInterfaces.some(x=>x.url===BASE+'/a2a'))throw Error('Missing live A2A agent card binding');
  const listed=await rpc('tools/list',{},40);
  if(!Array.isArray(listed.tools)||!listed.tools.some(t=>t.name==='decide_software'&&t.inputSchema?.properties?.seat_count))throw Error('Live MCP tool registry lacks current seat-aware decide_software schema');
  const args={job:'website',must_have:['content management system'],constraints:['under $40/month billed monthly'],limit:5};
  const qualified=await rpc('tools/call',{name:'decide_software',arguments:args},41);
  if(!buyerConstraintSatisfied(qualified,40,39))throw Error('Webflow monthly Premium plan not verified in live MCP shortlist');
  const serialized=JSON.stringify(qualified);
  if(serialized.includes('https://webflow.com/pricing')||serialized.includes('https://help.webflow.com/hc/en-us/articles/'))throw Error('Manufacturer evidence URLs leaked in MCP output');
  const restrictive=await rpc('tools/call',{name:'decide_software',arguments:{...args,constraints:['under $30/month billed monthly']}},42);
  const leaked=(restrictive.structuredContent?.shortlist||[]).some(x=>x.slug==='webflow');
  if(leaked)throw Error('Webflow Premium feature incorrectly qualified at Basic-only budget');
  const nonEur=await rpc('tools/call',{name:'decide_software',arguments:{...args,constraints:['under €40/month billed monthly']}},43);
  if((nonEur.structuredContent?.shortlist||[]).some(x=>x.slug==='webflow'))throw Error('USD pricing falsely qualified as EUR');
  return {agentCard:true,toolRegistry:true,documentedPaidPlan:true,lowerTierRejected:true,currencyIsolation:true,manufacturerSourcePrivacy:true};
}
for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
  report.attempts=attempt;
  try{
    const checks=await verify();
    report.ok=true;report.checkedAt=new Date().toISOString();report.checks=Object.keys(checks);
    report.errors=[];
    console.log(JSON.stringify(report,null,2));
    break;
  }catch(e){
    const error=String(e?.message||e).slice(0,350);
    report.errors=[{attempt,error}];
    if(attempt<MAX_ATTEMPTS)await sleep(RETRY_MS);
  }
}
if(!report.ok){
  console.error(JSON.stringify(report,null,2));
  process.exitCode=1;
}
