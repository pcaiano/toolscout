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
// OpenAPI is an independently published machine-discovery contract. Schema
// compatibility must be observed at the public edge, not inferred from CI.
let openapiReady=false,openapiAttempts=0;
for(let i=1;i<=15;i++){
  openapiAttempts=i;
  try{
    const response=await request('/openapi.json?decision_contract_probe='+Date.now());
    if(response.ok){
      const document=await response.json();
      const root=document.paths?.['/api/recommend']?.get?.responses?.['200']?.content?.['application/json']?.schema?.properties;
      const entry=root?.recommendations?.items?.properties;
      openapiReady=document.openapi==='3.1.0'&&
        JSON.stringify(entry?.tool_url?.type)===JSON.stringify(['string','null'])&&
        entry?.profile_url?.format==='uri'&&
        root?.recommendation_type?.enum?.includes('decision_shortlist')&&
        entry?.match_type?.enum?.includes('decision_qualified');
      if(openapiReady)break;
    }
  }catch(error){if(i===15)throw Error('Published OpenAPI decision contract cannot be read: '+String(error?.message||error))}
  if(i<15)await sleep(5000);
}
assert(openapiReady,'Published OpenAPI still rejects approved-only nullable product URLs or qualified decisions');
console.log(JSON.stringify({liveOpenApiDecisionContract:true,openapiAttempts,nullableApprovedCommercialVisit:true},null,2));

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
// Prove both sides of commercial routing against the real production Worker.
// These are product facts from the existing affiliate registry, not score inputs:
// HubSpot disabled, Typeform explicitly enabled with an approved HTTPS target.
// Poll for Cloudflare rollout rather than confusing stale edge code with a pass.
let commercialRollout=false;
for(let attempt=1;attempt<=15;attempt++){
  try{
    const unapproved=await rpc('tools/call',{name:'get_tool',arguments:{tool:'hubspot'}});
    const approved=await rpc('tools/call',{name:'get_tool',arguments:{tool:'typeform'}});
    const hub=unapproved.structuredContent?.tool,type=approved.structuredContent?.tool;
    commercialRollout=hub?.tool_url===null&&
      hub?.profile_url==='https://trytoolscout.org/tools/hubspot'&&
      type?.tool_url==='https://trytoolscout.org/go/typeform?source=ai-agent'&&
      type?.profile_url==='https://trytoolscout.org/tools/typeform';
    if(commercialRollout)break;
  }catch(error){if(attempt===15)throw Error('Live approved commerce verification unavailable: '+String(error?.message||error))}
  if(attempt<15)await sleep(5000);
}
assert(commercialRollout,'MCP production still advertises unapproved vendor visits or hides a real approved visit');

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
 assert(candidate.tool_url===null,c.label+' must not invent /go for an unapproved Webflow or HubSpot affiliate');
 assert(candidate.profile_url==='https://trytoolscout.org/tools/'+c.slug,c.label+' must retain canonical ToolScout profile');
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
// Live canary for the specialist-workflow handoff. Previous versions passed
// generic broad-business probes despite omitting a documented specialist job.
// Re-check both the public Finder API and actual MCP network responses after
// bounded Cloudflare rollout. A missing admitted specialist pathway is an
// actionable catalog or deployment regression, never a vacuous green pass.
let specialistHandoff=null,specialistAttempts=0;
for(let i=1;i<=15;i++){
  specialistAttempts=i;
  try{
    const [restaurant,clinic]=await Promise.all([
      liveGuidance('best software for my restaurant'),
      liveGuidance('best software for my veterinary clinic')
    ]);
    if(Array.isArray(restaurant.guidance?.specialist_workflows)&&
      Array.isArray(clinic.guidance?.specialist_workflows)&&
      restaurant.guidance.specialist_workflows.some(w=>w.category==='restaurant-pos')&&
      clinic.guidance.specialist_workflows.some(w=>w.category==='veterinary')){
      specialistHandoff={restaurant,clinic};break;
    }
  }catch(error){if(i===15)throw Error('Live specialist workflow Finder probe unavailable: '+String(error?.message||error))}
  if(i<15)await sleep(5000);
}
assert(specialistHandoff,'Cloudflare still serves the old generic-only workflow response');
for(const [industry,data,category] of [
  ['restaurants',specialistHandoff.restaurant,'restaurant-pos'],
  ['healthcare',specialistHandoff.clinic,'veterinary']
]){
  assert(data.guidance?.industry===industry,'Specialist sector mismatch: '+industry);
  assert(data.recommendations?.length===0,'Broad business query invented a product winner: '+industry);
  assert(data.guidance.workflows?.length===4,'Original four general workflows disappeared: '+industry);
  assert(data.guidance.specialist_workflows.every(w=>
    w.specialist===true&&w.category===category&&w.catalog_coverage>0&&
    w.availability==='documented_specialist_category'&&w.job&&w.finder_url?.startsWith('https://trytoolscout.org/?q=')&&
    w.category_examples?.length>0&&w.category_examples.every(t=>
      t.status==='manufacturer_documented_category_candidate_not_industry_winner'&&
      t.profile_url?.startsWith('https://trytoolscout.org/tools/'))),
      'A specialist workflow bypasses proof gates or advertises unqualified vendors: '+industry);
  assert(!/sourceUrl|\/go\/|pos\.toasttab\.com|squareup\.com|ezyvet\.com/.test(JSON.stringify(data.guidance)),
    'Private manufacturer documentation or unapproved vendor visits leaked: '+industry);
}
for(const [job,guidance]of [
  ['best software for my restaurant',specialistHandoff.restaurant.guidance],
  ['best software for my veterinary clinic',specialistHandoff.clinic.guidance]
]){
  const agent=await rpc('tools/call',{name:'decide_software',arguments:{job,limit:3}});
  assert(agent.isError===false&&agent.structuredContent?.decision_status==='needs_workflow_selection',
    'MCP specialist workflow was replaced by an unqualified industry-wide recommendation: '+job);
  assert(JSON.stringify(agent.structuredContent?.workflow_guidance?.specialist_workflows)===
    JSON.stringify(guidance.specialist_workflows),'Public Finder and MCP disagree on specialist handoffs: '+job);
}
console.log(JSON.stringify({liveSpecialistWorkflowHandoff:true,specialistAttempts,
  restaurantOptions:specialistHandoff.restaurant.guidance.specialist_workflows.map(w=>w.category_examples.map(x=>x.slug)),
  veterinaryOptions:specialistHandoff.clinic.guidance.specialist_workflows.map(w=>w.category_examples.map(x=>x.slug))},null,2));

