import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
async function decide(job,constraint,additional={}){
 const env={ASSETS:{fetch:async req=>new URL(req.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
 const input={jsonrpc:'2.0',id:72,method:'tools/call',params:{name:'decide_software',arguments:{job,constraints:[constraint],limit:5,...additional},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'pricing-benchmark',version:'1.0'}}}};
 const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(input)}),env,{waitUntil(){}});
 assert.equal(response.status,200);return (await response.json()).result;
}
const cases=[
 ['Make $15/month','automation','under $15 per month',['make']],
 ['Make $11/month','automation','under $11 per month',[]],
 ['Make USD $13/month','automation','maximum USD 13 per month',['make']],
 ['Make unknown EUR','automation','less than €15/month',[]],
 ['Make unknown GBP','automation','less than £15/month',[]],
 ['Make taxes unknown','automation','under $15/mo including VAT',[]],
 ['Make Portugal checkout unknown','automation','under $15/month in Portugal',[]],
 ['Make EU context unknown','automation','under $15/month in Europe',[]],
 ['Make explicit PT unknown','automation','under $15/month',[],{country:'PT'}],
 ['Make explicit US unknown','automation','under $15/month',[],{country:'US'}],
 ['Make $15 billed monthly','automation','under $15/mo billed monthly',['make']],
 ['Make annual price unknown','automation','under $15/month billed annually',[]],
 ['Buffer one channel monthly','social','under $6/month per channel',['buffer']],
 ['Buffer one channel $5.50 monthly','social','under $5.50/month per channel',[]],
 ['Buffer annual monthly-equivalent','social','under $5.50/month per channel billed annually',['buffer']],
 ['Buffer $60 annual invoice','social','under $60/year per channel',['buffer']],
 ['Buffer $59 annual invoice','social','under $59/year per channel',[]],
 ['Buffer $6 package not 1 channel','social','under $6/month',[]],
 ['Buffer no guessed multi-channel discount','social','under $12/month for 3 channels',[]],
 ['Make ambiguous amount without period','automation','under $15',[]],
 ['Make malformed annual/monthly conflict','automation','under $15/month billed annually billed monthly',[]],
 ['No fake FX on mixed currency','automation','under $15 USD and €20 per month',[]],
];
test('22 real manufacturer price scenarios, currency, billing, unit and country boundaries',async()=>{
 assert.equal(cases.length,22);
 for(const [title,job,constraint,expected,options] of cases){
  const result=await decide(job,constraint,options||{});const names=result.structuredContent?.shortlist?.map(t=>t.slug)||[];
  for(const slug of expected)assert.ok(names.includes(slug),title+' missing '+slug);
  if(!expected.length)assert.equal(names.length,0,title+' must not produce a sourced price-qualified recommendation');
  for(const tool of result.structuredContent?.shortlist||[]){
   const price=tool.constraint_evidence[0];assert.equal(price.status,'verified',title);
   assert.equal(price.currency,'USD',title);
   assert.ok(price.billing_cycle==='monthly'||price.billing_cycle==='annual',title);
   assert.equal(price.market,'unspecified',title);
   assert.equal(price.tax_status,'unknown',title);
   assert.ok(!JSON.stringify(tool).includes('support.buffer.com')&&!JSON.stringify(tool).includes('make.com/en/pricing'),title+' leaked vendor source');
  }
 }
});
test('verified Buffer annual quote preserves actual up-front charge',async()=>{
 const result=await decide('social','under $5.50/month per channel billed annually');
 const entry=result.structuredContent.shortlist.find(x=>x.slug==='buffer').constraint_evidence[0];
 assert.equal(entry.billing_cycle,'annual');assert.equal(entry.charge_amount,60);
 assert.equal(entry.monthly_equivalent,5);assert.equal(entry.unit,'channel');
});
test('Make quoted price is for 10k credits, not proof of another usage tier',()=>{
 const make=catalog.find(x=>x.slug==='make');
 const quotes=make.decisionClaims.filter(c=>c.type==='price_quote');
 assert.equal(quotes.length,3);
 assert.ok(quotes.every(q=>q.usageTier.unit==='credits'&&q.usageTier.quantity===10000&&q.usageTier.period==='month'));
});
test('price evidence never passes a country-restricted buyer requirement on unspecified market',async()=>{
 for(const country of ['PT','GB','US']){
  const result=await decide('automation','under $20/mo',{country});
  assert.equal(result.structuredContent?.decision_status,'no_qualified_candidate',country);
 }
});
