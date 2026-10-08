import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgentProtocolRoute} from '../agent-protocol-core-worker.js';
import {routeOwner} from '../runtime-route-contract.js';
import {missionOwner,cronMatches,TOOLSCOUT_CRONS} from '../runtime-schedule-contract.js';
import fs from 'node:fs';

test('MCP, A2A and agent card have a direct protocol owner',()=>{
  for(const path of ['/mcp','/mcp/','/a2a','/a2a/','/.well-known/agent-card.json']){
    assert.equal(routeOwner(path,{method:path.includes('well-known')?'GET':'POST'}).owner,'agent_protocol_core');
  }
  assert.equal(routeOwner('/.well-known/toolscout-distribution.json',{method:'GET'}).owner,'machine_discovery_catalog');
});

test('agent card is served without legacy fallback',async()=>{
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/.well-known/agent-card.json'),
    {},
    {waitUntil(){}}
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.name,'ToolScout Software Decision Agent');
  assert.equal(body.supportedInterfaces[0].url,'https://trytoolscout.org/a2a');
});

test('MCP OPTIONS is handled directly with protocol CORS',async()=>{
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'OPTIONS'}),
    {},
    {waitUntil(){}}
  );
  assert.equal(response.status,204);
  assert.match(response.headers.get('access-control-allow-methods')||'',/POST/);
});

test('AgentReady verification is owned by central hourly scheduler',()=>{
  assert.equal(missionOwner('agentready_verification'),'growth_scheduler');
  assert.equal(cronMatches('agentready_verification',TOOLSCOUT_CRONS.hourly),true);
  const wrapper=fs.readFileSync(new URL('../agent-protocol-worker.js',import.meta.url),'utf8');
  const scheduler=fs.readFileSync(new URL('../growth-scheduler.js',import.meta.url),'utf8');
  assert.doesNotMatch(wrapper,/AGENTREADY_CRON|syncAgentReadyVerified/);
  assert.match(scheduler,/agentReadyDaily=hourly&&scheduledHour===3/);
  assert.match(scheduler,/mission:'agentready_verification'/);
  assert.match(scheduler,/syncAgentReadyVerified/);
});


test('MCP publishes the expanded ToolScout decision toolset',async()=>{
  const body={jsonrpc:'2.0',id:7,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'},'io.modelcontextprotocol/clientCapabilities':{}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/list'},body:JSON.stringify(body)}),
    {},
    {waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.deepEqual(payload.result.tools.map(x=>x.name),['decide_software','compare_for_use_case','find_alternatives','check_stack_fit','recent_changes','recommend_tools','search_tools','get_tool','compare_tools','get_ai_compatibility']);
});

test('MCP get_tool returns ToolScout URLs without exposing raw affiliate programme fields',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const env={ASSETS:{fetch:async()=>Response.json(catalog)}};
  const body={jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'get_tool',arguments:{tool:'hubspot'},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'},'io.modelcontextprotocol/clientCapabilities':{}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'get_tool'},body:JSON.stringify(body)}),
    env,
    {waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.result.structuredContent.tool.slug,'hubspot');
  assert.match(payload.result.structuredContent.tool.tool_url,/\/go\/hubspot\?source=ai-agent$/);
  assert.equal('affiliateUrl' in payload.result.structuredContent.tool,false);
  assert.equal('commission' in payload.result.structuredContent.tool,false);
});


test('MCP decide_software returns an evidence-aware shortlist with trade-offs',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:20,method:'tools/call',params:{name:'decide_software',arguments:{job:'CRM for a small consultancy with automation and integrations',budget:'low',team:'small',priorities:['ease','automation','integrations'],existing_tools:['ChatGPT'],limit:3},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.ok(payload.result.structuredContent.shortlist.length>=2);
  assert.equal(payload.result.structuredContent.decision_basis.no_pay_to_rank,true);
  assert.ok(payload.result.structuredContent.shortlist.every(x=>Array.isArray(x.tradeoffs)&&x.stack_fit));
});

test('MCP decide_software does not recommend tools without evidence for mandatory criteria',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:24,method:'tools/call',params:{name:'decide_software',arguments:{job:'SEO',must_have:['automation'],limit:5},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  const shortlist=payload.result.structuredContent.shortlist;
  assert.equal(payload.result.isError,true);
  assert.deepEqual(payload.result.structuredContent.shortlist,[]);
  assert.match(payload.result.content[0].text,/could not find enough catalog evidence/i);
});

