import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const checked=new Date().toISOString().slice(0,10);
const firstParty=slug=>'https://'+slug+'.example/pricing';
function quote(slug,amount,{currency='EUR',market='unspecified',plan='Starter',billingCycle='monthly'}={}){
  return {type:'price_quote',value:plan+' monthly list price',status:'verified',
    sourceUrl:firstParty(slug),verifiedAt:checked,plan,currency,market,
    taxStatus:'unknown',unit:'subscription',unitQuantity:1,
    billingCycle,amount,chargeAmount:billingCycle==='annual'?amount*12:amount};
}
function crm(slug,{priceScore,amount,currency='EUR',market='unspecified',claims=[]}={}){
  return {slug,name:slug,category:'crm',description:'CRM for small sales teams',
    sourceUrl:'https://'+slug+'.example',features:['crm'],
    bestFor:['small sales teams'],scores:{price:priceScore,ease:priceScore,automation:priceScore,integrations:7},
    editorialReview:{verificationStatus:'vendor_documented',sourceUrl:firstParty(slug)},
    decisionClaims:[...(amount===null?[]:[quote(slug,amount,{currency,market})]),...claims]};
}
async function compare(catalog,must_have=[]){
  const env={ASSETS:{async fetch(req){
    return new URL(req.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404});
  }}};
  const params={name:'compare_for_use_case',arguments:{
    tools:catalog.map(t=>t.slug),use_case:'CRM for a small sales team',
    priorities:['price','ease','automation'],must_have
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
