import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
async function decide(job,extra={}){
 const env={ASSETS:{fetch:async req=>new URL(req.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
 const input={jsonrpc:'2.0',id:509,method:'tools/call',params:{name:'decide_software',arguments:{job,limit:5,...extra},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'plan-coherence-benchmark',version:'1.0'}}}};
 const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(input)}),env,{waitUntil(){}});
 assert.equal(response.status,200);return (await response.json()).result;
}
const selected=(result,slug)=>result.structuredContent?.shortlist?.find(x=>x.slug===slug)||null;
const cases=[
 ['Trello Standard monthly with custom fields','business',{constraints:['under $7/month per user'],must_have:['custom fields']},'trello','Standard',6],
 ['Trello Premium monthly with timeline view','business',{constraints:['under $13/month per user'],must_have:['timeline view']},'trello','Premium',12.5],
 ['Trello cheap Standard cannot satisfy Premium timeline','business',{constraints:['under $7/month per user'],must_have:['timeline view']},'trello',null,null],
 ['Trello Premium annual tier and monthly equivalent','business',{constraints:['under $11/month per user billed annually'],must_have:['timeline view']},'trello','Premium',10],
 ['Trello cheaper Standard annual cannot inherit timeline','business',{constraints:['under $6/month per user billed annually'],must_have:['timeline view']},'trello',null,null],
 ['Trello custom fields available on Premium','business',{constraints:['under $13/month per user'],must_have:['custom fields','timeline view']},'trello','Premium',12.5],
 ['Trello multi-seat total cannot use a single user quote','business',{constraints:['under $13/month per user for 5 users'],must_have:['custom fields']},'trello',null,null],
 ['Make Pro custom variables cannot use Core price','automation',{constraints:['under $15/month'],must_have:['custom variables']},'make',null,null],
 ['Make Pro custom variables priced accurately monthly','automation',{constraints:['under $25/month'],must_have:['custom variables']},'make','Pro',21],
 ['Make Pro custom variables with 10k credit capacity','automation',{constraints:['under $25/month','at least 10000 credits per month'],must_have:['custom variables']},'make','Pro',21],
 ['Make Annual Pro lower equivalent and correct bill','automation',{constraints:['under $20/month billed annually'],must_have:['custom variables']},'make','Pro',16],
 ['Make annual Core for visual workflows','automation',{constraints:['under $10/month billed annually'],must_have:['visual workflow builder']},'make','Core',9],
 ['Make yearly Pro invoice 192','automation',{constraints:['under $192/year'],must_have:['custom variables']},'make','Pro',16],
 ['Make at most 191 yearly cannot buy Pro','automation',{constraints:['under $191/year'],must_have:['custom variables']},'make',null,null],
 ['Make paid Pro not documented for free user','automation',{constraints:['at least 10000 credits per month'],must_have:['custom variables'],budget:'free'},'make',null,null],
 ['Make Core price cannot prove undocumented integration','automation',{constraints:['under $25/month'],must_have:['Gmail']},'make',null,null]
];
test('16 documented plan-coherent buyer cases cannot mix cheap prices with premium capabilities',async()=>{

 assert.equal(cases.length,16);
 for(const [title,job,extra,slug,plan,amount] of cases){
  const r=await decide(job,extra);
  const item=selected(r,slug);
  if(!plan){assert.equal(item,null,title+' incorrectly qualified');continue;}
  assert.ok(item,title+' lacks qualified tool');
  assert.equal(item.plan_coherence.status,'verified',title);
  assert.equal(item.plan_coherence.selected_plan,plan,title);
  const p=item.constraint_evidence.find(c=>c.monthly_equivalent!==undefined);
  assert.ok(p,title+' no price found');
  assert.equal(p.plan,plan,title+' mixed price plan');
  assert.equal(p.monthly_equivalent,amount,title);
  assert.ok(item.requirement_evidence.every(x=>x.status==='verified'));
  assert.ok(!JSON.stringify(item).includes('trello.com/pricing')&&!JSON.stringify(item).includes('make.com/en/pricing'));
 }
});
test('the annual Make and Trello prices preserve full upfront invoice',async()=>{
 const m=await decide('automation',{constraints:['under $20/month billed annually'],must_have:['custom variables']});
 const make=selected(m,'make');
 assert.equal(make.constraint_evidence[0].charge_amount,192);
 assert.equal(make.constraint_evidence[0].billing_cycle,'annual');
 const t=await decide('business',{constraints:['under $11/month per user billed annually'],must_have:['timeline view']});
 const trello=selected(t,'trello');
 assert.equal(trello.constraint_evidence[0].charge_amount,120);
 assert.equal(trello.constraint_evidence[0].unit,'seat');
});
test('quote catalog coverage includes original and new manufacturer prices',()=>{
 const make=catalog.find(t=>t.slug==='make');
 const trello=catalog.find(t=>t.slug==='trello');
 assert.equal(make.decisionClaims.filter(c=>c.type==='price_quote').length,6);
 assert.equal(trello.decisionClaims.filter(c=>c.type==='price_quote').length,4);
 const legacy=catalog.find(t=>t.slug==='buffer');
 assert.equal(legacy.decisionClaims.filter(c=>c.type==='price_quote').length,4);
});
