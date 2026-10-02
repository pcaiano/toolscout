import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleVisitorAccuracyRoute,transformVisitorAccuracyPublicResponse} from '../visitor-accuracy-worker.js';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('visitor write API has direct ToolScout 2.0 ownership',async()=>{
  assert.equal(routeOwner('/api/visitor',{method:'POST'}).owner,'visitor_accuracy');
  assert.equal(routeOwner('/api/visitor',{method:'OPTIONS'}).owner,'visitor_accuracy');
  const preflight=await handleVisitorAccuracyRoute(new Request('https://trytoolscout.org/api/visitor',{method:'OPTIONS'}),{});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://trytoolscout.org');
  assert.equal(await handleVisitorAccuracyRoute(new Request('https://trytoolscout.org/api/not-visitor'),{}),null);
});

test('public visitor tracker is an explicit response stage',async()=>{
  const request=new Request('https://trytoolscout.org/tools/example');
  const response=new Response('<html><body>tool</body></html>',{headers:{'Content-Type':'text/html; charset=UTF-8'}});
  const transformed=await transformVisitorAccuracyPublicResponse(request,response);
  assert.match(await transformed.text(),/data-toolscout-visitor-tracker="1"/);
});

test('analytics pages stay outside the public visitor tracker stage',async()=>{
  const request=new Request('https://trytoolscout.org/analytics');
  const response=new Response('<html><body>analytics</body></html>',{headers:{'Content-Type':'text/html; charset=UTF-8'}});
  const transformed=await transformVisitorAccuracyPublicResponse(request,response);
  assert.doesNotMatch(await transformed.text(),/data-toolscout-visitor-tracker/);
});

test('generic response ordering preserves visitor accuracy before later public transforms',()=>{
  const compute=read('compute-router-worker.js');
  const lower=compute.indexOf('await base.fetch(request,env,ctx)');
  const accuracy=compute.indexOf('transformVisitorAccuracyPublicResponse(request,response)');
  const rss=compute.indexOf('transformRssPublicResponse(request,response)');
  const core=compute.indexOf('transformTrafficIntegrityCoreResponse(request,response)');
  const guard=compute.indexOf('transformTrafficIntegrityGuardResponse(request,response)');
  const live=compute.indexOf('transformTrafficIntegrityLiveResponse(request,response)');
  const visitorLink=compute.indexOf('applyVisitorIntegrityLink(request,env,url,response,visitorEvent)');
  const visitorCookie=compute.indexOf('decorateVisitorIntegrityResponse(request,url,response)');
  const canonical=compute.indexOf('transformPublicCanonicalResponse(request,response)');
  const owner=compute.indexOf('applyMarkedOwnerAnalytics(request,response)');
  const seo=compute.indexOf('transformSeoPublicPage(request,response,env)');
  const footer=compute.indexOf('injectToolScoutSocialFooter(response)');
  const order=[lower,accuracy,rss,core,guard,live,visitorLink,visitorCookie,canonical,owner,seo,footer];
  assert.ok(order.every((v,i)=>v>=0&&(i===0||v>order[i-1])));
  assert.match(compute,/import base from '\.\/worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
});

test('visitor accuracy direct owner remains migration-only',()=>{
  const runtime=read('visitor-accuracy-worker.js');
  assert.match(runtime,/export async function handleVisitorAccuracyRoute/);
  assert.match(runtime,/export async function transformVisitorAccuracyPublicResponse/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(runtime,/visitor_accuracy_schema_not_migrated/);
});
