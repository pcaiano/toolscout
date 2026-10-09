import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

async function runDecision(name,args,catalog){
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:123,method:'tools/call',params:{
    name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28', 'io.modelcontextprotocol/clientInfo':{name:'qualification-tests',version:'1.0'}}
  }};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{
      'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name
    },body:JSON.stringify(body)}),env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  return (await response.json()).result;
}
const crm=(slug,features,price=8,extra={})=>({
  slug,name:slug,category:'crm',description:'CRM for small businesses',
  features,bestFor:['small business'],scores:{price,ease:price,automation:8,integrations:7},
  ...extra
});

test('hard constraints are admission conditions, not merely negative score modifiers',async()=>{
  const catalog=[
    crm('linux-crm',['crm','Linux'],4),
    crm('other-crm',['crm','automation'],10)
  ];
  const out=await runDecision('decide_software',{job:'CRM',constraints:['must support Linux'],limit:3},catalog);
  assert.equal(out.isError,false);
  assert.deepEqual(out.structuredContent.shortlist.map(x=>x.slug),['linux-crm']);
  assert.equal(out.structuredContent.shortlist[0].qualified_for_use_case,true);
  assert.deepEqual(out.structuredContent.decision_basis.hard_constraints,['must support Linux']);
  const impossible=await runDecision('decide_software',{job:'CRM',constraints:['must support SSO'],limit:3},catalog);
  assert.equal(impossible.isError,true);
  assert.equal(impossible.structuredContent.decision_status,'no_qualified_candidate');
  assert.deepEqual(impossible.structuredContent.shortlist,[]);
});

test('avoid means exclude an evidenced unwanted property',async()=>{
  const out=await runDecision('decide_software',{job:'CRM',avoid:['tracking'],limit:3},[
    crm('tracks-users',['crm','tracking'],10),
    crm('no-tracking-claim',['crm','automation'],5)
  ]);
  assert.equal(out.isError,false);
  assert.deepEqual(out.structuredContent.shortlist.map(x=>x.slug),['no-tracking-claim']);
  // Missing evidence of tracking is not proof of privacy: the API does not claim "no tracking".
  assert.equal(out.structuredContent.shortlist[0].avoid_evidence[0].matched,false);
});

test('contextual comparisons cannot crown a candidate failing mandatory criteria',async()=>{
  const out=await runDecision('compare_for_use_case',{
    tools:['high-score-unqualified','documented-choice'],
    use_case:'CRM for a small business',must_have:['SOC2 certified']
  },[
    crm('high-score-unqualified',['crm','SOC2 dashboard','certified templates'],10),
    crm('documented-choice',['crm','SOC2 certified'],4)
  ]);
  assert.equal(out.isError,false);
  assert.equal(out.structuredContent.verdict.type,'best_fit');
  assert.equal(out.structuredContent.verdict.tool,'documented-choice');
  assert.equal(out.structuredContent.tools.find(x=>x.slug==='high-score-unqualified').qualified_for_use_case,false);
  assert.equal(out.structuredContent.cheaper_option_analysis.qualified_for_use_case,false);
});

test('no qualified comparison produces no invented winner',async()=>{
  const out=await runDecision('compare_for_use_case',{
    tools:['crm-one','crm-two'],use_case:'CRM',must_have:['verified SSO']
  },[crm('crm-one',['crm'],9),crm('crm-two',['crm','automation'],8)]);
  assert.equal(out.isError,false);
  assert.equal(out.structuredContent.verdict.type,'no_qualified_winner');
  assert.ok(out.structuredContent.tools.every(x=>x.qualified_for_use_case===false&&x.blocking_reasons.length));
});

test('alternatives with a free-only budget require an actually confirmed free plan',async()=>{
  const out=await runDecision('find_alternatives',{
    tool:'source-crm',dislike:'too expensive',budget:'free',limit:4
  },[
    crm('source-crm',['crm'],2,{freePlan:false,freePlanKnown:true}),
    crm('unverified-free-crm',['crm'],10,{freePlan:true,freePlanKnown:false}),
    crm('paid-crm',['crm'],9,{freePlan:false,freePlanKnown:true}),
    crm('confirmed-free-crm',['crm'],7,{freePlan:true,freePlanKnown:true})
  ]);
  assert.equal(out.isError,false);
  assert.deepEqual(out.structuredContent.alternatives.map(x=>x.slug),['confirmed-free-crm']);
  assert.equal(out.structuredContent.alternatives[0].free_plan_verified,true);
});
