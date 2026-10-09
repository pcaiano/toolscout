// Read-only production verification. Runs in the existing main-branch Integrity Audit.
// An actual network POST is necessary: CI in-memory Worker tests are not live MCP proof.
const BASE=(process.env.TOOLSCOUT_BASE_URL||'https://trytoolscout.org').replace(/\/$/,'');
const VERSION='2026-07-28';
const expected=[['webflow','Site Premium','USD',25],['hubspot','Starter','EUR',20]];
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function assert(condition,message){if(!condition)throw Error(message)}
const timeoutMs=12000;
async function request(path,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(BASE+path,{signal:controller.signal,cache:'no-store',headers:{'User-Agent':'ToolScout-Decision-MCP-Production-Probe/1.0','Cache-Control':'no-cache',...(options.headers||{})},...options})}
  finally{clearTimeout(timer)}
}
let current=null,ready=false;
for(let attempt=1;attempt<=15;attempt++){
  try{
    const response=await request('/data/tools.json?mcp_evidence_probe='+Date.now());
    if(!response.ok)throw Error('catalog HTTP '+response.status);
    const rows=await response.json();
    const web=rows.find(x=>x.slug==='webflow'),hub=rows.find(x=>x.slug==='hubspot');
    ready=Boolean(web?.decisionClaims?.some(x=>x.type==='price_quote'&&x.plan==='Site Premium'&&x.amount===25)
      &&hub?.decisionClaims?.some(x=>x.type==='price_quote'&&x.currency==='EUR'&&x.plan==='Starter'&&x.amount===20)
      &&web?.decisionClaims?.some(x=>x.type==='price_quote'&&x.plan==='Site Premium'&&x.billingCycle==='monthly'&&x.amount===39));
    if(ready){current=attempt;break}
  }catch(error){if(attempt===15)throw Error('live catalog not queryable after deployment: '+String(error?.message||error))}
  if(attempt<15)await sleep(5000);
}
assert(ready,'Worker assets do not contain the expected new decision price cohort after 15 checks; no live MCP test is claimed');
async function rpc(method,params=null){
 const msg={jsonrpc:'2.0',id:Math.floor(Math.random()*1000000)+1,method,params:params?{...params,_meta:{'io.modelcontextprotocol/protocolVersion':VERSION,'io.modelcontextprotocol/clientInfo':{name:'ToolScout-post-deploy-smoke',version:'1.0'}}}:{_meta:{'io.modelcontextprotocol/protocolVersion':VERSION}}};
 const headers={'Content-Type':'application/json','Accept':'application/json','MCP-Protocol-Version':VERSION,'Mcp-Method':method};
 if(method==='tools/call')headers['Mcp-Name']=params.name;
 const response=await request('/mcp',{method:'POST',headers,body:JSON.stringify(msg)});
 const text=await response.text();
 let data;try{data=JSON.parse(text)}catch{throw Error(method+' returned invalid JSON, HTTP '+response.status)}
 assert(response.status===200,method+' HTTP '+response.status+', RPC error '+JSON.stringify(data.error||{}));
 assert(!data.error,method+' produced JSON-RPC error');
 return data.result;
}
const list=await rpc('tools/list');
const decider=list.tools?.find(t=>t.name==='decide_software');
assert(Boolean(decider?.inputSchema?.properties?.seat_count),'live decide_software schema missing latest seat_count feature');
assert(decider.inputSchema.properties.country,'country-local price verification guard is missing');
const cases=[
 {label:'website CMS monthly $39 current Premium Site',args:{job:'website builder',constraints:['under $40/month billed monthly'],must_have:['content management system'],limit:5},slug:'webflow',plan:'Site Premium',currency:'USD',amount:39,invoice:39},
 {label:'website CMS under 26 USD annual',args:{job:'website builder',constraints:['under $26/month billed annually'],must_have:['content management system'],limit:5},slug:'webflow',plan:'Site Premium',currency:'USD',amount:25,invoice:300},
 {label:'CRM EUR standard list under 25',args:{job:'crm',constraints:['under €25/month per user'],limit:5},slug:'hubspot',plan:'Starter',currency:'EUR',amount:20,invoice:20}
];
for(const c of cases){
 const result=await rpc('tools/call',{name:'decide_software',arguments:c.args});
 assert(result.isError===false,c.label+' not qualified');
 const shortlist=result.structuredContent?.shortlist||[];
 const candidate=shortlist.find(x=>x.slug===c.slug);
 assert(candidate,c.label+' missing '+c.slug);
 assert(candidate.qualified_for_use_case===true,c.label+' not marked qualified');
 const evidence=candidate.constraint_evidence.find(x=>x.currency===c.currency);
 assert(evidence?.status==='verified'&&evidence.plan===c.plan&&evidence.monthly_equivalent===c.amount&&evidence.charge_amount===c.invoice,c.label+' quote/billing mismatch');
 assert(candidate.tool_url?.startsWith('https://trytoolscout.org/go/'),c.label+' missing monetizable ToolScout visit route');
 assert(!JSON.stringify(candidate).includes('sourceUrl')&&!JSON.stringify(candidate).includes('webflow.com/pricing')&&!JSON.stringify(candidate).includes('hubspot.com/pricing'),c.label+' leaked manufacturer documentation');
}
const denied=await rpc('tools/call',{name:'decide_software',arguments:{job:'website builder',constraints:['under $16/month billed annually'],must_have:['content management system'],limit:5}});
assert(denied.isError===true||!denied.structuredContent?.shortlist?.some(x=>x.slug==='webflow'),'live buyer budget incorrectly qualifies Premium at Basic pricing');
console.log(JSON.stringify({ok:true,liveNetworkMcpPost:true,base:BASE,method:'tools/call',canaryAfterAttempts:current,positiveDecisions:3,blockedInvalidTier:1,currency:['USD','EUR'],manufacturerSourcesExposed:false},null,2));
