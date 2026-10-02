import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionLearningRoute} from '../distribution-learning-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution learning surfaces have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/embed-event',{method:'POST'}).owner,'distribution_learning_runtime');
  assert.equal(routeOwner('/api/distribution/embed-event',{method:'OPTIONS'}).owner,'distribution_learning_runtime');
  assert.equal(routeOwner('/api/distribution/learning/refresh',{method:'POST'}).owner,'distribution_learning_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_learning_runtime'/);
  assert.match(compute,/handleDistributionLearningRoute\(request,env,ctx\)/);
});

test('learning owner preserves public preflight and admin authorization',async()=>{
  const preflight=await handleDistributionLearningRoute(
    new Request('https://trytoolscout.org/api/distribution/embed-event',{method:'OPTIONS'}),
    {}
  );
  assert.equal(preflight.status,204);

  const refresh=await handleDistributionLearningRoute(
    new Request('https://trytoolscout.org/api/distribution/learning/refresh',{method:'POST'}),
    {}
  );
  assert.equal(refresh.status,401);
  assert.match(await refresh.text(),/unauthorized/);
});

test('generic traversal bypasses learning wrapper while discovery composes its scheduler',()=>{
  const compute=read('compute-router-worker.js');
  const learning=read('distribution-learning-worker.js');
  const discovery=read('distribution-discovery-worker.js');

  assert.match(compute,/import base from '\.\/funnel-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-learning-worker\.js'/);

  assert.match(learning,/export async function handleDistributionLearningRoute/);
  assert.match(learning,/export async function runDistributionLearningScheduled/);
  assert.match(learning,/import \{runDistributionContactScheduled\} from '\.\/distribution-contact-worker\.js'/);
  assert.match(learning,/return runDistributionContactScheduled\(event,env,ctx\)/);
  assert.doesNotMatch(learning,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);

  assert.match(discovery,/import base from '\.\/revenue-worker\.js'/);
  assert.match(discovery,/import \{runDistributionLearningScheduled\} from '\.\/distribution-learning-worker\.js'/);
  assert.match(discovery,/await runDistributionLearningScheduled\(event,env,ctx\)/);
});
