import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';

const today=new Date();
const iso=(offset=0)=>new Date(today.getTime()+offset*86400000).toISOString().slice(0,10);
const documented='https://docs.vendor.example/integrations/mailchimp';
const registered='https://vendor-help.example/docs/mailchimp';
const tool=(url,date=iso(),reviewed=[])=>({
  slug:'verified-crm',name:'Verified CRM',category:'crm',
  description:'CRM for managing customer contacts',sourceUrl:'https://vendor.example/',
  features:['crm','integrations'],bestFor:['small companies'],
  scores:{ease:8,integrations:9,automation:7},
  editorialReview:{verificationStatus:'vendor_documented',sourceUrls:reviewed},
  integrations:[{product:'Mailchimp',status:'verified',sourceUrl:url,verifiedAt:date}]
});

async function decide(row){
  const env={ASSETS:{fetch:async req=>
    new URL(req.url).pathname==='/data/tools.json'?Response.json([row]):new Response('',{status:404})}};
  const request=new Request('https://trytoolscout.org/mcp',{
    method:'POST',
    headers:{'Content-Type':'application/json',
      'MCP-Protocol-Version':'2026-07-28',
      'Mcp-Method':'tools/call','Mcp-Name':'decide_software'},
    body:JSON.stringify({jsonrpc:'2.0',id:123,method:'tools/call',params:{
      name:'decide_software',arguments:{job:'CRM',existing_tools:['Mailchimp'],require_stack_fit:true,limit:2},
      _meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}
    }})
  });
  const response=await handleAgentProtocolRoute(request,env,{waitUntil(){}});
  assert.equal(response.status,200);
  return (await response.json()).result;
}

test('fresh manufacturer-subdomain named integration qualifies the same decision engine used by Finder',async()=>{
  const result=await decide(tool(documented));
  assert.equal(result.isError,false);
  assert.deepEqual(result.structuredContent.shortlist.map(x=>x.slug),['verified-crm']);
  assert.equal(result.structuredContent.shortlist[0].stack_fit.pairs[0].status,'verified');
  assert.ok(!JSON.stringify(result).includes(documented),'internal documentation URL must stay private');
});

test('named integration trust rejects unrelated, lookalike, invalid and stale evidence',async()=>{
  const untrusted=[
    tool('https://unrelated.example/integrations/mailchimp'),
    tool('https://vendor.example.evil.invalid/integrations/mailchimp'),
    tool('http://docs.vendor.example/integrations/mailchimp'),
    tool(documented,iso(1)),
    tool(documented,iso(-181)),
    tool(documented,'2026-02-30'),
    tool(documented.replace('https://','https://someone:secret@'))
  ];
  for(const row of untrusted){
    const result=await decide(row);
    assert.equal(result.isError,true,JSON.stringify(row.integrations));
    assert.equal(result.structuredContent.decision_status,'no_qualified_candidate');
  }
});

test('dedicated documentation domain is usable only when already registered in internal editorial evidence',async()=>{
  const unregistered=await decide(tool(registered));
  assert.equal(unregistered.isError,true);
  const trusted=await decide(tool(registered,iso(),[registered]));
  assert.equal(trusted.isError,false);
  assert.ok(!JSON.stringify(trusted).includes(registered),'manufacturer sources are not public outbound links');
});
