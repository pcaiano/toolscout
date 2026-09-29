import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuthorityHealthRoute} from '../authority-health-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';

function readOnlyDb(){
  let writes=0;
  const db={
    prepare(sql){
      return {
        bind(){return this},
        async first(){
          return {
            attempts24:0,queue:0,runnable_queue:0,deferred_queue:0,prepared:0,
            sender_claimed:0,sender_newest_claimed_at:null,sender_oldest_claimed_at:null
          };
        },
        async all(){return {results:[]}},
        async run(){writes++;throw new Error('read_path_attempted_write')}
      };
    }
  };
  return {db,get writes(){return writes}};
}

test('authority health GET is directly owned by ToolScout 2.0',()=>{
  const owner=routeOwner('/api/distribution/authority/closed-loop-health',{method:'GET'});
  assert.equal(owner.owner,'authority_health');
});

test('authority health GET is read-only',async()=>{
  const state=readOnlyDb();
  const response=await handleAuthorityHealthRoute(
    new Request('https://trytoolscout.org/api/distribution/authority/closed-loop-health?fresh=1'),
    {DB:state.db}
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.readOnly,true);
  assert.equal(body.owner,'authority_health_v2');
  assert.equal(body.senderDispatchReady,0);
  assert.equal(state.writes,0);
});

test('authority health owner does not claim unrelated requests',async()=>{
  const state=readOnlyDb();
  const response=await handleAuthorityHealthRoute(
    new Request('https://trytoolscout.org/api/distribution/authority/vetted-health'),
    {DB:state.db}
  );
  assert.equal(response,null);
  assert.equal(state.writes,0);
});
