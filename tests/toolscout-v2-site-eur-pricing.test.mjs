import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
async function decide(job,params={}){
  const env={ASSETS:{fetch:async req=>new URL(req.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:98,method:'tools/call',params:{name:'decide_software',arguments:{job,limit:5,...params},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}};
  const request=new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)});
  const response=await handleAgentProtocolRoute(request,env,{waitUntil(){}});
  assert.equal(response.status,200);
  const result=(await response.json()).result;
  return result.structuredContent||{};
}
const testcases=[
 ['Webflow Premium CMS annual', 'website builder',{constraints:['under $26/month billed annually'],must_have:['content management system']},'webflow','Site Premium',25],
 ['Webflow Basic does not include CMS', 'website builder',{constraints:['under $16/month billed annually'],must_have:['content management system']},'webflow',null,null],
 ['Webflow Basic includes custom domain', 'website builder',{constraints:['under $16/month billed annually'],must_have:['custom domain']},'webflow','Site Basic',15],
 ['Webflow Basic below price floor', 'website builder',{constraints:['under $14/month billed annually'],must_have:['custom domain']},'webflow',null,null],
 ['Webflow monthly invoice unproven', 'website builder',{constraints:['under $26/month billed monthly'],must_have:['content management system']},'webflow',null,null],
 ['Webflow EUR exchange rates unavailable', 'website builder',{constraints:['under €26/month billed annually'],must_have:['content management system']},'webflow',null,null],
 ['Webflow Portugal checkout unavailable', 'website builder',{country:'PT',constraints:['under $26/month billed annually'],must_have:['content management system']},'webflow',null,null],
 ['HubSpot regular list EUR price', 'crm',{constraints:['under €25/month per user']},'hubspot','Starter',20],
 ['HubSpot €19 lower than published list', 'crm',{constraints:['under €19/month per user']},'hubspot',null,null],
 ['HubSpot discounted €7 not assumed', 'crm',{constraints:['under €8/month per user']},'hubspot',null,null],
 ['HubSpot locale-specific Portuguese price unproven', 'crm',{country:'PT',constraints:['under €25/month per user']},'hubspot',null,null],
 ['HubSpot USD not inferred from EUR', 'crm',{constraints:['under $25/month per user']},'hubspot',null,null],
 ['HubSpot no paid seat when budget Free', 'crm',{constraints:['under €25/month per user'],budget:'free'},'hubspot',null,null],
 ['HubSpot 2 free users documented', 'crm',{constraints:['at least 2 users'],budget:'free'},'hubspot',null,null],
];
test('14 first-party Webflow and HubSpot financial decisions keep plans, EUR rates and country separate',async()=>{
  assert.equal(testcases.length,14);
  for(const [label,job,args,slug,plan,amount] of testcases){
    const data=await decide(job,args),out=data.shortlist?.find(t=>t.slug===slug);
    if(!plan){assert.equal(out,undefined,label+' incorrectly qualified');continue}
    assert.ok(out,label+' lacks '+slug);
    const price=out.constraint_evidence?.find(x=>x.monthly_equivalent!==undefined);
    assert.ok(price,label+' is missing price evidence');
    assert.equal(price.plan,plan,label);
    assert.equal(price.monthly_equivalent,amount,label);
    assert.equal(price.charge_amount,plan==='Starter'?20:amount*12,label);
    assert.equal(price.currency,slug==='hubspot'?'EUR':'USD',label);
    assert.ok(out.tool_url.startsWith('https://trytoolscout.org/go/'),label);
    assert.ok(!JSON.stringify(out).includes('https://www.hubspot.com/pricing/sales'),label);
    assert.ok(!JSON.stringify(out).includes('https://webflow.com/pricing'),label);
  }
});
test('vendor quotes are dated, site-scoped and reject unwarranted permanent discount claims',()=>{
  const web=catalog.find(x=>x.slug==='webflow');
  const hub=catalog.find(x=>x.slug==='hubspot');
  const quotes=[...web.decisionClaims.filter(x=>x.type==='price_quote'),...hub.decisionClaims.filter(x=>x.type==='price_quote')];
  assert.equal(quotes.length,3);
  assert.ok(quotes.every(x=>x.status==='verified'&&x.verifiedAt==='2026-10-09'&&x.sourceUrl.startsWith('https://')));
  assert.ok(web.decisionClaims.filter(x=>x.type==='price_quote').every(x=>x.unit==='subscription'&&x.billingCycle==='annual'));
  assert.ok(hub.decisionClaims.filter(x=>x.type==='price_quote').every(x=>x.currency==='EUR'&&x.promotion===false&&x.market==='unspecified'));
});