test('MCP stack fit never treats incidental text such as sales teams as Microsoft Teams evidence',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:25,method:'tools/call',params:{name:'check_stack_fit',arguments:{candidates:['hubspot'],existing_tools:['Teams']},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'check_stack_fit'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  const fit=payload.result.structuredContent.candidates[0].stack_fit;
  assert.equal(fit.verified_pairs,0);
  assert.equal(fit.pairs[0].status,'pair_unverified');
  assert.match(fit.pairs[0].evidence,/does not currently store verified product-specific evidence for Teams/i);
});

test('MCP free-form constraints are evaluated and surfaced as verified, not_verified or conflict',async()=>{
  const catalog=[
    {slug:'crm-linux',name:'CRM Linux',category:'crm',description:'CRM for teams with Linux support.',pricing:'Free plan available',freePlan:true,freePlanKnown:true,features:['crm','automation','linux'],bestFor:['small businesses'],lastVerified:'2026-10-08',scores:{price:9,ease:7,automation:8,integrations:6,sales:8}},
    {slug:'crm-cloud',name:'CRM Cloud',category:'crm',description:'Cloud CRM for sales teams.',pricing:'Paid plans',freePlan:false,freePlanKnown:true,features:['crm','automation'],bestFor:['sales teams'],lastVerified:'2026-10-08',scores:{price:6,ease:8,automation:8,integrations:7,sales:8}}
  ];
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:26,method:'tools/call',params:{name:'decide_software',arguments:{job:'CRM',constraints:['must support Linux','free plan'],limit:2},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  const shortlist=payload.result.structuredContent.shortlist;
  assert.equal(shortlist.length,2);
  const linux=shortlist.find(x=>x.slug==='crm-linux');
  const cloud=shortlist.find(x=>x.slug==='crm-cloud');
  assert.deepEqual(linux.constraint_evidence.map(x=>x.status),['verified','verified']);
  assert.deepEqual(cloud.constraint_evidence.map(x=>x.status),['not_verified','conflict']);
  assert.ok(cloud.tradeoffs.some(x=>x.includes('constraint not verified')));
  assert.ok(cloud.tradeoffs.some(x=>x.includes('constraint conflict')));
});


test('MCP compare_for_use_case exposes contextual trade-offs and affordability loss analysis',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:21,method:'tools/call',params:{name:'compare_for_use_case',arguments:{tools:['hubspot','pipedrive'],use_case:'CRM for a small consultancy with automation and integrations',priorities:['price','ease','automation','integrations'],existing_tools:['ChatGPT']},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'compare_for_use_case'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.result.structuredContent.tools.length,2);
  assert.ok(['best_fit','close_call'].includes(payload.result.structuredContent.verdict.type));
  assert.ok(Array.isArray(payload.result.structuredContent.tradeoffs));
  assert.ok(payload.result.structuredContent.cheaper_option_analysis);
});

test('MCP alternatives improve the stated complaint without hiding sacrifices',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:22,method:'tools/call',params:{name:'find_alternatives',arguments:{tool:'hubspot',dislike:'too expensive and complex',must_have:['automation'],limit:3},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'find_alternatives'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.result.structuredContent.source.slug,'hubspot');
  assert.ok(payload.result.structuredContent.alternatives.length>=1);
  assert.ok(payload.result.structuredContent.alternatives.every(x=>Array.isArray(x.improvements_over_source)&&Array.isArray(x.tradeoffs_vs_source)));
});

test('MCP recent_changes reads only ToolScout editorial evidence associated with the requested product',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const news='<!doctype html><a href="/news/hubspot-mcp-server-updates.html">HubSpot</a>';
  const article='<!doctype html><script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'NewsArticle',headline:'HubSpot expands MCP',description:'HubSpot expands MCP capabilities.',datePublished:'2026-09-15',mainEntityOfPage:'https://trytoolscout.org/news/hubspot-mcp-server-updates.html',about:{'@type':'SoftwareApplication',name:'HubSpot'}})+'</script>';
  const env={ASSETS:{fetch:async request=>{
    const p=new URL(request.url).pathname;
    if(p==='/data/tools.json')return Response.json(catalog);
    if(p==='/whats-new.html')return new Response(news,{status:200});
    if(p==='/news/hubspot-mcp-server-updates.html')return new Response(article,{status:200});
    return new Response('',{status:404});
  }}};
  const body={jsonrpc:'2.0',id:23,method:'tools/call',params:{name:'recent_changes',arguments:{tools:['hubspot'],limit_per_tool:2},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'recent_changes'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.result.structuredContent.changes.length,1);
  assert.equal(payload.result.structuredContent.changes[0].tool,'HubSpot');
});


