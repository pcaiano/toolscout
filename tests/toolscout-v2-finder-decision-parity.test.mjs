import test from 'node:test';
import assert from 'node:assert/strict';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

// Always within the 180-day manufacturer-evidence validation window.
const verifiedAt=new Date().toISOString().slice(0,10);
function crm(slug,{linux=false,tracking=false,free=true,freeKnown=true,scores={}}={}){
  const host='https://'+slug+'.example';
  return {
    slug,name:slug,category:'crm',description:'CRM for small sales teams',
    features:['crm',...(linux?['Linux']:[]),...(tracking?['tracking']:[])],
    bestFor:['sales teams'],sourceUrl:host,freePlan:free,freePlanKnown:freeKnown,
    scores:{price:7,ease:8,integrations:7,automation:6,features:7,...scores},
    editorialReview:{verificationStatus:'vendor_documented',sourceUrl:host+'/docs',summary:'Independent buyer assessment backed by vendor documentation.'},
    decisionClaims:linux?[{type:'capability',value:'Linux',status:'verified',plan:'Starter',
      sourceUrl:host+'/docs',verifiedAt}]:[]
  };
}
const rows=[crm('documented-crm',{linux:true}),crm('tracking-crm',{tracking:true}),
  crm('not-evidenced-crm'),crm('unknown-free-crm',{freeKnown:false}),
  crm('automation-first-crm',{scores:{automation:10,ease:2,features:3}}),
  crm('ease-first-crm',{scores:{automation:2,ease:10,features:9}})];
const env={ASSETS:{async fetch(request){
  if(new URL(request.url).pathname==='/data/tools.json')return Response.json(rows);
  if(new URL(request.url).pathname==='/data/intents.json')return Response.json([]);
  return new Response('Not found',{status:404});
}}};
async function finder(params){
  const url=new URL('https://trytoolscout.org/api/recommend');
  for(const [name,value] of Object.entries(params)){
    if(Array.isArray(value))for(const part of value)url.searchParams.append(name,part);
    else url.searchParams.set(name,String(value));
  }
  const response=await handleDistributionEmbedRoute(new Request(url),env);
  return {status:response.status,data:await response.json()};
}
async function mcp(args){
  const body={jsonrpc:'2.0',id:23,method:'tools/call',params:{
    name:'decide_software',arguments:args,
    _meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}
  }};
  const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{
    method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28',
      'Mcp-Method':'tools/call','Mcp-Name':'decide_software'},
    body:JSON.stringify(body)
  }),env,{waitUntil(){}});
  assert.equal(response.status,200);
  return (await response.json()).result;
}

test('Finder hard requirements share the exact MCP-qualified shortlist',async()=>{
  const args={job:'CRM',must_have:['Linux'],avoid:['tracking'],limit:3};
  const [web,ai]=await Promise.all([
    finder({q:args.job,mode:'decision',must_have:args.must_have,avoid:args.avoid}),
    mcp(args)
  ]);
  assert.equal(web.status,200);
  assert.equal(web.data.recommendation_type,'decision_shortlist');
  assert.equal(ai.isError,false);
  assert.deepEqual(web.data.recommendations.map(x=>x.slug),ai.structuredContent.shortlist.map(x=>x.slug));
  assert.deepEqual(web.data.recommendations.map(x=>x.match),ai.structuredContent.shortlist.map(x=>x.fit_score));
  assert.deepEqual(web.data.recommendations.map(x=>x.slug),['documented-crm']);
  assert.equal(web.data.recommendations[0].requirement_evidence[0].status,'verified');
  assert.equal(web.data.recommendations[0].qualified_for_use_case,true);
  assert.match(web.data.recommendations[0].tool_url,/^https:\/\/trytoolscout\.org\/go\/documented-crm$/);
  assert.doesNotMatch(JSON.stringify(web.data),/documented-crm\.example|sourceUrl|source_url/);
});