const aiBusiness=await rpc('tools/call',{name:'decide_software',arguments:{job:'best software for an architecture studio',limit:3}});
assert(aiBusiness.isError===false&&aiBusiness.structuredContent?.decision_status==='needs_workflow_selection','live MCP did not expose universal business guidance');
assert(aiBusiness.structuredContent.workflow_guidance?.industry==='architecture','MCP industry not in parity with Finder');
assert(aiBusiness.structuredContent.shortlist?.length===0,'MCP fabricated industry-wide winner');
const narrow=await liveGuidance('CRM for my marketing agency');
assert(narrow.recommendation_type!=='workflow_guidance'&&narrow.recommendations?.length>0&&narrow.recommendations.every(x=>x.category==='crm'),
  'Specific CRM need was hijacked by marketing-agency industry detection');

// Production proof for the exact Finder/MCP decision parity rollout. A
// passing build and an in-memory test do not prove the new public route is live.
async function liveQualifiedFinder(path){
  const response=await request('/api/recommend?'+path+'&decision_live_probe='+Date.now());
  const payload=await response.json().catch(()=>null);
  return {status:response.status,data:payload};
}
let finderDecisionReady=false,decisionReadyAttempts=0;
for(let i=1;i<=15;i++){
  decisionReadyAttempts=i;
  try{
    const sample=await liveQualifiedFinder('q=CRM&mode=decision&limit=3');
    if(sample.status===200&&sample.data?.recommendation_type==='decision_shortlist'){
      finderDecisionReady=true;break;
    }
  }catch{}
  if(i<15)await sleep(5000);
}
assert(finderDecisionReady,'New Finder decision mode not observed after Cloudflare deployment readiness retries');
const finderQualified=await liveQualifiedFinder('q=CRM&mode=decision&limit=3');
assert(finderQualified.status===200&&finderQualified.data?.decision_status==='qualified_shortlist','Live Finder cannot return qualified buyer decisions');
assert(finderQualified.data?.recommendations?.length>0,'Live decision mode returned an empty qualified CRM list');
const aiQualified=await rpc('tools/call',{name:'decide_software',arguments:{job:'CRM',limit:3}});
assert(aiQualified.isError===false,'MCP cannot return a CRM shortlist for parity comparison');
const finderCandidates=finderQualified.data.recommendations.map(x=>({slug:x.slug,fit:x.match}));
const mcpCandidates=aiQualified.structuredContent.shortlist.map(x=>({slug:x.slug,fit:x.fit_score}));
assert(JSON.stringify(finderCandidates)===JSON.stringify(mcpCandidates),'Live Finder and MCP return different candidates/scores for the identical CRM decision');
assert(finderQualified.data.recommendations.every(x=>{
  const agent=aiQualified.structuredContent.shortlist.find(t=>t.slug===x.slug);
  return x.qualified_for_use_case===true&&Boolean(agent)&&
    x.profile_url===agent.profile_url&&
    x.tool_url===(agent.tool_url?agent.tool_url.split('?')[0]:null);
}), 'Live Finder and MCP disagree on qualified products, profile URLs or approved commercial visits');
assert(!JSON.stringify(finderQualified.data).includes('sourceUrl'),'Live Finder leaked manufacturer evidence URLs');
const impossibleFinder=await liveQualifiedFinder('q=CRM&mode=decision&must_have=ToolScoutUnobtainableProofToken');
assert(impossibleFinder.status===422&&impossibleFinder.data?.decision_status==='no_qualified_candidate'&&
  impossibleFinder.data?.recommendations?.length===0,'Live Finder fabricated a match for an impossible mandatory requirement');
