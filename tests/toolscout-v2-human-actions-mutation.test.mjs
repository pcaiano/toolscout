import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleHumanActionsMutationRoute} from '../human-action-entry-worker.js';
import {routeOwner} from '../runtime-route-contract.js';

async function sessionCookie(secret){
  const bucket=Math.floor(Date.now()/(86400*1000));
  const value=`toolscout-command-center:${secret}:${bucket}`;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `toolscout_cc=${hex}`;
}

function editorialEnv(){
  let writes=0;
  const db={
    prepare(sql){
      const text=String(sql);
      return{
        bind(){return this},
        async first(){
          if(text.includes('FROM distribution_editorial_queue'))return{
            queue_id:'q1',
            target_name:'Community',
            target_url:'https://example.com/listing',
            asset_url:'https://trytoolscout.org/tools/example'
          };
          return null;
        },
        async all(){return{results:[]}},
        async run(){writes++;return{success:true}}
      };
    },
    async batch(){writes++;return[]}
  };
  return{env:{DB:db,ADMIN_TOKEN:'secret'},get writes(){return writes}};
}

test('Phase 21 gives Human Actions mutations direct ownership and isolates schema reconcile',()=>{
  for(const pathname of [
    '/analytics/api/human-actions/credential',
    '/analytics/api/human-actions/gate',
    '/analytics/api/human-actions/editorial'
  ]){
    assert.equal(routeOwner(pathname,{method:'POST'}).owner,'analytics_human_actions_mutation');
  }
  assert.equal(routeOwner('/api/command-center-business-truth/reconcile-affiliate-schema',{method:'POST'}).owner,'command_center_schema_control');
  assert.equal(routeOwner('/analytics/api/human-actions',{method:'GET'}).owner,'analytics_human_actions');
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');
  assert.equal(routeOwner('/api/traffic-integrity-health',{method:'GET'}).owner,'traffic_integrity_health');
});

test('mutation owner rejects unauthenticated POSTs without writes',async()=>{
  const state=editorialEnv();
  for(const pathname of [
    '/analytics/api/human-actions/credential',
    '/analytics/api/human-actions/gate',
    '/analytics/api/human-actions/editorial'
  ]){
    const response=await handleHumanActionsMutationRoute(
      new Request('https://trytoolscout.org'+pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),
      state.env,
      {}
    );
    assert.equal(response.status,401);
  }
  assert.equal(state.writes,0);
});

test('direct editorial mutation preserves existing write contract',async()=>{
  const state=editorialEnv();
  const cookie=await sessionCookie('secret');
  const response=await handleHumanActionsMutationRoute(
    new Request('https://trytoolscout.org/analytics/api/human-actions/editorial',{
      method:'POST',
      headers:{'Content-Type':'application/json','Cookie':cookie},
      body:JSON.stringify({queue_id:'q1',status:'published'})
    }),
    state.env,
    {}
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body,{ok:true,queue_id:'q1',status:'published'});
  assert.equal(state.writes,2);
});

test('auth and human gate schema are migration-owned',()=>{
  const auth=fs.readFileSync(new URL('../auth-automation.js',import.meta.url),'utf8');
  const gate=fs.readFileSync(new URL('../human-gate-contract.js',import.meta.url),'utf8');
  const migration=fs.readFileSync(new URL('../migrations/0096_human_action_schema.sql',import.meta.url),'utf8');
  assert.doesNotMatch(auth,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.doesNotMatch(gate,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(auth,/auth_automation_schema_not_migrated/);
  assert.match(gate,/human_gate_schema_not_migrated/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS auth_automation_capability/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS auth_machine_credential/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS human_gate_contract/);
});

test('mutation handler ignores unrelated requests',async()=>{
  const state=editorialEnv();
  const response=await handleHumanActionsMutationRoute(
    new Request('https://trytoolscout.org/analytics/api/human-actions',{method:'GET'}),
    state.env,
    {}
  );
  assert.equal(response,null);
  assert.equal(state.writes,0);
});
