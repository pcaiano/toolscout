import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
async function decide(job,extra={}){
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'
    ?Response.json(catalog):new Response('',{status:404})}};
  const req=new Request('https://trytoolscout.org/mcp',{
    method:'POST',
    headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28',
      'Mcp-Method':'tools/call','Mcp-Name':'decide_software'},
    body:JSON.stringify({jsonrpc:'2.0',id:515,method:'tools/call',params:{
      name:'decide_software',arguments:{job,limit:5,...extra},
      _meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28',
        'io.modelcontextprotocol/clientInfo':{name:'buyer-plan-regression',version:'1.0'}}
    }})
  });
  const response=await handleAgentProtocolRoute(req,env,{waitUntil(){}});
  assert.equal(response.status,200);
  return (await response.json()).result;
}
const slugs=result=>result.structuredContent?.shortlist?.map(x=>x.slug)||[];
const qualified=(result,slug)=>slugs(result).includes(slug);
const checks=[
 {name:'Brevo 300 email sends/day',job:'marketing',constraint:'at least 300 emails per day',qualifies:['brevo'],excludes:['mailchimp']},
 {name:'Mailchimp 500 email sends/month',job:'marketing',constraint:'at least 500 emails per month',qualifies:['mailchimp'],excludes:['brevo']},
 {name:'Mailchimp 250 email sends/day',job:'marketing',constraint:'at least 250 emails per day',qualifies:['mailchimp','brevo']},
 {name:'Brevo cannot prove 500/day',job:'marketing',constraint:'at least 500 emails per day',qualifies:[],excludes:['brevo','mailchimp']},
 {name:'Brevo 100k stored contacts',job:'marketing',constraint:'at least 1000 stored contacts',qualifies:['brevo'],excludes:['mailchimp']},
 {name:'Brevo 2k automation contacts',job:'marketing',constraint:'at least 2000 automation contacts',qualifies:['brevo']},
 {name:'Brevo cannot prove 3k automation contacts',job:'marketing',constraint:'at least 3000 automation contacts',qualifies:[],excludes:['brevo']},
 {name:'Unscoped contacts are not demonstrated',job:'marketing',constraint:'at least 1000 contacts',qualifies:[],excludes:['brevo']},
 {name:'Typeform Free 10 responses/month',job:'forms',constraint:'at least 10 responses per month',qualifies:['typeform']},
 {name:'Typeform does not prove 11 responses/month on Free',job:'forms',constraint:'at least 11 responses per month',qualifies:[],excludes:['typeform']},
 {name:'Zapier Free 100 tasks/month',job:'automation',constraint:'at least 100 tasks per month',qualifies:['zapier']},
 {name:'Zapier monthly allowance not daily',job:'automation',constraint:'at least 100 tasks per day',qualifies:[],excludes:['zapier']},
 {name:'Make Free 1000 credits/month',job:'automation',constraint:'at least 1000 credits per month',qualifies:['make']},
 {name:'ClickUp Free five Spaces',job:'business',constraint:'at least 5 spaces',qualifies:['clickup']},
 {name:'Linear Free two teams',job:'business',constraint:'at least 2 teams',qualifies:['linear']},
 {name:'Linear does not prove three Free teams',job:'business',constraint:'at least 3 teams',qualifies:[],excludes:['linear']},
 {name:'Brevo Free 50 open deals',job:'marketing',constraint:'at least 50 open deals',qualifies:['brevo']},
 {name:'Brevo Free does not prove 51 open deals',job:'marketing',constraint:'at least 51 open deals',qualifies:[],excludes:['brevo']},
 {name:'Contact requirements cannot assume daily/monthly',job:'marketing',constraint:'at least 300 emails',qualifies:[],excludes:['brevo','mailchimp']}
];
test('19 real buyer scenarios enforce exact manufacturer-documented plan periods and units',async()=>{
 assert.equal(checks.length,19);
 for(const row of checks){
  const result=await decide(row.job,{budget:'free',constraints:[row.constraint]});
  for(const slug of row.qualifies||[])assert.ok(qualified(result,slug),row.name+' expected qualified '+slug);
  for(const slug of row.excludes||[])assert.ok(!qualified(result,slug),row.name+' incorrectly recommended '+slug);
  for(const tool of result.structuredContent?.shortlist||[]){
   assert.equal(tool.qualified_for_use_case,true,row.name);
   assert.ok(tool.constraint_evidence.every(x=>x.status==='verified'),row.name+' unverified hard constraint escaped');
   assert.ok(!JSON.stringify(tool).includes('https://help.'),'Private manufacturer documentation leaked into buyer results');
  }
 }
});
test('the Typeform free plan includes Mailchimp but not premium HubSpot, file upload or payments',async()=>{
 const email=await decide('forms',{budget:'free',must_have:['Mailchimp'],existing_tools:['Mailchimp']});
 const typeform=email.structuredContent?.shortlist?.find(x=>x.slug==='typeform');
 assert.ok(typeform,'Typeform has vendor-backed Mailchimp Free integration');
 assert.equal(typeform.requirement_evidence[0].status,'verified');
 const hub=await decide('forms',{budget:'free',must_have:['HubSpot']});
 assert.ok(!qualified(hub,'typeform'),'Paid-only Typeform HubSpot integration cannot qualify on Free');
 const file=await decide('forms',{budget:'free',must_have:['file upload']});
 assert.ok(!qualified(file,'typeform'),'Vendor confirmed paid-only file upload');
 const paid=await decide('forms',{budget:'free',must_have:['payment question']});
 assert.ok(!qualified(paid,'typeform'),'Vendor confirmed paid-only payment question');
});
test('the Jotform manufacturer Starter tier is recognized as the documented free entitlement',async()=>{
 const check=await decide('forms',{budget:'free',constraints:['at least 100 submissions per month']});
 assert.ok(qualified(check,'jotform'),'Jotform Starter is its documented free tier');
});
test('period and plan are returned to agents while source URLs remain private',async()=>{
 const r=await decide('marketing',{budget:'free',constraints:['at least 300 emails per day']});
 const item=r.structuredContent.shortlist.find(x=>x.slug==='brevo');
 assert.ok(item);
 const first=item.constraint_evidence[0];
 assert.equal(first.period,'day');
 assert.equal(first.plan,'Free');
 assert.equal(first.quantity,300);
 assert.equal(first.scope,null);
 assert.ok(!JSON.stringify(r.structuredContent).includes('https://help.brevo.com'));
});
