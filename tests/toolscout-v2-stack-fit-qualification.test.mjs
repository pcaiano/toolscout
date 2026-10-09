import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
async function invoke(name,args,rows=catalog){
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'
    ?Response.json(rows):new Response('',{status:404})}};
  const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{
    method:'POST',
    headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28',
      'Mcp-Method':'tools/call','Mcp-Name':name},
    body:JSON.stringify({jsonrpc:'2.0',id:531,method:'tools/call',
      params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28',
        'io.modelcontextprotocol/clientInfo':{name:'stack-qualification-test',version:'1.0'}}}})
  }),env,{waitUntil(){}});
  assert.equal(response.status,200);
  return (await response.json()).result;
}
const hit=(result,slug)=>result.structuredContent?.shortlist?.find(t=>t.slug===slug);
test('Mandatory Free stack fit qualifies Typeform Mailchimp, not paid-only HubSpot',async()=>{
  const yes=await invoke('decide_software',{job:'forms',budget:'free',existing_tools:['Mailchimp'],require_stack_fit:true,limit:5});
  assert.equal(yes.isError,false);
  assert.equal(hit(yes,'typeform')?.qualified_for_use_case,true);
  assert.equal(hit(yes,'typeform')?.stack_fit.pairs[0].status,'verified');
  assert.deepEqual(hit(yes,'typeform')?.stack_fit.pairs[0].eligible_plans,['Free']);
  const no=await invoke('decide_software',{job:'forms',budget:'free',existing_tools:['HubSpot'],require_stack_fit:true,limit:5});
  assert.equal(no.isError,true);
  assert.equal(no.structuredContent?.decision_status,'no_qualified_candidate');
});
test('Integration is verified only with every required existing application',async()=>{
  const yes=await invoke('decide_software',{job:'forms',budget:'free',existing_tools:['Mailchimp','Airtable'],require_stack_fit:true,limit:5});
  assert.equal(hit(yes,'typeform')?.stack_fit.verified_pairs,2);
  const no=await invoke('decide_software',{job:'forms',budget:'free',existing_tools:['Mailchimp','HubSpot'],require_stack_fit:true,limit:5});
  assert.equal(no.isError,true);
});
test('A documented integration with unknown priced-plan entitlement cannot combine with Starter quote',async()=>{
  const broad=await invoke('decide_software',{job:'crm',existing_tools:['Gmail'],require_stack_fit:true,limit:5});
  assert.equal(hit(broad,'hubspot')?.qualified_for_use_case,true);
  const paid=await invoke('decide_software',{job:'crm',existing_tools:['Gmail'],require_stack_fit:true,
    constraints:['under €25/month per user'],limit:5});
  assert.equal(paid.isError,true);
  assert.ok(!hit(paid,'hubspot'));
  const flexible=await invoke('decide_software',{job:'crm',existing_tools:['Gmail'],require_stack_fit:false,
    constraints:['under €25/month per user'],limit:5});
  assert.equal(hit(flexible,'hubspot')?.qualified_for_use_case,true);
});
test('Comparison cannot name a winner with undocumented mandatory stack fit',async()=>{
  const yes=await invoke('compare_for_use_case',{tools:['typeform','jotform'],use_case:'online forms',
    budget:'free',existing_tools:['Mailchimp'],require_stack_fit:true});
  assert.equal(yes.structuredContent?.verdict?.tool,'Typeform');
  assert.equal(yes.structuredContent?.tools.find(t=>t.slug==='jotform')?.qualified_for_use_case,false);
  const no=await invoke('compare_for_use_case',{tools:['typeform','jotform'],use_case:'online forms',
    budget:'free',existing_tools:['HubSpot'],require_stack_fit:true});
  assert.equal(no.structuredContent?.verdict?.type,'no_qualified_winner');
});
test('Alternatives retain affiliate-neutral scoring but exclude unknown mandatory integrations',async()=>{
  const out=await invoke('find_alternatives',{tool:'jotform',dislike:'complexity',budget:'free',
    existing_tools:['HubSpot'],require_stack_fit:true,limit:5});
  assert.equal(out.isError,false);
  assert.ok(out.structuredContent?.alternatives.every(t=>t.stack_fit.pairs.every(p=>p.status==='verified')));
  assert.ok(!out.structuredContent?.alternatives.some(t=>t.slug==='typeform'));
});
test('Stack checker shows plan-specific unknown instead of promising Free interoperability',async()=>{
  const free=await invoke('check_stack_fit',{candidates:['typeform'],existing_tools:['Mailchimp','HubSpot'],budget:'free'});
  const pairs=free.structuredContent?.candidates[0].stack_fit.pairs;
  assert.deepEqual(pairs.map(p=>p.status),['verified','pair_unverified']);
  assert.match(pairs[1].evidence,/Free plan/);
  const general=await invoke('check_stack_fit',{candidates:['typeform'],existing_tools:['HubSpot']});
  assert.equal(general.structuredContent?.candidates[0].stack_fit.pairs[0].status,'verified');
});
test('Mandatory stack mode rejects absent stack or invalid boolean',async()=>{
  for(const arguments_ of [{job:'forms',require_stack_fit:true},{job:'forms',require_stack_fit:'yes',existing_tools:['Mailchimp']}]) {
    const result=await invoke('decide_software',arguments_);
    assert.equal(result.isError,true);
  }
});
test('Unqualified integrations retain private first-party source URLs',async()=>{
  const result=await invoke('decide_software',{job:'forms',budget:'free',existing_tools:['Mailchimp'],
    require_stack_fit:true,limit:5});
  assert.ok(!JSON.stringify(result).includes('help.typeform.com'));
  assert.ok(hit(result,'typeform')?.tool_url.startsWith('https://trytoolscout.org/go/typeform'));
});
test('AI assistant interoperability signal alone never proves a mandatory named app-pair entitlement',async()=>{
  const synthetic=[{slug:'crm-ai-only',name:'CRM AI Only',category:'crm',
    description:'A CRM with AI assistant interoperability',features:['crm','integrations'],
    scores:{integrations:9,ease:8},aiIntegration:{status:'verified',assistants:['ChatGPT']}}];
  const soft=await invoke('decide_software',{job:'crm',existing_tools:['ChatGPT'],limit:2},synthetic);
  assert.equal(soft.structuredContent?.shortlist[0].stack_fit.pairs[0].status,'verified');
  const mandatory=await invoke('decide_software',{job:'crm',existing_tools:['ChatGPT'],
    require_stack_fit:true,limit:2},synthetic);
  assert.equal(mandatory.isError,true);
  assert.equal(mandatory.structuredContent?.decision_status,'no_qualified_candidate');
});
