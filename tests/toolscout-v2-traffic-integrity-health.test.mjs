import test from 'node:test';
import assert from 'node:assert/strict';
import legacyHealthBase from '../authority-acquisition-worker.js';
import {reconcileOperationalTruth} from '../operational-truth-reconciliation-runtime.js';
import {handleTrafficIntegrityHealthRoute} from '../traffic-integrity-health-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';

async function legacyHealthFetch(request,env,ctx){
  let response=await legacyHealthBase.fetch(request,env,ctx);
  return reconcileOperationalTruth(response,env);
}

function fakeEnv(){
  let writes=0;
  const writeSql=[];
  const db={
    prepare(sql){
      const text=String(sql);
      let bindings=[];
      return{
        bind(...args){bindings=args;return this},
        async first(){
          if(text.includes("sqlite_master")&&text.includes("name='external_engine_evidence'"))return{n:1};
          if(text.includes("sqlite_master"))return{n:bindings.length};
          if(text.includes("outbound_integrity_meta")&&text.includes("tracking_started_at"))return{value:'2026-09-01 00:00:00'};
          if(text.includes("traffic_integrity_meta")&&text.includes("strict_human_tracking_started_at"))return{value:'2026-09-01 00:00:00'};
          return null;
        },
        async all(){
          if(text.includes("session_identity_cleanup_v1")&&text.includes("visitor_registry_backfilled_at")){
            return{results:[
              {key:'session_identity_cleanup_v1',value:'2026-09-01 00:00:00'},
              {key:'visitor_registry_backfilled_at',value:'2026-09-01 00:00:00'},
              {key:'session_identity_rule',value:'one_session_one_visitor_first_valid_link_wins'}
            ]};
          }
          return{results:[]};
        },
        async run(){writes++;writeSql.push(text);throw new Error('traffic_integrity_health_attempted_write')}
      };
    },
    async batch(statements){writes++;writeSql.push('BATCH:'+(Array.isArray(statements)?statements.length:'unknown'));throw new Error('traffic_integrity_health_attempted_batch_write')}
  };
  const assets={
    async fetch(request){
      const path=new URL(request.url).pathname;
      if(path.endsWith('.json'))return Response.json({status:'unavailable'});
      return new Response('not found',{status:404});
    }
  };
  return{env:{DB:db,ASSETS:assets},get writes(){return writes},get writeSql(){return writeSql}};
}

function stableShape(value,prefix=''){
  const out=[];
  const walk=(v,p)=>{
    if(Array.isArray(v)){out.push(p+':array');return}
    if(v&&typeof v==='object'){
      out.push(p+':object');
      for(const key of Object.keys(v).sort())walk(v[key],p? p+'.'+key:key);
      return;
    }
    out.push(p+':'+(v===null?'null':typeof v));
  };
  walk(value,prefix);
  return out.sort();
}

test('traffic integrity health has a direct ToolScout 2.0 owner',()=>{
  assert.equal(routeOwner('/api/traffic-integrity-health',{method:'GET'}).owner,'traffic_integrity_health');
  assert.equal(routeOwner('/api/traffic-integrity-health',{method:'POST'}).owner,'legacy_chain');
});

test('direct traffic integrity health matches legacy semantic shape without writes',async()=>{
  const a=fakeEnv(),b=fakeEnv();
  const request=new Request('https://trytoolscout.org/api/traffic-integrity-health');
  const [directResponse,legacyResponse]=await Promise.all([
    handleTrafficIntegrityHealthRoute(request.clone(),a.env),
    legacyHealthFetch(request.clone(),b.env,{waitUntil(){}})
  ]);
  assert.equal(directResponse.status,200);
  assert.equal(legacyResponse.status,200);
  assert.equal(directResponse.headers.get('X-ToolScout-Read-Mode'),'read-only');
  assert.equal(directResponse.headers.get('X-ToolScout-Route-Contract'),'v2');

  const direct=await directResponse.json();
  const legacyBody=await legacyResponse.json();

  assert.deepEqual(stableShape(direct),stableShape(legacyBody));
  assert.equal(direct.canonical,legacyBody.canonical);
  assert.equal(direct.browserGuard?.status,legacyBody.browserGuard?.status);
  assert.equal(direct.strictHumanTruth?.version,legacyBody.strictHumanTruth?.version);
  assert.equal(direct.visitorIntegrity?.canonicalPopulation,legacyBody.visitorIntegrity?.canonicalPopulation);
  assert.equal(direct.operationalTruthReconciliation?.version,legacyBody.operationalTruthReconciliation?.version);
  assert.equal(a.writes,0);
  assert.equal(b.writes,0,JSON.stringify(b.writeSql));
});

test('direct traffic integrity health ignores unrelated routes and methods',async()=>{
  const state=fakeEnv();
  assert.equal(await handleTrafficIntegrityHealthRoute(
    new Request('https://trytoolscout.org/api/stats'),state.env
  ),null);
  assert.equal(await handleTrafficIntegrityHealthRoute(
    new Request('https://trytoolscout.org/api/traffic-integrity-health',{method:'POST'}),state.env
  ),null);
  assert.equal(state.writes,0);
});
