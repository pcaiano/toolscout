import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleAffiliateWorkflowRoute} from '../affiliate-workflow-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('affiliate and distribution workflow surfaces have direct ToolScout 2.0 ownership',()=>{
  for(const [path,method] of [
    ['/affiliate-workflow','GET'],
    ['/affiliate-workflow/api','GET'],
    ['/affiliate-workflow/api/reconcile','POST'],
    ['/distribution-workflow','GET'],
    ['/distribution-workflow/api','GET'],
    ['/distribution-workflow/api/example','POST']
  ])assert.equal(routeOwner(path,{method}).owner,'affiliate_workflow_runtime');

  assert.equal(routeOwner('/go/apollo',{method:'GET'}).owner,'affiliate_redirect');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='affiliate_workflow_runtime'/);
  assert.match(compute,/handleAffiliateWorkflowRoute\(request,env,ctx\)/);
});

test('direct workflow owner preserves page redirect and method boundaries',async()=>{
  const affiliatePage=await handleAffiliateWorkflowRoute(
    new Request('https://trytoolscout.org/affiliate-workflow',{method:'GET'}),
    {}
  );
  assert.equal(affiliatePage.status,301);
  assert.equal(new URL(affiliatePage.headers.get('location')).pathname,'/analytics.html');

  const distributionWrite=await handleAffiliateWorkflowRoute(
    new Request('https://trytoolscout.org/distribution-workflow',{method:'POST'}),
    {}
  );
  assert.equal(distributionWrite.status,405);
});

test('generic traversal bypasses affiliate workflow while compatibility module targets revenue directly',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('affiliate-workflow-worker.js');

  assert.match(compute,/import base from '\.\/revenue-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.match(runtime,/import base from '\.\/revenue-worker\.js'/);
  assert.match(runtime,/export async function handleAffiliateWorkflowRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
