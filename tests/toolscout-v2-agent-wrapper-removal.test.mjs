import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {transformPublicAnalyticsResponse} from '../public-analytics-runtime.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('analytics consent has direct ToolScout 2.0 ownership',()=>{
  const owner=routeOwner('/analytics-consent',{method:'GET'});
  assert.equal(owner.owner,'public_analytics_consent');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='public_analytics_consent'/);
  assert.match(compute,/handlePublicAnalyticsRoute\(request\)/);
});

test('generic request traversal bypasses the agent protocol compatibility wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-embed-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/agent-protocol-worker\.js'/);
  assert.match(compute,/const protectedLegacyBase=withPrivateAssets\(/);
  assert.match(compute,/transformPublicAnalyticsResponse\(request,response\)/);
});

test('legacy public response stage preserves canonical markup cleanup and consent UI',async()=>{
  const request=new Request('https://trytoolscout.org/example');
  const response=new Response('<!doctype html><html><head><title>x</title></head><body><a href="/tools/example.html">Example</a></body></html>',{
    headers:{'Content-Type':'text/html; charset=UTF-8','ETag':'abc','Content-Encoding':'gzip'}
  });
  const out=await transformPublicAnalyticsResponse(request,response);
  const html=await out.text();
  assert.match(html,/href="\/tools\/example"/);
  assert.doesNotMatch(html,/href="\/tools\/example\.html"/);
  assert.match(html,/id="ts-analytics-consent"/);
  assert.equal(out.headers.get('ETag'),null);
  assert.equal(out.headers.get('Content-Encoding'),null);
});

test('legacy protection remains before later public response transforms',()=>{
  const compute=read('compute-router-worker.js');
  const lower=compute.indexOf('protectedLegacyBase.fetch(request,env,ctx)');
  const analytics=compute.indexOf('transformPublicAnalyticsResponse(request,response)');
  const visitor=compute.indexOf('transformVisitorAccuracyPublicResponse(request,response)');
  assert.ok(analytics>=0&&lower>=0&&visitor>lower);
});