test('An impossible must-have returns no invented recommendation',async()=>{
  const web=await finder({q:'CRM',mode:'decision',must_have:'Verified SSO'});
  assert.equal(web.status,422);
  assert.equal(web.data.decision_status,'no_qualified_candidate');
  assert.deepEqual(web.data.recommendations,[]);
});

test('A required stack integration fails closed without named manufacturer evidence',async()=>{
  const web=await finder({q:'CRM',existing_tools:'Gmail',require_stack_fit:'true'});
  assert.equal(web.status,422);
  assert.deepEqual(web.data.recommendations,[]);
});

test('Price ceilings require verifiable quote and units, not affordability estimates',async()=>{
  const web=await finder({q:'CRM',constraints:'under 15 EUR per month',country:'PT',seat_count:'2'});
  assert.equal(web.status,422);
  assert.equal(web.data.decision_status,'no_qualified_candidate');
});

test('A free-only decision excludes the catalog tool whose Free status is not verified',async()=>{
  const web=await finder({q:'CRM',mode:'decision',budget:'free'});
  assert.equal(web.status,200);
  assert.ok(web.data.recommendations.length>0);
  assert.ok(web.data.recommendations.every(x=>x.slug!=='unknown-free-crm'));
});

test('Malformed or ambiguous buyer inputs are rejected before decision scoring',async()=>{
  const cases=[
    {q:'CRM',must_have:['Linux','']},
    {q:'CRM',require_stack_fit:'true'},
    {q:'CRM',mode:'decision',country:'Portugal'},
    {q:'CRM',mode:'decision',seat_count:'2.5'},
    {q:'CRM',priorities:['price','price']},
    {q:'CRM',constraints:Array(13).fill('mandatory')}
  ];
  for(const query of cases){
    const web=await finder(query);
    assert.equal(web.status,400,JSON.stringify(query));
    assert.equal(web.data.error,'invalid_decision_constraints');
  }
});

test('Explicit category selection survives a generic query and a manufacturer must-have',async()=>{
  const web=await finder({q:'software for our team',goal:'crm',must_have:'Linux'});
  assert.equal(web.status,200);
  assert.equal(web.data.recommendation_type,'decision_shortlist');
  assert.deepEqual(web.data.recommendations.map(t=>t.slug),['documented-crm']);
  assert.ok(web.data.recommendations.every(t=>t.category==='crm'));
  const noGoal=await finder({q:'software for our team',must_have:'Linux'});
  assert.equal(noGoal.status,422,'without a specified job/category we must not invent one');
});

test('User-selected Finder goal is a hard category gate, not a textual suggestion',async()=>{
  const result=await finder({q:'SEO software for our team',goal:'crm',mode:'decision'});
  assert.equal(result.status,200);
  assert.ok(result.data.recommendations.length>0);
  assert.ok(result.data.recommendations.every(t=>t.category==='crm'));
});

test('Legacy Finder priority changes decision ranking and matches explicit MCP priority',async()=>{
  for(const priority of ['automation','ease','integrations']){
    const [web,ai]=await Promise.all([
      finder({q:'CRM',mode:'decision',priority}),
      mcp({job:'CRM',priorities:[priority],limit:3})
    ]);
    assert.equal(web.status,200,priority);
    assert.equal(ai.isError,false,priority);
    assert.deepEqual(web.data.recommendations.map(x=>x.slug),
      ai.structuredContent.shortlist.map(x=>x.slug),priority);
    assert.deepEqual(web.data.recommendations.map(x=>x.match),
      ai.structuredContent.shortlist.map(x=>x.fit_score),priority);
  }
  const automation=await finder({q:'CRM',mode:'decision',priority:'automation'});
  const easy=await finder({q:'CRM',mode:'decision',priority:'ease'});
  assert.equal(automation.data.recommendations[0].slug,'automation-first-crm');
  assert.equal(easy.data.recommendations[0].slug,'ease-first-crm');
});

