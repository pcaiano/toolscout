import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('agent protocol routes remain direct-owned',()=>{
  for(const [path,method] of [['/mcp','POST'],['/mcp','OPTIONS'],['/a2a','POST'],['/.well-known/agent-card.json','GET']]){
    assert.equal(routeOwner(path,{method}).owner,'agent_protocol_core');
  }
  const compute=read('compute-router-worker.js');
  assert.match(compute,/handleAgentProtocolRoute\(request,env,ctx\)/);
  assert.match(compute,/import \{handleAgentProtocolRoute\} from '\.\/agent-protocol-core-worker\.js'/);
});

test('generic traversal bypasses agent protocol core while protocol recommendations keep their lower dependency',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('agent-protocol-core-worker.js');
  assert.match(compute,/import base from '\.\/distribution-discovery-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/agent-protocol-core-worker\.js'/);
  assert.match(runtime,/import base from '\.\/content-engine-intelligence-worker\.js'/);
  assert.match(runtime,/const response=await base\.fetch\(internal,env,ctx\)/);
  assert.match(runtime,/export async function handleAgentProtocolRoute/);
});

test('agent protocol core remains schema-clean',()=>{
  const runtime=read('agent-protocol-core-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
