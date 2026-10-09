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
// The same existing Integrity Audit proves real production responses to
// broad buyer questions after the Cloudflare commit is available at the edge.
// Check this independently from the pricing data cohort above.
const broadCases=[
  {job:'best software to run my restaurant business',sector:'restaurants'},
  {job:'best software for a marketing agency',sector:'marketing_agencies'},
  {job:'best software to run an architecture practice',sector:'architecture'},
  {job:'best software for my dog grooming business',sector:'general_business'}
];
async function liveGuidance(job){
  const response=await request('/api/recommend?q='+encodeURIComponent(job)+'&universal_probe='+Date.now());
  if(!response.ok)throw Error('Finder general job HTTP '+response.status);
  return response.json();
}
let industryAttempts=0;
for(let i=1;i<=15;i++){
  try{
    const data=await liveGuidance(broadCases[0].job);
    if(data.recommendation_type==='workflow_guidance'&&data.guidance?.industry==='restaurants'){
      industryAttempts=i;break;
    }
  }catch(error){if(i===15)throw Error('Live general-business Finder probe unavailable: '+String(error?.message||error))}
  if(i<15)await sleep(5000);
}
assert(industryAttempts>0,'Latest universal business Finder version not observed after deployment checks');
for(const c of broadCases){
  const data=await liveGuidance(c.job);
  assert(data.recommendation_type==='workflow_guidance'&&data.guidance?.industry===c.sector,'wrong live sector interpretation: '+c.sector);
  assert(data.recommendations?.length===0,'live broad request fabricated a cross-category winner: '+c.sector);
  assert(data.guidance.workflows?.length===4,'missing sector-relevant workflow decomposition: '+c.sector);
  assert(data.guidance.workflows.every(w=>w.finder_url?.startsWith('https://trytoolscout.org/?q=')),'AI to Finder handoff links missing: '+c.sector);
  assert(data.guidance.workflows.every(w=>Array.isArray(w.category_examples)&&w.category_examples.every(t=>
    t.profile_url?.startsWith('https://trytoolscout.org/tools/')&&t.status==='category_example_not_industry_qualified')),'unverified or external examples in guidance: '+c.sector);
  assert(!JSON.stringify(data).includes('sourceUrl'),'manufacturer source URLs leaked from business guidance: '+c.sector);
}
const aiBusiness=await rpc('tools/call',{name:'decide_software',arguments:{job:'best software for an architecture studio',limit:3}});
assert(aiBusiness.isError===false&&aiBusiness.structuredContent?.decision_status==='needs_workflow_selection','live MCP did not expose universal business guidance');
assert(aiBusiness.structuredContent.workflow_guidance?.industry==='architecture','MCP industry not in parity with Finder');
assert(aiBusiness.structuredContent.shortlist?.length===0,'MCP fabricated industry-wide winner');
const narrow=await liveGuidance('CRM for my marketing agency');
assert(narrow.recommendation_type!=='workflow_guidance'&&narrow.recommendations?.length>0&&narrow.recommendations.every(x=>x.category==='crm'),
  'Specific CRM need was hijacked by marketing-agency industry detection');

// Read-only live D1 migration truth. An incomplete cycle remains visible as
// incomplete; never infer the imported count from the build or static JSON.
const inventoryResponse=await request('/api/catalog-inventory?catalog_migration_probe='+Date.now());
assert(inventoryResponse.ok,'Production catalog inventory unavailable, HTTP '+inventoryResponse.status);
const inventory=await inventoryResponse.json();
assert(inventory.ok&&inventory.storage?.primary==='cloudflare_d1','D1 canonical storage contract missing in production');
assert(inventory.storage.baseline_total===127,'Unexpected legacy catalog count, migration may lose or duplicate profiles');
assert(Number.isInteger(inventory.storage.seeded_baseline)&&inventory.storage.seeded_baseline>=0&&inventory.storage.seeded_baseline<=127,'Invalid migrated D1 count');
assert(Number.isInteger(inventory.storage.baseline_present),'Missing canonical D1 migration count');
assert(inventory.storage.baseline_present===inventory.storage.seeded_baseline+inventory.storage.baseline_revised,'D1 baseline and revised product counts differ');
assert(inventory.storage.baseline_remaining===127-inventory.storage.baseline_present,'Migration progress includes revised D1 catalog profiles');
assert(inventory.storage.legacy_html_preserved===true,'Public legacy HTML preservation contract missing');
assert(inventory.total>=127,'Published merged catalog lost a legacy product');
console.log(JSON.stringify({catalogMigrationProductionVerified:true,at:new Date().toISOString(),staticBaseline:inventory.storage.baseline_total,seededBaseline:inventory.storage.seeded_baseline,
  remaining:inventory.storage.baseline_remaining,phase:inventory.storage.migration_phase,source:inventory.storage.source,degraded:inventory.storage.degraded,
  publiclyVisibleProducts:inventory.total},null,2));
console.log(JSON.stringify({ok:true,liveNetworkMcpPost:true,base:BASE,method:'tools/call',canaryAfterAttempts:current,positiveDecisions:3,blockedInvalidTier:1,currency:['USD','EUR'],manufacturerSourcesExposed:false,liveBusinessSectors:broadCases.map(x=>x.sector),businessCanaryAfterAttempts:industryAttempts,narrowBusinessJobVerified:true},null,2));
