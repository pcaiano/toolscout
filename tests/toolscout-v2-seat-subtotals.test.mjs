import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
async function run(extra={}){
 const env={ASSETS:{fetch:async req=>new URL(req.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
 const request=new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify({jsonrpc:'2.0',id:122,method:'tools/call',params:{name:'decide_software',arguments:{job:'business',limit:5,...extra}}})});
 const reply=await handleAgentProtocolRoute(request,env,{waitUntil(){}});
 assert.equal(reply.status,200);
 return (await reply.json()).result;
}
const selected=(r,slug)=>r.structuredContent?.shortlist?.find(x=>x.slug===slug)||null;
const cases=[
 ['ClickUp Unlimited monthly', {constraints:['under $11/month per user'],must_have:['unlimited spaces']},'clickup','Unlimited',10],
 ['ClickUp Business timeline cannot use Unlimited price',{constraints:['under $11/month per user'],must_have:['timeline views']},'clickup',null,null],
 ['ClickUp Business supports timeline at published price',{constraints:['under $20/month per user'],must_have:['timeline views']},'clickup','Business',19],
 ['ClickUp yearly Unlimited Gantt',{constraints:['under $8/month per user billed annually'],must_have:['gantt charts']},'clickup','Unlimited',7],
 ['ClickUp three seats subtotal Business',{constraints:['under $60/month subscription subtotal for 3 billed seats'],must_have:['google sso']},'clickup','Business',19],
 ['ClickUp three seats below Business price',{constraints:['under $56/month subscription subtotal for 3 billed seats'],must_have:['google sso']},'clickup',null,null],
 ['Airtable Team cheap Gantt',{constraints:['under $25/month per user'],must_have:['gantt views']},'airtable','Team',24],
 ['Airtable Business two-way sync cannot use Team quote',{constraints:['under $25/month per user'],must_have:['two-way sync']},'airtable',null,null],
 ['Airtable Business two-way sync at actual price',{constraints:['under $55/month per user'],must_have:['two-way sync']},'airtable','Business',54],
 ['Airtable 100k records/base requires Business',{constraints:['under $55/month per user','at least 100000 records per base']},'airtable','Business',54],
 ['Airtable 100k records/base not on Team',{constraints:['under $25/month per user','at least 100000 records per base']},'airtable',null,null],
 ['Asana Starter Gantt monthly',{constraints:['under $14/month per user'],must_have:['gantt view']},'asana','Starter',13.49],
 ['Asana Advanced portfolios not Starter',{constraints:['under $14/month per user'],must_have:['portfolios']},'asana',null,null],
 ['Asana Advanced portfolios monthly',{constraints:['under $31/month per user'],must_have:['portfolios']},'asana','Advanced',30.49],
 ['Asana Advanced annual portfolios',{constraints:['under $25/month per user billed annually'],must_have:['portfolios']},'asana','Advanced',24.99],
 ['Asana Starter 3 billed seats subtotal',{constraints:['under $41/month subscription subtotal for 3 billed seats'],must_have:['gantt view']},'asana','Starter',13.49],
 ['Asana 3 billed seats lacks Advanced portfolios under $41',{constraints:['under $41/month subscription subtotal for 3 billed seats'],must_have:['portfolios']},'asana',null,null],
 ['Airtable Team 3 billed seats subtotal',{constraints:['under $75/month subscription subtotal for 3 billed seats'],must_have:['gantt views']},'airtable','Team',24],
 ['Airtable Business 3 billed seats subtotal',{constraints:['under $165/month subscription subtotal for 3 billed seats'],must_have:['two-way sync']},'airtable','Business',54],
 ['No unknown tax inclusive totals',{constraints:['under $35/month total for 3 users'],must_have:['google sso']},'clickup',null,null],
 ['No unexplained multi-seat list-price extrapolation',{constraints:['under $40/month for 3 users'],must_have:['google sso']},'clickup',null,null],
 ['No unspecified seat subtotal',{constraints:['under $40/month subscription subtotal'],must_have:['google sso']},'clickup',null,null],
 ['Explicit seat_count matches constraint',{constraints:['under $60/month subscription subtotal for 3 billed seats'],must_have:['google sso'],seat_count:3},'clickup','Business',19],
 ['Conflicting seat_count cannot qualify',{constraints:['under $60/month subscription subtotal for 3 billed seats'],must_have:['google sso'],seat_count:2},'clickup',null,null],
 ['Unknown EUR quotes do not qualify',{constraints:['under €50/month per user'],must_have:['google sso']},'clickup',null,null],
 ['Unknown country quotes do not qualify',{constraints:['under $50/month per user'],must_have:['google sso'],country:'PT'},'clickup',null,null]
];
test('26 vendor-specific plan, per-seat and multi-seat subtotal buyer cases',async()=>{
 assert.equal(cases.length,26);
 for(const [title,args,slug,plan,monthly] of cases){
  const result=await run(args),t=selected(result,slug);
  if(!plan){assert.equal(t,null,title+' wrongly qualified '+slug);continue;}
  assert.ok(t,title+' missing '+slug);
  assert.equal(t.plan_coherence.status,'verified',title);
  assert.equal(t.plan_coherence.selected_plan,plan,title);
  const quote=t.constraint_evidence.find(x=>x.monthly_equivalent!==undefined);
  assert.equal(quote.plan,plan,title);
  assert.equal(quote.monthly_equivalent,monthly,title);
  assert.equal(quote.unit,'seat',title);
  assert.equal(quote.currency,'USD',title);
  if(title.includes('3 billed seats')||title.includes('three seats')){
   assert.equal(quote.seat_count,3,title);
   assert.equal(quote.seat_monthly_subtotal,Number((monthly*3).toFixed(2)),title);
   assert.equal(quote.price_scope,'seat_subscription_subtotal_before_tax',title);
  }
  assert.ok(!JSON.stringify(t).includes('https://asana.com/pricing'),title+' manufacturer URL leak');
  assert.ok(!JSON.stringify(t).includes('https://clickup.com/pricing'),title+' manufacturer URL leak');
  assert.ok(!JSON.stringify(t).includes('support.airtable.com/articles/2277136852'),title+' manufacturer URL leak');
 }
});
test('Airtable annual invoice for 3 billable editors remains explicitly pre-tax',async()=>{
 const out=await run({constraints:['under $65/month subscription subtotal for 3 billed seats billed annually'],must_have:['gantt views']});
 const t=selected(out,'airtable');
 assert.ok(t);
 const quote=t.constraint_evidence[0];
 assert.equal(quote.plan,'Team');
 assert.equal(quote.billing_cycle,'annual');
 assert.equal(quote.seat_monthly_subtotal,60);
 assert.equal(quote.seat_invoice_subtotal,720);
 assert.equal(quote.tax_status,'unknown');
});
test('Legacy full checkout budget cannot be inferred from a known pre-tax quote',async()=>{
 const out=await run({constraints:['under $100/month total for 3 users including VAT'],must_have:['timeline views']});
 assert.ok(!out.structuredContent?.shortlist?.some(t=>t.slug==='clickup'));
 assert.ok(!out.structuredContent?.shortlist?.some(t=>t.slug==='asana'));
});
test('The catalog now has 26 manufacturer-sourced quotes across six products',()=>{
 const q=catalog.flatMap(t=>(t.decisionClaims||[]).filter(c=>c.type==='price_quote').map(c=>({slug:t.slug,...c})));
 assert.equal(q.length,26);
 assert.equal(new Set(q.map(c=>c.slug)).size,6);
 assert.ok(q.every(c=>c.unit==='seat'||c.unit==='channel'||c.unit==='subscription'));
});
