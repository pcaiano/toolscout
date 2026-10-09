import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
async function invoke(name,args){
 const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'
 ?Response.json(catalog):new Response('',{status:404})}};
 const body={jsonrpc:'2.0',id:602,method:'tools/call',params:{name,arguments:args,_meta:{
 'io.modelcontextprotocol/protocolVersion':'2026-07-28',
 'io.modelcontextprotocol/clientInfo':{name:'verified-pair-coverage-test',version:'1'}}}};
 const response=await handleAgentProtocolRoute(new Request('https://trytoolscout.org/mcp',{
 method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28',
 'Mcp-Method':'tools/call','Mcp-Name':name},body:JSON.stringify(body)}),env,{waitUntil(){}});
 assert.equal(response.status,200);
 return (await response.json()).result;
}
const expected={
 hubspot:['Gmail','Google Calendar','Outlook Calendar','Slack'],
 mailchimp:['Shopify'],
 make:['HubSpot','Airtable','Google Sheets'],
 zapier:['HubSpot','Airtable','Notion']
};
test('Eight new integration pairs have manufacturer provenance, dates and no duplicate keys',()=>{
 for(const [slug,names]of Object.entries(expected)){
  const record=catalog.find(t=>t.slug===slug);
  assert.ok(record,slug);
  for(const name of names){
   const matches=(record.integrations||[]).filter(x=>x.product===name&&x.status==='verified');
   assert.equal(matches.length,1,slug+' -> '+name);
   const pair=matches[0];
   assert.match(pair.sourceUrl,/^https:\/\//);
   assert.equal(pair.verifiedAt,'2026-10-09');
   const doc=new URL(pair.sourceUrl).hostname.replace(/^www\./,'');
   const manufacturer=new URL(record.sourceUrl).hostname.replace(/^www\./,'');
   assert.ok(doc===manufacturer||doc.endsWith('.'+manufacturer),slug+' -> '+name+' first-party');
  }
 }
});
test('Previously verified named integrations remain unchanged',()=>{
 for(const [slug,name]of [['hubspot','Gmail'],['make','HubSpot'],['zapier','HubSpot'],['typeform','Airtable']]){
  assert.ok(catalog.find(t=>t.slug===slug)?.integrations?.some(x=>x.product===name&&x.status==='verified'));
 }
});
test('Free stack fit qualifies manufacturer-confirmed HubSpot calendar and Slack integrations',async()=>{
 const r=await invoke('decide_software',{job:'CRM',existing_tools:['Google Calendar','Slack'],budget:'free',require_stack_fit:true,limit:5});
 assert.equal(r.isError,false);
 const hubspot=r.structuredContent.shortlist.find(x=>x.slug==='hubspot');
 assert.ok(hubspot);
 assert.equal(hubspot.qualified_for_use_case,true);
 assert.deepEqual(hubspot.stack_fit.pairs.map(x=>x.status),['verified','verified']);
 assert.ok(hubspot.stack_fit.pairs.every(x=>x.eligible_plans.includes('Free')));
});
test('Mailchimp Shopify named integration is eligible on documented Free tier',async()=>{
 const r=await invoke('check_stack_fit',{candidates:['mailchimp'],existing_tools:['Shopify'],budget:'free'});
 assert.equal(r.isError,false);
 assert.equal(r.structuredContent.candidates[0].stack_fit.pairs[0].status,'verified');
 assert.deepEqual(r.structuredContent.candidates[0].stack_fit.pairs[0].eligible_plans,['Free']);
});
test('Make general integrations remain unproven on Free tier',async()=>{
 const r=await invoke('check_stack_fit',{candidates:['make'],existing_tools:['Airtable','Google Sheets'],budget:'free'});
 assert.equal(r.isError,false);
 assert.deepEqual(r.structuredContent.candidates[0].stack_fit.pairs.map(x=>x.status),['pair_unverified','pair_unverified']);
 const no=await invoke('decide_software',{job:'workflow automation',existing_tools:['Airtable','Google Sheets'],budget:'free',require_stack_fit:true,limit:5});
 assert.ok(!no.structuredContent?.shortlist?.some(x=>x.slug==='make'));
});
test('Zapier Airtable and Notion are verified pairs, not guaranteed Free plan entitlements',async()=>{
 const r=await invoke('check_stack_fit',{candidates:['zapier'],existing_tools:['Airtable','Notion']});
 assert.deepEqual(r.structuredContent.candidates[0].stack_fit.pairs.map(x=>x.status),['verified','verified']);
 const free=await invoke('check_stack_fit',{candidates:['zapier'],existing_tools:['Airtable','Notion'],budget:'free'});
 assert.deepEqual(free.structuredContent.candidates[0].stack_fit.pairs.map(x=>x.status),['pair_unverified','pair_unverified']);
});
test('API and MCP responses never leak first-party evidence URLs',async()=>{
 for(const name of ['check_stack_fit','decide_software']){
  const r=await invoke(name,name==='check_stack_fit'?{candidates:['make'],existing_tools:['Airtable']}:
     {job:'CRM',existing_tools:['Google Calendar'],limit:3});
  const publicJson=JSON.stringify(r);
  assert.doesNotMatch(publicJson,/apps\.make\.com|knowledge\.hubspot\.com|help\.zapier\.com|mailchimp\.com\/help/);
  assert.match(publicJson,/trytoolscout\.org\/go\//);
 }
});
