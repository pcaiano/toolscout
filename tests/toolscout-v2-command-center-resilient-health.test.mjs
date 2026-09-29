import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCommandCenterResilientHealthRoute} from '../command-center-resilient-health-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';

function fakeEnv(){
  let writes=0;
  const rows=[
    {
      queue_id:'q1',
      target_name:'Stremit',
      target_url:'https://example.com/stremit',
      suggested_title:'ToolScout stack',
      suggested_body:'Prepared content',
      status:'prepared'
    }
  ];
  const db={
    prepare(sql){
      return{
        bind(){return this},
        async all(){
          assert.match(String(sql),/FROM distribution_editorial_queue/);
          return{results:rows};
        },
        async first(){return null},
        async run(){writes++;throw new Error('resilient_health_attempted_write')}
      };
    },
    async batch(){writes++;throw new Error('resilient_health_attempted_batch_write')}
  };
  return{env:{DB:db},get writes(){return writes}};
}

test('resilient health has a direct ToolScout 2.0 owner',()=>{
  assert.equal(routeOwner('/api/command-center-resilient-health',{method:'GET'}).owner,'command_center_resilient_health');
  assert.equal(routeOwner('/api/command-center-resilient-health',{method:'POST'}).owner,'command_center');
});

test('resilient health direct route is read-only and preserves payload',async()=>{
  const state=fakeEnv();
  const response=await handleCommandCenterResilientHealthRoute(
    new Request('https://trytoolscout.org/api/command-center-resilient-health'),
    state.env
  );
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Read-Mode'),'read-only');
  assert.equal(response.headers.get('X-ToolScout-Route-Contract'),'v2');
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.service,'toolscout-command-center-resilient');
  assert.equal(body.version,6);
  assert.equal(body.statsMode,'direct-d1-resilient');
  assert.equal(body.trafficTruth,'strict-human-v1');
  assert.equal(body.preparedEditorialCount,1);
  assert.equal(body.stremitPayloadPresent,true);
  assert.equal(state.writes,0);
});

test('resilient health owner ignores unrelated routes and methods',async()=>{
  const state=fakeEnv();
  assert.equal(await handleCommandCenterResilientHealthRoute(
    new Request('https://trytoolscout.org/api/stats'),
    state.env
  ),null);
  assert.equal(await handleCommandCenterResilientHealthRoute(
    new Request('https://trytoolscout.org/api/command-center-resilient-health',{method:'POST'}),
    state.env
  ),null);
  assert.equal(state.writes,0);
});