test('A2A SendMessage now returns a decision shortlist rather than the legacy recommendation payload',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  const env={
    ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})},
    DB:{prepare(){return {bind(){return this},async run(){return {success:true}}}}}
  };
  const body={jsonrpc:'2.0',id:30,method:'SendMessage',params:{message:{role:'ROLE_USER',parts:[{text:'CRM for a small consultancy with automation and integrations'}]}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/a2a',{method:'POST',headers:{'Content-Type':'application/json','A2A-Version':'1.0'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  const data=payload.result.message.parts.find(x=>x.mediaType==='application/json')?.data;
  assert.ok(Array.isArray(data.shortlist));
  assert.ok(data.shortlist.length>=2);
  assert.equal(data.decision_basis.no_pay_to_rank,true);
});


test('MCP review contract remains read-only and does not write protocol telemetry',()=>{
  const runtime=fs.readFileSync(new URL('../agent-protocol-core-worker.js',import.meta.url),'utf8');
  const start=runtime.indexOf('async function handleMcp');
  const end=runtime.indexOf('function agentCard()',start);
  const block=runtime.slice(start,end);
  assert.doesNotMatch(block,/logProtocol\(/);
  assert.doesNotMatch(block,/env\.DB/);
  assert.match(runtime,/readOnlyHint:true/);
  assert.match(runtime,/destructiveHint:false/);
  assert.match(runtime,/openWorldHint:false/);
});

async function benchmarkDecision(catalog,args){
  const env={ASSETS:{fetch:async request=>new URL(request.url).pathname==='/data/tools.json'?Response.json(catalog):new Response('',{status:404})}};
  const body={jsonrpc:'2.0',id:90,method:'tools/call',params:{name:'decide_software',arguments:{job:'CRM',limit:2,...args},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'benchmark-client',version:'1.0'}}}};
  const response=await handleAgentProtocolRoute(
    new Request('https://trytoolscout.org/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'decide_software'},body:JSON.stringify(body)}),
    env,{waitUntil(){}}
  );
  assert.equal(response.status,200);
  const payload=await response.json();
  return payload.result;
}

test('decision benchmark: separate words do not establish a mandatory capability',async()=>{
  const catalog=[
    {slug:'qualified-crm',name:'Qualified CRM',category:'crm',description:'CRM for small firms',features:['crm','SOC2 certified'],bestFor:['small business'],freePlan:false,scores:{price:null,ease:8}},
    {slug:'unverified-crm',name:'Unverified CRM',category:'crm',description:'CRM for small firms',features:['crm','SOC2 dashboard','certified templates'],bestFor:['small business'],freePlan:false,scores:{price:10,ease:10}}
  ];
  const out=await benchmarkDecision(catalog,{must_have:['SOC2 certified'],priorities:['price','ease']});
  assert.equal(out.isError,false);
  assert.deepEqual(out.structuredContent.shortlist.map(x=>x.slug),['qualified-crm']);
  const winner=out.structuredContent.shortlist[0];
  assert.equal(winner.requirement_evidence[0].matched,true);
  assert.equal(winner.requested_dimensions.some(x=>x.dimension==='price'),false,'null score is unknown, not zero');
});

test('decision benchmark: unverified free-plan flags are never considered verified evidence',async()=>{
  const catalog=[
    {slug:'free-unknown',name:'Free Unknown',category:'crm',description:'CRM',features:['crm'],bestFor:['teams'],freePlan:true,freePlanKnown:false,scores:{price:9,ease:8}},
    {slug:'free-known',name:'Free Known',category:'crm',description:'CRM',features:['crm'],bestFor:['teams'],freePlan:true,freePlanKnown:true,scores:{price:9,ease:8}}
  ];
  const out=await benchmarkDecision(catalog,{constraints:['free plan'],priorities:['ease']});
  assert.equal(out.isError,false);
  const bySlug=Object.fromEntries(out.structuredContent.shortlist.map(x=>[x.slug,x]));
  assert.equal(bySlug['free-unknown'].constraint_evidence[0].status,'not_verified');
  assert.equal(bySlug['free-unknown'].free_plan_status,'unverified');
  assert.equal(bySlug['free-known'].constraint_evidence[0].status,'verified');
  assert.equal(bySlug['free-known'].free_plan_status,'verified_available');
});

