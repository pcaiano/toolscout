import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const checked=new Date().toISOString().slice(0,10);
const firstParty=slug=>'https://'+slug+'.example/pricing';
function quote(slug,amount,{currency='EUR',market='unspecified',plan='Starter',billingCycle='monthly',unit='subscription'}={}){
  return {type:'price_quote',value:plan+' monthly list price',status:'verified',
    sourceUrl:firstParty(slug),verifiedAt:checked,plan,currency,market,
    taxStatus:'unknown',unit,unitQuantity:1,
    billingCycle,amount,chargeAmount:billingCycle==='annual'?amount*12:amount};
}
function crm(slug,{priceScore,amount,currency='EUR',market='unspecified',unit='subscription',claims=[]}={}){
  return {slug,name:slug,category:'crm',description:'CRM for small sales teams',
    sourceUrl:'https://'+slug+'.example',features:['crm'],
    bestFor:['small sales teams'],scores:{price:priceScore,ease:priceScore,automation:priceScore,integrations:7},
    editorialReview:{verificationStatus:'vendor_documented',sourceUrl:firstParty(slug)},
    decisionClaims:[...(amount===null?[]:[quote(slug,amount,{currency,market,unit})]),...claims]};
}
async function compare(catalog,must_have=[],extras={}){
  const env={ASSETS:{async fetch(req){
    return new URL(req.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404});
  }}};
  const params={name:'compare_for_use_case',arguments:{
    tools:catalog.map(t=>t.slug),use_case:'CRM for a small sales team',
    priorities:['price','ease','automation'],must_have,...extras
  },_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}};
  const request=new Request('https://trytoolscout.org/mcp',{
    method:'POST',headers:{'Content-Type':'application/json',
      'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call',
      'Mcp-Name':'compare_for_use_case'},
    body:JSON.stringify({jsonrpc:'2.0',id:80,method:'tools/call',params})
  });
  const response=await handleAgentProtocolRoute(request,env,{waitUntil(){}});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.result.isError,false);
  assert.doesNotMatch(JSON.stringify(body.result.structuredContent),/\\.example\\/pricing/);
  return body.result.structuredContent;
}
test('cheapest documented price wins even when editorial price scores suggest the opposite',async()=>{
  const result=await compare([
    crm('lower-price',{priceScore:3,amount:12}),
    crm('higher-price',{priceScore:10,amount:29})
  ]);
  const resultPrice=result.cheaper_option_analysis;
  assert.equal(resultPrice.status,'documented_price_comparison');
  assert.equal(resultPrice.affordability_leader,'lower-price');
  assert.equal(resultPrice.monthly_list_price,12);
  assert.equal(resultPrice.currency,'EUR');
  assert.equal(resultPrice.compared_plan,'Starter');
  assert.equal(result.verdict.tool,'higher-price');
  assert.ok(resultPrice.what_you_may_lose_vs_best_fit.every(x=>x.evidence_type.includes('editorial')));
});
test('missing or mismatched official prices never manufacture a cheaper alternative',async()=>{
  const missing=await compare([
    crm('quoted',{priceScore:3,amount:12}),
    crm('unpriced',{priceScore:10,amount:null})
  ]);
  assert.equal(missing.cheaper_option_analysis.status,'not_comparable');
  assert.equal(missing.cheaper_option_analysis.affordability_leader,undefined);
  const currency=await compare([
    crm('euro-vendor',{priceScore:3,amount:12}),
    crm('dollar-vendor',{priceScore:10,amount:11,currency:'USD'})
  ]);
  assert.equal(currency.cheaper_option_analysis.status,'not_comparable');
  const country=await compare([
    crm('local-vendor',{priceScore:3,amount:12,market:'PT'}),
    crm('global-vendor',{priceScore:10,amount:10})
  ]);
  assert.equal(country.cheaper_option_analysis.status,'not_comparable');
});
test('a lower price for the wrong feature tier is not compared as eligible',async()=>{
  const capability=slug=>({type:'capability',value:'audit log',status:'verified',
    sourceUrl:firstParty(slug),verifiedAt:checked,plan:'Pro'});
  const specialized=crm('specialized',{priceScore:10,amount:6,
    claims:[capability('specialized'),quote('specialized',24,{plan:'Pro'})]});
  const standard=crm('standard',{priceScore:5,amount:18,
    claims:[capability('standard'),quote('standard',18,{plan:'Pro'})]});
  const result=await compare([specialized,standard],['audit log']);
  assert.equal(result.cheaper_option_analysis.status,'documented_price_comparison');
  assert.equal(result.cheaper_option_analysis.affordability_leader,'standard');
  assert.equal(result.cheaper_option_analysis.compared_plan,'Pro');
});

test('two documented per-seat prices produce a labelled five-seat pre-tax subtotal',async()=>{
  const result=await compare([
    crm('low-seat',{priceScore:3,amount:12,unit:'seat'}),
    crm('high-seat',{priceScore:10,amount:18,unit:'seat'})
  ],[],{seat_count:5});
  const price=result.cheaper_option_analysis;
  assert.equal(price.status,'documented_price_comparison');
  assert.equal(price.affordability_leader,'low-seat');
  assert.equal(price.unit,'seat');
  assert.equal(price.monthly_list_price,12,'unit price must remain per billed seat');
  assert.equal(price.seat_count,5);
  assert.equal(price.seat_monthly_subtotal_before_tax,60);
  assert.match(price.note,/not a verified final invoice/i);
});
test('per-seat monthly list price can be compared without assuming five seats',async()=>{
  const result=await compare([
    crm('a-seat',{priceScore:10,amount:18,unit:'seat'}),
    crm('b-seat',{priceScore:5,amount:14,unit:'seat'})
  ]);
  assert.equal(result.cheaper_option_analysis.status,'documented_price_comparison');
  assert.equal(result.cheaper_option_analysis.affordability_leader,'b-seat');
  assert.equal(result.cheaper_option_analysis.seat_monthly_subtotal_before_tax,null);
});
test('territory and incompatible units cannot be silently normalized',async()=>{
  const sample=[
    crm('euro-pt',{priceScore:10,amount:15,unit:'seat',market:'PT'}),
    crm('euro-pt-two',{priceScore:5,amount:20,unit:'seat',market:'PT'})
  ];
  assert.equal((await compare(sample,[],{seat_count:4,country:'PT'})).cheaper_option_analysis.seat_monthly_subtotal_before_tax,60);
  assert.equal((await compare(sample,[],{seat_count:4,country:'US'})).cheaper_option_analysis.status,'not_comparable');
  assert.equal((await compare(sample)).cheaper_option_analysis.status,'not_comparable');
  const mixed=await compare([
    crm('flat-fee',{priceScore:10,amount:10,unit:'subscription'}),
    crm('per-seat',{priceScore:5,amount:12,unit:'seat'})
  ]);
  assert.equal(mixed.cheaper_option_analysis.status,'not_comparable');
  const unlicensed=await compare([
    crm('flat-one',{priceScore:10,amount:10,unit:'subscription'}),
    crm('flat-two',{priceScore:5,amount:12,unit:'subscription'})
  ],[],{seat_count:6});
  assert.equal(unlicensed.cheaper_option_analysis.status,'not_comparable',
    'a single subscription is not evidence of the price for six seats');
});
