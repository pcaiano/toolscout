import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
const tools=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const w=tools.find(x=>x.slug==='webflow');
async function decide(priceConstraint,mustHave='content management system'){
 const env={ASSETS:{fetch:async req=>new URL(req.url).pathname==='/data/tools.json'?Response.json(tools):new Response('missing',{status:404})}};
 const body={jsonrpc:'2.0',id:9,method:'tools/call',params:{name:'decide_software',arguments:{job:'website',constraints:[priceConstraint],must_have:[mustHave],limit:5},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'Webflow cost basis regression',version:'1.0'}}}};
 const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)}),env,{waitUntil(){}});
 assert.equal(response.status,200);
 return (await response.json()).result;
}
test('Webflow current Site pricing is 2 monthly and 2 yearly USD quotes, never Workspace or legacy CMS',()=>{
 const q=w.decisionClaims.filter(x=>x.type==='price_quote');
 assert.deepEqual(q.map(x=>[x.plan,x.billingCycle,x.amount,x.chargeAmount]).sort(),[
  ['Site Basic','annual',15,180],['Site Basic','monthly',25,25],
  ['Site Premium','annual',25,300],['Site Premium','monthly',39,39]
 ].sort());
 assert.ok(q.every(x=>x.unit==='subscription'&&x.currency==='USD'&&x.taxStatus==='excluded'&&x.market==='unspecified'));
 assert.ok(!q.some(x=>/\bCMS\b|\bBusiness\b/.test(x.plan)));
});
test('Webflow Basic cannot falsely satisfy Premium CMS at its $25 monthly cost',async()=>{
 const no=await decide('under $26/month billed monthly');
 assert.ok(!(no.structuredContent?.shortlist||[]).some(x=>x.slug==='webflow'));
 const yes=await decide('under $40/month billed monthly');
 const t=yes.structuredContent?.shortlist?.find(x=>x.slug==='webflow');
 assert.ok(t,'CMS Premium plan should qualify');
 assert.equal(t.plan_coherence.selected_plan,'Site Premium');
 assert.equal(t.constraint_evidence[0].monthly_equivalent,39);
 assert.equal(t.constraint_evidence[0].charge_amount,39);
 assert.equal(t.constraint_evidence[0].billing_cycle,'monthly');
 assert.ok(!JSON.stringify(t).includes('webflow.com/pricing'));
});
test('Webflow annual Site Premium never mistaken for month-to-month cancelable subscription',async()=>{
 const r=await decide('under $26/month billed annually');
 const t=r.structuredContent?.shortlist?.find(x=>x.slug==='webflow');
 assert.ok(t);assert.equal(t.plan_coherence.selected_plan,'Site Premium');
 assert.equal(t.constraint_evidence[0].billing_cycle,'annual');
 assert.equal(t.constraint_evidence[0].charge_amount,300);
});
test('Webflow Site Basic custom domain and Premium CMS tier inheritance differ',async()=>{
 const basic=await decide('under $26/month billed monthly','custom domain');
 const t=basic.structuredContent?.shortlist?.find(x=>x.slug==='webflow');
 assert.ok(t);assert.equal(t.plan_coherence.selected_plan,'Site Basic');
 assert.equal(t.constraint_evidence[0].monthly_equivalent,25);
 const excluded=await decide('under €40/month billed monthly');
 assert.ok(!(excluded.structuredContent?.shortlist||[]).some(x=>x.slug==='webflow'));
});