console.log(JSON.stringify({finderDecisionLive:true,decisionReadyAttempts,parityWithMcp:true,matched:finderCandidates.length,hardConstraintFailClosed:true},null,2));

// The Integrity Audit and Cloudflare Workers Build start concurrently. Wait
// for the newly deployed *goal-aware* endpoint, not just the older decision API.
let explicitCrm=null,goalReadyAttempts=0;
for(let i=1;i<=15;i++){
  goalReadyAttempts=i;
  try{
    const sample=await liveQualifiedFinder('q='+encodeURIComponent('software for our team')+'&goal=crm&mode=decision');
    if(sample.status===200&&sample.data?.recommendation_type==='decision_shortlist'&&
      sample.data.recommendations?.length>0&&sample.data.recommendations.every(x=>x.category==='crm')){
      explicitCrm=sample;break;
    }
  }catch{}
  if(i<15)await sleep(5000);
}
assert(explicitCrm,'Explicit Finder CRM goal not live after bounded Cloudflare rollout checks');
const legacyAutomation=await liveQualifiedFinder('q=CRM&mode=decision&priority=automation');
const aiAutomation=await rpc('tools/call',{name:'decide_software',arguments:{job:'CRM',priorities:['automation'],limit:3}});
assert(legacyAutomation.status===200&&aiAutomation.isError===false,'Automation priority decision unavailable');
assert(JSON.stringify(legacyAutomation.data.recommendations.map(x=>[x.slug,x.match]))===
  JSON.stringify(aiAutomation.structuredContent.shortlist.map(x=>[x.slug,x.fit_score])),
  'Legacy Finder priority=automation was not applied using the MCP priority');
const multiPriority=await liveQualifiedFinder('q=CRM&mode=decision&priority=automation&priorities=ease&priorities=price');
const aiMulti=await rpc('tools/call',{name:'decide_software',arguments:{job:'CRM',priorities:['ease','price'],limit:3}});
assert(multiPriority.status===200&&aiMulti.isError===false,'Multi-priority decision unavailable');
assert(JSON.stringify(multiPriority.data.recommendations.map(x=>[x.slug,x.match]))===
  JSON.stringify(aiMulti.structuredContent.shortlist.map(x=>[x.slug,x.fit_score])),
  'Explicit multi-dimensional priorities did not override the legacy single priority');
// A new per-priority policy needs its own canary: mode=decision and
// selected-goal support both existed before the feature-depth safety fix.
let unsupportedFeatures=null,featureReadyAttempts=0;
for(let i=1;i<=15;i++){
  featureReadyAttempts=i;
  try{
    const sample=await liveQualifiedFinder('q=CRM&mode=decision&priority=features');
    if(sample.status===422&&sample.data?.decision_status==='needs_specific_features'&&
      sample.data?.recommendations?.length===0){
      unsupportedFeatures=sample;break;
    }
  }catch{}
  if(i<15)await sleep(5000);
}
assert(unsupportedFeatures,'Feature-depth safety policy did not appear in production after Cloudflare rollout checks');
const aiUnsupportedFeatures=await rpc('tools/call',{name:'decide_software',arguments:{job:'CRM',priorities:['features'],limit:3}});
assert(aiUnsupportedFeatures.isError===true&&aiUnsupportedFeatures.structuredContent?.decision_status==='needs_specific_features',
  'Live MCP must not silently rank on a nonexistent features score');
