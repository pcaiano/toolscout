import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const verifiedAt=new Date().toISOString().slice(0,10);
function quote(slug,amount,{currency='EUR',market='unspecified',unit='seat',plan='Team',verified=verifiedAt,taxStatus='unknown'}={}){
  return {type:'price_quote',value:'monthly '+plan+' '+unit+' list price',status:'verified',
    verifiedAt:verified,sourceUrl:'https://'+slug+'.example/pricing',plan,currency,market,unit,
    unitQuantity:1,billingCycle:'monthly',taxStatus,amount,chargeAmount:amount,promotion:false};
}
function crm(slug,{priceScore=7,ease=7,amount=null,unit='seat',currency='EUR',
  market='unspecified',verified=verifiedAt,freePlan=false,freePlanKnown=true,
  claims=null,features=['crm'],category='crm'}={}){
  return {slug,name:slug,category,description:'A workflow and customer management application',
    sourceUrl:'https://'+slug+'.example/',features,bestFor:['small businesses'],
    pricing:'Manufacturer terms must be reviewed',freePlan,freePlanKnown,
    scores:{price:priceScore,ease,automation:7,integrations:7},
    decisionClaims:claims|| (amount===null?[]:[quote(slug,amount,{unit,currency,market,verified})])};
}
async function alternatives(catalog,opts={}){
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'
    ?Response.json(catalog):new Response('Not found',{status:404})}};
  const name='find_alternatives',args={tool:catalog[0].slug,dislike:'too expensive',limit:5,...opts};
  const request=new Request('https://trytoolscout.org/mcp',{
    method:'POST',headers:{'Content-Type':'application/json',
      'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{
      name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}
    }})
  });
  const response=await handleAgentProtocolRoute(request,env,{waitUntil(){}});
  assert.equal(response.status,200);
  const result=(await response.json()).result;
  assert.doesNotMatch(JSON.stringify(result),/\\.example\\/pricing/,'Manufacturer source URLs stay internal');
  return result;
}
test('a lower editorial price score does not hide a real documented saving',async()=>{
  const out=await alternatives([
    crm('source',{priceScore:10,amount:30}),
    crm('documented-cheaper',{priceScore:1,amount:12}),
    crm('high-price-score',{priceScore:10,amount:38})
  ],{seat_count:5});
  assert.equal(out.isError,false);
  assert.equal(out.structuredContent.decision_status,'qualified_alternatives');
  assert.deepEqual(out.structuredContent.alternatives.map(x=>x.slug),['documented-cheaper']);
  const item=out.structuredContent.alternatives[0];
  assert.equal(item.price_comparison.status,'documented_lower_unit_price');
  assert.equal(item.price_comparison.source_monthly_unit_price,30);
  assert.equal(item.price_comparison.alternative_monthly_unit_price,12);
  assert.equal(item.price_comparison.savings_per_month_per_quoted_unit,18);
  assert.equal(item.price_comparison.unit,'seat');
  assert.ok(item.improvements_over_source.every(x=>x.dimension!=='price'));
});
test('an attractive price score cannot create a cheaper alternative without two documented quotes',async()=>{
  const out=await alternatives([crm('unknown-original',{priceScore:1}),crm('premium-score',{priceScore:10,amount:10})]);
  assert.equal(out.isError,false);
  assert.equal(out.structuredContent.decision_status,'no_verified_alternative');
  assert.deepEqual(out.structuredContent.alternatives,[]);
  assert.match(out.structuredContent.price_evidence_note,/price score is not price evidence/i);
});
test('mixed currencies, markets and billing units cannot produce claimed cost savings',async()=>{
  for(const alt of [
    crm('usd-option',{priceScore:10,amount:10,currency:'USD'}),
    crm('regional-option',{priceScore:10,amount:10,market:'PT'}),
    crm('channel-option',{priceScore:10,amount:10,unit:'channel'})
  ]){
    const out=await alternatives([crm('source',{amount:30}),alt]);
    assert.equal(out.structuredContent.decision_status,'no_verified_alternative',alt.slug);
    assert.equal(out.structuredContent.alternatives.length,0);
  }
});
test('future or stale manufacturer price quotes cannot establish lower cost',async()=>{
 for(const verified of ['2023-01-01','2099-12-31']){
   const out=await alternatives([crm('source',{amount:30}),crm('expired',{priceScore:10,amount:10,verified})]);
   assert.equal(out.structuredContent.decision_status,'no_verified_alternative',verified);
 }
});
test('matching per-channel rates are compared per channel, not as team invoices',async()=>{
 const out=await alternatives([
   crm('original-channel',{amount:20,unit:'channel'}),
   crm('lower-channel',{priceScore:4,amount:8,unit:'channel'})
 ]);
 const item=out.structuredContent.alternatives[0];
 assert.equal(item.price_comparison.status,'documented_lower_unit_price');
 assert.equal(item.price_comparison.unit,'channel');
 assert.equal(item.price_comparison.savings_per_month_per_quoted_unit,12);
});
test('free budget admits a verified free tier without inventing paid-plan savings',async()=>{
 const out=await alternatives([
   crm('paid-only',{priceScore:1,freePlan:false,freePlanKnown:true}),
   crm('confirmed-free',{priceScore:2,freePlan:true,freePlanKnown:true}),
   crm('unverified-free',{priceScore:10,freePlan:true,freePlanKnown:false}),
   crm('no-free',{priceScore:10,freePlan:false,freePlanKnown:true})
 ],{budget:'free'});
 assert.deepEqual(out.structuredContent.alternatives.map(x=>x.slug),['confirmed-free']);
 assert.equal(out.structuredContent.alternatives[0].price_comparison.status,'verified_free_plan_option');
 assert.match(out.structuredContent.alternatives[0].price_comparison.note,/does not|not inferred/i);
});
test('non-price reasons remain editorial and do not claim vendor capability verification',async()=>{
 const out=await alternatives([
   crm('complex',{ease:2}),
   crm('easy',{ease:9}),
   crm('equally-complex',{ease:2})
 ],{dislike:'too complex'});
 assert.equal(out.structuredContent.decision_status,'qualified_alternatives');
 assert.deepEqual(out.structuredContent.alternatives.map(x=>x.slug),['easy']);
 const item=out.structuredContent.alternatives[0];
 assert.equal(item.reason_addressed_by,'editorial_dimension_only');
 assert.equal(item.price_comparison,null);
 assert.match(item.improvements_over_source[0].evidence_type,/editorial score/i);
});
test('buyer-context inputs require proper types and exact country / seat bounds',async()=>{
 const catalog=[crm('source',{amount:30}),crm('cheaper',{amount:10})];
 for(const opts of [{country:'portugal'},{seat_count:0},{seat_count:200},
   {team:'everyone'},{use_case:''},{require_stack_fit:true}]){
   const out=await alternatives(catalog,opts);
   assert.equal(out.isError,true,JSON.stringify(opts));
 }
 const ok=await alternatives(catalog,{country:'PT',seat_count:5,use_case:'CRM for a Portuguese team'});
 assert.equal(ok.isError,false);
 assert.equal(ok.structuredContent.alternatives.length,0,'Unspecified seller region must not be promoted as a Portugal price');
});
