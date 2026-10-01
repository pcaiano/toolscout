import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('generic request traversal bypasses the human action presentation wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/human-action-entry-worker\.js'/);
});

test('human action reads and mutations remain explicitly owned',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('human-action-entry-worker.js');
  assert.match(compute,/ownership\.owner==='analytics_human_actions'/);
  assert.match(compute,/handleAnalyticsHumanActionsRoute\(request,env\)/);
  assert.match(compute,/ownership\.owner==='analytics_human_actions_mutation'/);
  assert.match(compute,/handleHumanActionsMutationRoute\(request,env,ctx\)/);
  assert.match(compute,/import \{handleHumanActionsMutationRoute\} from '\.\/human-action-entry-worker\.js'/);
  assert.match(runtime,/export async function handleHumanActionsMutationRoute/);
});

test('removed generic wrapper has no runtime schema mutation',()=>{
  const runtime=read('human-action-entry-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