test('Explicit multi-priorities override the legacy single priority selector',async()=>{
  const [web,ai]=await Promise.all([
    finder({q:'CRM',mode:'decision',priority:'automation',priorities:['ease','price']}),
    mcp({job:'CRM',priorities:['ease','price'],limit:3})
  ]);
  assert.equal(web.status,200);
  assert.equal(ai.isError,false);
  assert.deepEqual(web.data.recommendations.map(x=>x.slug),ai.structuredContent.shortlist.map(x=>x.slug));
  assert.deepEqual(web.data.recommendations.map(x=>x.match),ai.structuredContent.shortlist.map(x=>x.fit_score));
});

test('Non-decision Finder goal and priority still use the original recommendation path',async()=>{
  const web=await finder({q:'CRM',goal:'crm',priority:'automation'});
  assert.equal(web.status,200);
  assert.notEqual(web.data.recommendation_type,'decision_shortlist');
  assert.ok(web.data.recommendations.every(t=>t.category==='crm'));
});

test('Features priority never fabricates unpopulated feature-depth scores',async()=>{
  // None of the real original catalog records had a validated scores.features.
  // Requesting it must be actionable, not a neutral-score alphabetical winner.
  const web=await finder({q:'CRM',mode:'decision',priority:'features'});
  assert.equal(web.status,422);
  assert.equal(web.data.decision_status,'needs_specific_features');
  assert.deepEqual(web.data.recommendations,[]);
  assert.match(web.data.message,/must-have capabilities/i);
  const ai=await mcp({job:'CRM',priorities:['features'],limit:3});
  assert.equal(ai.isError,true);
  assert.equal(ai.structuredContent.decision_status,'needs_specific_features');
  const mixed=await finder({q:'CRM',mode:'decision',priorities:['price','features']});
  assert.equal(mixed.status,422,'do not silently discard an explicitly requested unsupported dimension');
});

test('Guided Finder Advanced features choice fails closed without mode=decision',async()=>{
  const web=await finder({q:'CRM',goal:'crm',priority:'features'});
  assert.equal(web.status,422);
  assert.equal(web.data.decision_status,'needs_specific_features');
  assert.deepEqual(web.data.recommendations,[]);
  const generic=await finder({q:'software for our team',goal:'crm',priority:'features'});
  assert.equal(generic.status,422);
  assert.equal(generic.data.decision_status,'needs_specific_features');
});

test('Free-form feature depth triggers the same documented limitation in MCP',async()=>{
  for(const job of ['CRM with the best feature depth','CRM with advanced features','CRM with the widest feature set']){
    const ai=await mcp({job,limit:3});
    assert.equal(ai.isError,true,job);
    assert.equal(ai.structuredContent?.decision_status,'needs_specific_features',job);
    assert.deepEqual(ai.structuredContent?.shortlist,[],job);
  }
  const specific=await mcp({job:'CRM with Linux support',limit:3});
  assert.notEqual(specific.structuredContent?.decision_status,'needs_specific_features',
    'A named capability must not be mistaken for broad feature-depth ranking');
});

async function a2a(parts){
  const body={jsonrpc:'2.0',id:47,method:'SendMessage',params:{message:{
    role:'ROLE_USER',parts
  }}};
  const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/a2a',{
    method:'POST',headers:{'Content-Type':'application/json','A2A-Version':'1.0'},
    body:JSON.stringify(body)
  }),env,{waitUntil(){}});
  return {status:response.status,data:await response.json()};
}

test('A2A returns actionable feature-breadth guidance rather than internal HTTP 500',async()=>{
  for(const parts of [
    [{text:'CRM',mediaType:'text/plain'},{data:{priorities:['features']},mediaType:'application/json'}],
    [{text:'CRM with the best feature depth',mediaType:'text/plain'}]
  ]){
    const result=await a2a(parts);
    assert.equal(result.status,200);
    assert.ok(result.data.result?.message);
    assert.equal(result.data.error,undefined);
    const [message,structured]=result.data.result.message.parts;
    assert.match(message.text,/exact capabilities|must_have/i);
    assert.equal(structured.data.decision_status,'needs_specific_features');
    assert.deepEqual(structured.data.shortlist,[]);
    assert.doesNotMatch(JSON.stringify(result.data),/DECISION_UNAVAILABLE/);
  }
});
