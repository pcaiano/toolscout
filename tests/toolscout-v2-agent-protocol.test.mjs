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
  assert.equal(body.name,'ToolScout Software Recommendation Agent');
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
  assert.deepEqual(payload.result.tools.map(x=>x.name),['recommend_tools','search_tools','get_tool','compare_tools','get_ai_compatibility']);
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
