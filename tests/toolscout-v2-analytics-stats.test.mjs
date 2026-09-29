import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAnalyticsStatsReadRoute} from '../command-center-resilient-worker.js';
import {routeOwner} from '../runtime-route-contract.js';

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
    prepare(sql){
      const text=String(sql);
      return {
        bind(){return this},
        async first(){
          if(text.includes("sqlite_master")&&text.includes("traffic_integrity_meta"))return {n:2};
          return null;
        },
        async all(){return {results:[]}},
        async run(){writes++;throw new Error('analytics_stats_read_attempted_write')}
      };
    },
    async batch(){writes++;throw new Error('analytics_stats_read_attempted_batch_write')}
  };
  const assets={
    async fetch(request){
      const path=new URL(request.url).pathname;
      if(path==='/sitemap.xml')return new Response('<?xml version="1.0"?><urlset><url><loc>https://trytoolscout.org/</loc></url></urlset>',{status:200,headers:{'Content-Type':'application/xml'}});
      if(path.endsWith('.json'))return Response.json({});
      return new Response('not found',{status:404});
    }
  };
  return {env:{DB:db,ASSETS:assets,ADMIN_TOKEN:'secret'},get writes(){return writes}};
}

test('analytics stats has a direct Phase 4 owner',()=>{
  assert.equal(routeOwner('/analytics/api/stats',{method:'GET'}).owner,'analytics_stats');
  assert.equal(routeOwner('/analytics/api/human-actions',{method:'GET'}).owner,'command_center');
});

test('analytics stats direct route preserves session protection',async()=>{
  const state=fakeEnv();
  const response=await handleAnalyticsStatsReadRoute(
    new Request('https://trytoolscout.org/analytics/api/stats'),
    state.env,
    {}
  );
  assert.equal(response.status,401);
  assert.equal(state.writes,0);
});

test('analytics stats direct route is read-only and preserves resilient payload',async()=>{
  const state=fakeEnv();
  const cookie=await sessionCookie('secret');
  const response=await handleAnalyticsStatsReadRoute(
    new Request('https://trytoolscout.org/analytics/api/stats',{headers:{Cookie:cookie}}),
    state.env,
    {}
  );
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Read-Mode'),'read-only');
  assert.equal(response.headers.get('X-ToolScout-Route-Contract'),'v2');
  const body=await response.json();
  assert.equal(body.resilientCommandCenter?.active,true);
  assert.equal(body.trafficTruth?.version,'strict-human-v1');
  assert.equal(state.writes,0);
});

test('analytics stats owner ignores unrelated analytics routes',async()=>{
  const state=fakeEnv();
  const response=await handleAnalyticsStatsReadRoute(
    new Request('https://trytoolscout.org/analytics/api/human-actions'),
    state.env,
    {}
  );
  assert.equal(response,null);
  assert.equal(state.writes,0);
});
