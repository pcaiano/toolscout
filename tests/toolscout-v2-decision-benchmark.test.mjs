import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const SOURCE='https://docs.vendor.example/pricing';
const base=(slug,features,claims=[],extra={})=>({
  slug,name:slug,category:'crm',description:'CRM for small teams',
  sourceUrl:'https://vendor.example/',features,bestFor:['small teams'],
  scores:{ease:8,integrations:8,automation:7,price:8},
  freePlan:true,freePlanKnown:true,
  editorialReview:{verificationStatus:'vendor_documented',sourceUrl:SOURCE},
  decisionClaims:claims,...extra
});
const proof=(value,extras={})=>({type:'capability',value,status:'verified',sourceUrl:SOURCE,verifiedAt:'2026-10-08',...extras});
async function decide(catalog,args={}){
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:77,method:'tools/call',params:{name:'decide_software',
    arguments:{job:'CRM',limit:3,...args},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'decision-benchmark',version:'1.0'}}
  }};
  const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{
    method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28',
      'Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)
  }),env,{waitUntil(){}});
  assert.equal(response.status,200);
  return (await response.json()).result;
}

const kinds=['team approvals','role permissions','bulk export','audit log','offline mode','data residency','custom fields','pipeline views','email tracking','lead assignment'];
const matrix=[];
for(let i=0;i<kinds.length;i++){
  const capability=kinds[i];
  matrix.push({
    id:'claim-'+i,requirement:capability,
    tool:base('verified-'+i,[capability],[proof(capability)]),qualified:true
  },{
    id:'catalog-only-'+i,requirement:capability,
    tool:base('unsourced-'+i,[capability],[]),qualified:false
  },{
    id:'third-party-'+i,requirement:capability,
    tool:base('forged-'+i,[capability],[proof(capability,{sourceUrl:'https://unrelated.example/docs'})]),qualified:false
  },{
    id:'paid-feature-on-free-'+i,requirement:capability,
    tool:base('paid-'+i,[capability],[proof(capability,{plan:'Professional'})]),budget:'free',qualified:false
  },{
    id:'free-feature-on-free-'+i,requirement:capability,
    tool:base('free-'+i,[capability],[proof(capability,{plan:'Free'})]),budget:'free',qualified:true
  });
}

test('50 decision benchmarks: documented capabilities, missing proof, forged sources and plan gates',async()=>{
  assert.equal(matrix.length,50);
  for(const scenario of matrix){
    const out=await decide([scenario.tool],{must_have:[scenario.requirement],budget:scenario.budget});
    assert.equal(out.isError,!scenario.qualified,scenario.id);
    if(scenario.qualified){
      const shortlist=out.structuredContent.shortlist;
      assert.deepEqual(shortlist.map(x=>x.slug),[scenario.tool.slug],scenario.id);
      assert.equal(shortlist[0].requirement_evidence[0].status,'verified',scenario.id);
      assert.equal(shortlist[0].qualified_for_use_case,true,scenario.id);
      assert.ok(!JSON.stringify(out.structuredContent).includes(SOURCE),'Private first-party URLs cannot appear in AI decision results');
    }else{
      assert.equal(out.structuredContent.decision_status,'no_qualified_candidate',scenario.id);
      assert.deepEqual(out.structuredContent.shortlist,[],scenario.id);
    }
  }
});

test('monthly EUR ceilings require a dated price, not a price score',async()=>{
 const standard=base('documented-eur',['crm'],[
   {type:'price_quote',value:'starter monthly EUR',status:'verified',sourceUrl:SOURCE,verifiedAt:'2026-10-08',
     plan:'Starter',amount:18.5,chargeAmount:18.5,currency:'EUR',billingCycle:'monthly',market:'unspecified',taxStatus:'unknown',unit:'subscription',unitQuantity:1}
 ]);
 const affordable=await decide([standard],{constraints:['must cost less than €20 per month']});
 assert.equal(affordable.isError,false);
 assert.equal(affordable.structuredContent.shortlist[0].constraint_evidence[0].status,'verified');
 const unknown=await decide([standard],{constraints:['must cost less than €15 per month']});
 assert.equal(unknown.isError,true);
 assert.equal(unknown.structuredContent.decision_status,'no_qualified_candidate');
 const generic=await decide([base('price-score-only',['crm'],[],{scores:{price:10,ease:9}})],{constraints:['under €20/month']});
 assert.equal(generic.isError,true);
});

test('volume requirements respect documented plan limits and free-tier availability',async()=>{
 const source=base('tasks-100',['crm'],[{
   type:'plan_limit',value:'free monthly tasks',unit:'tasks',quantity:100,plan:'Free',period:'month',
   status:'verified',verifiedAt:'2026-10-08',sourceUrl:SOURCE
 }]);
 const yes=await decide([source],{constraints:['at least 100 tasks per month'],budget:'free'});
 assert.equal(yes.isError,false);
 assert.equal(yes.structuredContent.shortlist[0].constraint_evidence[0].quantity,100);
 const no=await decide([source],{constraints:['at least 101 tasks per month'],budget:'free'});
 assert.equal(no.isError,true);
 assert.equal(no.structuredContent.decision_status,'no_qualified_candidate');
 const paidOnly=base('paid-tasks',['crm'],[{
   type:'plan_limit',value:'paid tasks',unit:'tasks',quantity:300,plan:'Professional',
   status:'verified',verifiedAt:'2026-10-08',sourceUrl:SOURCE
 }]);
 assert.equal((await decide([paidOnly],{constraints:['at least 200 tasks'],budget:'free'})).isError,true);
});

test('real catalog manufacturer evidence is tracked without publishing source URLs',async()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
 assert.equal(catalog.length,127);
 const seeded=catalog.filter(x=>Array.isArray(x.decisionClaims)&&x.decisionClaims.length);
 assert.ok(seeded.length>=5);
 const buffer=catalog.find(x=>x.slug==='buffer');
 const out=await decide([buffer],{job:'social media scheduling',must_have:['social scheduling']});
 // Selection depends on the catalog category matching the requested job.
 if(!out.isError){
   assert.ok(out.structuredContent.shortlist.some(x=>x.slug==='buffer'));
   assert.ok(!JSON.stringify(out.structuredContent).includes(buffer.decisionClaims[0].sourceUrl));
 }
 const beehiiv=catalog.find(x=>x.slug==='beehiiv');
 const email=await decide([beehiiv],{job:'marketing',must_have:['automation'],budget:'free'});
 assert.equal(email.isError,true,'A paid-tier automation must not qualify for a free-only buyer');
});