test('decision benchmark: only sourced verified Gmail pairs meet Gmail must-haves',async()=>{
  const catalog=[
    {slug:'crm-verified',name:'CRM Verified',category:'crm',description:'CRM',features:['crm'],bestFor:['teams'],integrations:[{product:'Gmail',status:'verified',sourceUrl:'https://docs.example.com/gmail',verifiedAt:'2026-10-08'}],scores:{integrations:7,ease:8}},
    {slug:'crm-unsourced',name:'CRM Unsourced',category:'crm',description:'CRM',features:['crm','integrations'],bestFor:['teams'],integrations:[{product:'Gmail',status:'verified',verifiedAt:'2026-10-08'}],scores:{integrations:10,ease:10}}
  ];
  const out=await benchmarkDecision(catalog,{must_have:['Gmail'],existing_tools:['Gmail'],priorities:['integrations']});
  assert.equal(out.isError,false);
  assert.deepEqual(out.structuredContent.shortlist.map(x=>x.slug),['crm-verified']);
  const pair=out.structuredContent.shortlist[0].stack_fit.pairs[0];
  assert.equal(pair.status,'verified');
  assert.equal(pair.source_url,'https://docs.example.com/gmail');
  assert.equal(pair.verified_at,'2026-10-08');
});

test('decision benchmark: unverified AI assistant lists do not prove integration',async()=>{
  const catalog=[
    {slug:'crm-assistant-unknown',name:'CRM Assistant Unknown',category:'crm',description:'CRM',features:['crm','integrations'],bestFor:['teams'],aiIntegration:{status:'unverified',assistants:['ChatGPT']},scores:{integrations:9,ease:8}},
    {slug:'crm-assistant-verified',name:'CRM Assistant Verified',category:'crm',description:'CRM',features:['crm','integrations'],bestFor:['teams'],aiIntegration:{status:'verified',assistants:['ChatGPT']},scores:{integrations:9,ease:8}}
  ];
  const out=await benchmarkDecision(catalog,{existing_tools:['ChatGPT'],priorities:['integrations']});
  assert.equal(out.isError,false);
  const bySlug=Object.fromEntries(out.structuredContent.shortlist.map(x=>[x.slug,x]));
  assert.equal(bySlug['crm-assistant-unknown'].stack_fit.pairs[0].status,'pair_unverified');
  assert.equal(bySlug['crm-assistant-verified'].stack_fit.pairs[0].status,'verified');
});

test('decision benchmark: catalog category intent takes precedence over unrelated feature scores',async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
  for(const category of ['crm','seo','forms','automation','analytics','support','developer','website','design','ai-writing']){
    const out=await benchmarkDecision(catalog,{job:category,priorities:['ease'],limit:3});
    assert.equal(out.isError,false,'Expected a shortlist for '+category);
    assert.ok(out.structuredContent.shortlist.length>0,'Empty shortlist for '+category);
    assert.ok(out.structuredContent.shortlist.every(x=>x.category===category),'Unrelated category leaked into '+category);
  }
});

test('decision benchmark: affiliate relationships cannot alter a contextual shortlist',async()=>{
  const base={category:'crm',description:'CRM for teams',features:['crm','automation'],bestFor:['teams'],freePlan:false,scores:{ease:8,price:7}};
  const catalog=[
    {...base,slug:'alpha-crm',name:'Alpha CRM',affiliateUrl:'',commission:'none'},
    {...base,slug:'beta-crm',name:'Beta CRM',affiliateUrl:'https://example.org/ref',commission:'50%'}
  ];
  const first=await benchmarkDecision(catalog,{priorities:['ease']});
  assert.equal(first.isError,false);
  const flipped=catalog.map(x=>({...x,affiliateUrl:x.affiliateUrl?'':'https://example.org/ref',commission:x.commission==='none'?'50%':'none'}));
  const second=await benchmarkDecision(flipped,{priorities:['ease']});
  assert.deepEqual(first.structuredContent.shortlist.map(x=>x.slug),second.structuredContent.shortlist.map(x=>x.slug));
});
