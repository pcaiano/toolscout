import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleAuthorityHealthRoute} from '../authority-health-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';
import {classifyAuthorityExecution} from '../growth-runtime-integrity-worker.js';
import {isQualifyingAuthorityBacklog,authorityInternalOwner} from '../growth-runtime-closed-loop-worker.js';

const closedLoopSource=fs.readFileSync(new URL('../growth-runtime-closed-loop-worker.js',import.meta.url),'utf8');

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


test('deferred-only authority inventory is qualification backlog, not execution failure',()=>{
  assert.equal(classifyAuthorityExecution({required:true,runnableQueue:0,deferredQueue:79,attempts24:0,attemptMin24h:4}),'qualifying_backlog');
  assert.equal(isQualifyingAuthorityBacklog({runnableQueue:0,deferredQueue:79},{externalAttemptObserved:false,handoffReady:false}),true);
});

test('qualification-only inventory is not treated as externally runnable authority work',()=>{
  assert.equal(classifyAuthorityExecution({required:true,runnableQueue:0,deferredQueue:0,qualificationQueue:1,attempts24:0,attemptMin24h:4}),'qualifying_backlog');
  assert.equal(isQualifyingAuthorityBacklog({runnableQueue:0,deferredQueue:0,qualificationQueue:1},{externalAttemptObserved:false,handoffReady:false}),true);
});

test('authority snapshot separates external execution from qualification work',()=>{
  assert.ok(closedLoopSource.includes("executor='make_sender' AND action IN ('backlink_reference_outreach','publisher_outreach') AND status IN ('pending','claimed') AND ${MAKE_SENDER_READY_CONDITION}) runnable_external_queue"));
  assert.ok(closedLoopSource.includes("action IN ('verify_backlink_acquisition','publisher_contact_discovery','execute_alternate_routes','autonomous_route_qualification') AND status IN ('pending','claimed','attempted','deferred','stalled')) qualification_queue"));
});

test('authority closed loop dispatches internal stages through canonical ToolScout 2.0 owners',()=>{
  assert.equal(authorityInternalOwner('/api/distribution/submissions/package',{method:'POST'}),'distribution_submission_runtime');
  assert.equal(authorityInternalOwner('/api/distribution/submissions/execute',{method:'POST'}),'distribution_throughput_runtime');
  assert.equal(authorityInternalOwner('/api/distribution/submissions/verify',{method:'POST'}),'distribution_submission_runtime');
  assert.equal(authorityInternalOwner('/api/distribution/autonomous/refresh',{method:'POST'}),'distribution_throughput_runtime');
  assert.equal(authorityInternalOwner('/api/distribution/network/refresh',{method:'POST'}),'distribution_network_runtime');
  assert.equal(authorityInternalOwner('/api/distribution/vendor-amplification/public-candidates',{method:'GET'}),'distribution_sender_runtime');
  assert.match(closedLoopSource,/dispatchAuthorityInternalRoute\(request,env,ctx\)/);
  assert.match(closedLoopSource,/owner==='distribution_submission_runtime'/);
  assert.match(closedLoopSource,/owner==='distribution_sender_runtime'/);
});

test('runnable authority work with zero attempts remains a real failure',()=>{
  assert.equal(classifyAuthorityExecution({required:true,runnableQueue:3,deferredQueue:20,attempts24:0,attemptMin24h:4}),'failed');
  assert.equal(isQualifyingAuthorityBacklog({runnableQueue:3,deferredQueue:20},{externalAttemptObserved:false,handoffReady:false}),false);
});

test('authority minimum attempt floor is aligned with the closed-loop contract',()=>{
  assert.equal(classifyAuthorityExecution({required:true,runnableQueue:2,deferredQueue:0,attempts24:3,attemptMin24h:4}),'underpowered');
  assert.equal(classifyAuthorityExecution({required:true,runnableQueue:2,deferredQueue:0,attempts24:4,attemptMin24h:4}),'executing');
});