// Review P1: guided Finder sends legacy priority alone; it must fail closed.
let guidedFeatures=null,guidedReadyAttempts=0;
for(let i=1;i<=15;i++){
  guidedReadyAttempts=i;
  try{
    const sample=await liveQualifiedFinder('q=CRM&goal=crm&priority=features');
    if(sample.status===422&&sample.data?.decision_status==='needs_specific_features'){
      guidedFeatures=sample;break;
    }
  }catch{}
  if(i<15)await sleep(5000);
}
assert(guidedFeatures,'Guided Finder bypassed undocumented feature-depth guard after bounded rollout');
const broadFeatureText=await rpc('tools/call',{name:'decide_software',arguments:{job:'CRM with the best feature depth',limit:3}});
assert(broadFeatureText.isError===true&&broadFeatureText.structuredContent?.decision_status==='needs_specific_features',
  'Free-form MCP feature-depth request silently ranked on an unsupported dimension');
const a2aRequest={jsonrpc:'2.0',id:64,method:'SendMessage',params:{message:{role:'ROLE_USER',
  parts:[{text:'CRM with the best feature depth',mediaType:'text/plain'}]}}};
const a2aResponse=await request('/a2a',{method:'POST',headers:{'Content-Type':'application/json','A2A-Version':'1.0'},body:JSON.stringify(a2aRequest)});
const a2aData=await a2aResponse.json();
assert(a2aResponse.status===200&&a2aData?.result?.message?.parts?.[1]?.data?.decision_status==='needs_specific_features',
  'A2A feature-depth question did not return actionable buyer guidance');
// Verify the Codex P2 remediation against the real deployed Worker, not only
// against an in-memory test fixture. A documented channel quote for Buffer
// must be recognized as a valid pricing unit; another vendor lacking a
// documented matching channel quote must still fail closed.
let reviewedP2Live=false,reviewP2Attempts=0;
for(let attempt=1;attempt<=15;attempt++){
  reviewP2Attempts=attempt;
  try{
    const inquiry={jsonrpc:'2.0',id:82,method:'SendMessage',params:{
      message:{role:'ROLE_USER',parts:[
        {text:'CRM',mediaType:'text/plain'},
        {data:{must_have:['ToolScoutImpossibleVendorCapabilityZ99']},mediaType:'application/json'}
      ]}
    }};
    const response=await request('/a2a',{method:'POST',headers:{
      'Content-Type':'application/json','A2A-Version':'1.0'
    },body:JSON.stringify(inquiry)});
    const payload=await response.json();
    const parts=payload?.result?.message?.parts||[];
    const summary=parts.find(x=>x.mediaType==='text/plain')?.text||'';
    const structured=parts.find(x=>x.mediaType==='application/json')?.data;
    const neutral=response.status===200&&
      structured?.decision_status==='no_qualified_candidate'&&
      structured.shortlist?.length===0&&
      summary.includes('catalog may lack a relevant product')&&
      !summary.includes('because missing manufacturer evidence is not proof');
    const comparison=await rpc('tools/call',{
      name:'compare_for_use_case',
      arguments:{tools:['buffer','hootsuite'],use_case:'social media scheduling',priorities:['price']}
    });
    const cheaper=comparison.structuredContent?.cheaper_option_analysis;
    const safe= comparison.isError===false&&cheaper?.status==='not_comparable'&&
      cheaper.note?.includes('per-channel')&&
      !cheaper.affordability_leader;
    if(neutral&&safe){reviewedP2Live=true;break}
  }catch(error){if(attempt===15)throw Error('Live Codex review regression probe failed: '+String(error?.message||error))}
  if(attempt<15)await sleep(5000);
}
assert(reviewedP2Live,'Merged Codex P2 A2A empty-shortlist and per-channel pricing policy not yet verified live');
console.log(JSON.stringify({codexP2Live:true,reviewP2Attempts,a2aNeutralNoCandidate:true,
  perChannelQuotesRecognizedButMissingComparatorNotInvented:true},null,2));

console.log(JSON.stringify({codexFollowupLive:true,guidedReadyAttempts,freeFormMcp:true,actionableA2A:true},null,2));
console.log(JSON.stringify({finderContextPreservedLive:true,goalReadyAttempts,featureReadyAttempts,selectedGoal:'crm',legacyPriority:'automation',
  explicitPriorities:['ease','price'],mcpParity:true},null,2));


