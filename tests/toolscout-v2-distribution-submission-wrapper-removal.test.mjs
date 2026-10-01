import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionSubmissionRoute} from '../distribution-submission-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('submission package verify and list have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/submissions/package',{method:'POST'}).owner,'distribution_submission_runtime');
  assert.equal(routeOwner('/api/distribution/submissions/verify',{method:'POST'}).owner,'distribution_submission_runtime');
  assert.equal(routeOwner('/api/distribution/submissions',{method:'GET'}).owner,'distribution_submission_runtime');
  assert.equal(routeOwner('/api/distribution/submissions/execute',{method:'POST'}).owner,'distribution_throughput_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_submission_runtime'/);
  assert.match(compute,/handleDistributionSubmissionRoute\(request,env,ctx\)/);
});

test('direct submission owner preserves authorization',async()=>{
  for(const [path,method] of [
    ['/api/distribution/submissions/package','POST'],
    ['/api/distribution/submissions/verify','POST'],
    ['/api/distribution/submissions','GET'],
    ['/api/distribution/submissions/execute','POST']
  ]){
    const response=await handleDistributionSubmissionRoute(new Request('https://trytoolscout.org'+path,{method}),{});
    assert.equal(response.status,401);
    assert.match(await response.text(),/unauthorized/);
  }
});

test('generic traversal bypasses submission wrapper while throughput composes execute and scheduler',()=>{
  const compute=read('compute-router-worker.js');
  const throughput=read('distribution-throughput-worker.js');
  const runtime=read('distribution-submission-worker.js');
  assert.match(compute,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-submission-worker\.js'/);
  assert.match(throughput,/import base from '\.\/distribution-discovery-worker\.js'/);
  assert.match(throughput,/handleDistributionSubmissionRoute\(request,env,ctx\)/);
  assert.match(throughput,/runDistributionSubmissionScheduled\(event,env,ctx\)/);
  assert.match(runtime,/export async function handleDistributionSubmissionRoute/);
  assert.match(runtime,/export async function runDistributionSubmissionScheduled/);
  assert.match(runtime,/import \{runDistributionDiscoveryScheduled\} from '\.\/distribution-discovery-worker\.js'/);
  assert.match(runtime,/await runDistributionDiscoveryScheduled\(event,env,ctx\)/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
