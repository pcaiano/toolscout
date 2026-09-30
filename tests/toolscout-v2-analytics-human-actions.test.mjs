import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAnalyticsHumanActionsRoute} from '../analytics-human-actions-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';
import fs from 'node:fs';

async function sessionCookie(secret){
  const bucket=Math.floor(Date.now()/(86400*1000));
  const value=`toolscout-command-center:${secret}:${bucket}`;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `toolscout_cc=${hex}`;
}

function fakeEnv(){
  let writes=0;
  const db={
    prepare(){
      return {
        bind(){return this},
        async all(){return {results:[]}},
        async first(){return null},
        async run(){writes++;throw new Error('human_actions_get_attempted_write')}
      };
    },
    async batch(){writes++;throw new Error('human_actions_get_attempted_batch_write')}
  };
  const assets={
    async fetch(request){
      const path=new URL(request.url).pathname;
      if(path==='/data/affiliate-pipeline.json')return Response.json({verified_programs:[]});
      if(path==='/data/affiliate.json')return Response.json({});
      return Response.json({});
    }
  };
  return {env:{DB:db,ASSETS:assets,ADMIN_TOKEN:'secret'},get writes(){return writes}};
}

test('Human Actions GET has a direct Phase 5 owner while mutations stay operational',()=>{
  assert.equal(routeOwner('/analytics/api/human-actions',{method:'GET'}).owner,'analytics_human_actions');
  assert.equal(routeOwner('/analytics/api/human-actions/credential',{method:'POST'}).owner,'analytics_human_actions_mutation');
  assert.equal(routeOwner('/analytics/api/human-actions/gate',{method:'POST'}).owner,'analytics_human_actions_mutation');
  assert.equal(routeOwner('/analytics/api/human-actions/editorial',{method:'POST'}).owner,'analytics_human_actions_mutation');
});

test('Human Actions GET preserves Command Center session protection',async()=>{
  const state=fakeEnv();
  const response=await handleAnalyticsHumanActionsRoute(
    new Request('https://trytoolscout.org/analytics/api/human-actions'),
    state.env
  );
  assert.equal(response.status,401);
  assert.equal(state.writes,0);
});

test('Human Actions GET is strictly read-only',async()=>{
  const state=fakeEnv();
  const cookie=await sessionCookie('secret');
  const response=await handleAnalyticsHumanActionsRoute(
    new Request('https://trytoolscout.org/analytics/api/human-actions',{headers:{Cookie:cookie}}),
    state.env
  );
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Read-Mode'),'read-only');
  assert.equal(response.headers.get('X-ToolScout-Route-Contract'),'v2');
  const body=await response.json();
  assert.equal(body.total,0);
  assert.deepEqual(body.affiliate,[]);
  assert.deepEqual(body.distribution,[]);
  assert.equal(state.writes,0);
});

test('Human Actions read path no longer invokes schema or auth reconciliation',()=>{
  const src=fs.readFileSync(new URL('../human-action-entry-worker.js',import.meta.url),'utf8');
  const snapshot=src.slice(src.indexOf('export async function humanActionsReadSnapshot'),src.indexOf('export async function handleHumanActionsReadRoute'));
  assert.doesNotMatch(snapshot,/ensureHumanGateSchema|reconcileAuthAutomationClasses|\.run\(|\.batch\(/);
  assert.match(snapshot,/openHumanGatesReadOnly/);
});

test('direct owner ignores mutation methods',async()=>{
  const state=fakeEnv();
  const response=await handleAnalyticsHumanActionsRoute(
    new Request('https://trytoolscout.org/analytics/api/human-actions/credential',{method:'POST'}),
    state.env
  );
  assert.equal(response,null);
  assert.equal(state.writes,0);
});