// Read-only live D1 migration truth. An incomplete cycle remains visible as
// incomplete; never infer the imported count from the build or static JSON.
// Cloudflare Workers Build and the separate GitHub Integrity job can race.
// Wait for the *new* read-only schema to be live rather than failing on an
// otherwise healthy earlier production release. Never accept the old schema.
let inventory=null,inventoryAttempts=0;
for(let i=1;i<=18;i++){
  inventoryAttempts=i;
  try{
    const response=await request('/api/catalog-inventory?catalog_migration_probe='+Date.now());
    if(response.ok){
      const current=await response.json();
      if(current?.ok&&current.storage?.primary==='cloudflare_d1'&&
        Number.isInteger(current.storage.baseline_present)&&
        Number.isInteger(current.storage.baseline_revised)){inventory=current;break}
    }
  }catch{}
  if(i<18)await sleep(5000);
}
assert(inventory,'Production catalog inventory did not expose the canonical migration schema after deployment readiness retries');
assert(inventory.ok&&inventory.storage?.primary==='cloudflare_d1','D1 canonical storage contract missing in production');
assert(inventory.storage.baseline_total===127,'Unexpected legacy catalog count, migration may lose or duplicate profiles');
assert(Number.isInteger(inventory.storage.seeded_baseline)&&inventory.storage.seeded_baseline>=0&&inventory.storage.seeded_baseline<=127,'Invalid migrated D1 count');
assert(Number.isInteger(inventory.storage.baseline_present),'Missing canonical D1 migration count');
assert(inventory.storage.baseline_present===inventory.storage.seeded_baseline+inventory.storage.baseline_revised,'D1 baseline and revised product counts differ');
assert(inventory.storage.baseline_remaining===127-inventory.storage.baseline_present,'Migration progress includes revised D1 catalog profiles');
assert(inventory.storage.legacy_html_preserved===true,'Public legacy HTML preservation contract missing');
assert(inventory.total>=127,'Published merged catalog lost a legacy product');
console.log(JSON.stringify({catalogMigrationProductionVerified:true,liveInventorySchemaWaitAttempts:inventoryAttempts,at:new Date().toISOString(),staticBaseline:inventory.storage.baseline_total,seededBaseline:inventory.storage.seeded_baseline,
  remaining:inventory.storage.baseline_remaining,phase:inventory.storage.migration_phase,source:inventory.storage.source,degraded:inventory.storage.degraded,
  publiclyVisibleProducts:inventory.total},null,2));
console.log(JSON.stringify({ok:true,liveNetworkMcpPost:true,base:BASE,method:'tools/call',canaryAfterAttempts:current,positiveDecisions:3,blockedInvalidTier:1,currency:['USD','EUR'],manufacturerSourcesExposed:false,liveBusinessSectors:broadCases.map(x=>x.sector),businessCanaryAfterAttempts:industryAttempts,narrowBusinessJobVerified:true},null,2));


// Live canary for the cost-driven alternatives contract. The public Worker
// must not treat an editorial price score as evidence that a product is cheaper.
let alternativeReady=false,alternativeReadyAttempts=0;
for(let attempt=1;attempt<=15;attempt++){
  alternativeReadyAttempts=attempt;
  try{
    const result=await rpc('tools/call',{name:'find_alternatives',arguments:{
      tool:'hubspot',dislike:'too expensive',limit:2
    }});
    const data=result.structuredContent;
    const prices=(data?.alternatives||[]).map(x=>x.price_comparison?.status);
    const safe= result.isError===false&&
      ['qualified_alternatives','no_verified_alternative'].includes(data?.decision_status)&&
      data?.price_evidence_note?.includes('price score is not price evidence')&&
      prices.every(s=>['documented_lower_unit_price','verified_free_plan_option'].includes(s))&&
      (data.alternatives||[]).every(x=>(x.improvements_over_source||[]).every(d=>d.dimension!=='price'))&&
      !JSON.stringify(data).includes('sourceUrl')&&
      !JSON.stringify(data).includes('hubspot.com/pricing')&&
      data?.source?.slug==='hubspot'&&
      data?.source?.tool_url===null&&
      data?.source?.profile_url==='https://trytoolscout.org/tools/hubspot';
    if(safe){alternativeReady=true;break}
  }catch(error){
    if(attempt===15)throw Error('Live price-evidence alternatives verification failed: '+String(error?.message||error));
  }
  if(attempt<15)await sleep(5000);
}
assert(alternativeReady,'Deployed MCP find_alternatives did not uphold the documented-price-only substitution contract');
console.log(JSON.stringify({liveAlternativesPriceEvidence:true,alternativeReadyAttempts,
  priceScoresNeverProofOfSavings:true,manufacturerSourceUrlsPrivate:true},null,2));
