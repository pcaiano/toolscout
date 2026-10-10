import test from 'node:test';
import assert from 'node:assert/strict';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const verifiedAt='2026-10-10';
function crm(slug,{linux=false,tracking=false,free=true,freeKnown=true}={}){
  const host='https://'+slug+'.example';
  return {
    slug,name:slug,category:'crm',description:'CRM for small sales teams',
    features:['crm',...(linux?['Linux']:[]),...(tracking?['tracking']:[])],
    bestFor:['sales teams'],sourceUrl:host,freePlan:free,freePlanKnown:freeKnown,
    scores:{price:7,ease:8,integrations:7,automation:6},
    editorialReview:{verificationStatus:'vendor_documented',sourceUrl:host+'/docs',summary:'Independent buyer assessment backed by vendor documentation.'},
    decisionClaims:linux?[{type:'capability',value:'Linux',status:'verified',plan:'Starter',
      sourceUrl:host+'/docs',verifiedAt}]:[]
  };
}
const rows=[crm('documented-crm',{linux:true}),crm('tracking-crm',{tracking:true}),
  crm('not-evidenced-crm'),crm('unknown-free-crm',{freeKnown:false})];
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
