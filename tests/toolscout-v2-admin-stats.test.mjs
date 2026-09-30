import test from 'node:test';
import assert from 'node:assert/strict';
import legacyStatsBase from '../authority-acquisition-worker.js';
import {reconcileOperationalTruth} from '../operational-truth-reconciliation-runtime.js';
import {handleAdminStatsRoute} from '../admin-stats-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';

async function legacyStatsFetch(request,env,ctx){
  let response=await legacyStatsBase.fetch(request,env,ctx);
  return reconcileOperationalTruth(response,env);
}

// Cloudflare Workers exposes the Cache API globally. Node's test runner does
// not, so provide a no-hit/no-op cache for legacy parity only.
globalThis.caches={
  default:{
    async match(){return undefined},
    async put(){return undefined}
  }
};

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
        async run(){writes++;writeSql.push(text);throw new Error('admin_stats_attempted_write')}
      };
    },
    async batch(statements){writes++;writeSql.push('BATCH:'+(Array.isArray(statements)?statements.length:'unknown'));throw new Error('admin_stats_attempted_batch_write')}
  };
  const assets={
    async fetch(request){
      const path=new URL(request.url).pathname;
      if(path.endsWith('.json'))return Response.json({status:'unavailable'});
      return new Response('not found',{status:404});
    }
  };
  return{env:{DB:db,ASSETS:assets,ADMIN_TOKEN:'secret'},get writes(){return writes},get writeSql(){return writeSql}};
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

test('admin stats GET has a direct owner while POST remains legacy',()=>{
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');
  assert.equal(routeOwner('/api/stats',{method:'POST'}).owner,'legacy_chain');
});

test('admin stats public host preserves Cloudflare Access boundary',async()=>{
  const state=fakeEnv();
  const noAuth=await handleAdminStatsRoute(
    new Request('https://trytoolscout.org/api/stats'),
    state.env,
    {}
  );
  assert.equal(noAuth.status,401);

  const bearerOnly=await handleAdminStatsRoute(
    new Request('https://trytoolscout.org/api/stats',{headers:{Authorization:'Bearer secret'}}),
    state.env,
    {}
  );
  assert.equal(bearerOnly.status,401);

  const access=await handleAdminStatsRoute(
    new Request('https://trytoolscout.org/api/stats',{
      headers:{'Cf-Access-Authenticated-User-Email':'pcaiano@gmail.com'}
    }),
    state.env,
    {}
  );
  assert.equal(access.status,200);
  assert.equal(access.headers.get('X-ToolScout-Read-Mode'),'read-only');
  assert.equal(state.writes,0);
});

test('admin stats internal host preserves legacy Bearer access',async()=>{
  const state=fakeEnv();
  const response=await handleAdminStatsRoute(
    new Request('https://toolscout-command-center.internal/api/stats',{
      headers:{Authorization:'Bearer secret'}
    }),
    state.env,
    {waitUntil(){}}
  );
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Read-Mode'),'read-only');
  assert.equal(response.headers.get('X-ToolScout-Compatibility-Composition'),'legacy-stats-v1');
  assert.equal(state.writes,0);
});

test('admin stats direct route matches legacy semantic shape without writes',async()=>{
  const a=fakeEnv(),b=fakeEnv();
  const request=new Request('https://trytoolscout.org/api/stats',{
    headers:{'Cf-Access-Authenticated-User-Email':'pcaiano@gmail.com'}
  });
  const [directResponse,legacyResponse]=await Promise.all([
    handleAdminStatsRoute(request.clone(),a.env,{}),
    legacyStatsFetch(request.clone(),b.env,{waitUntil(){}})
  ]);

  assert.equal(directResponse.status,200);
  assert.equal(legacyResponse.status,200);
  assert.equal(directResponse.headers.get('Access-Control-Allow-Origin'),legacyResponse.headers.get('Access-Control-Allow-Origin'));
  assert.equal(directResponse.headers.get('X-ToolScout-Read-Mode'),'read-only');
  assert.equal(directResponse.headers.get('X-ToolScout-Route-Contract'),'v2');
  assert.equal(directResponse.headers.get('X-ToolScout-Compatibility-Composition'),'legacy-stats-v1');

  const direct=await directResponse.json();
  const legacyBody=await legacyResponse.json();

  assert.deepEqual(stableShape(direct),stableShape(legacyBody));
  assert.equal(direct.measurementAudit?.status,legacyBody.measurementAudit?.status);
  assert.equal(direct.operationalTruthReconciliation?.version,legacyBody.operationalTruthReconciliation?.version);
  assert.equal(a.writes,0,JSON.stringify(a.writeSql));
  assert.equal(b.writes,0,JSON.stringify(b.writeSql));
});

test('admin stats owner ignores unrelated routes and POST',async()=>{
  const state=fakeEnv();
  assert.equal(await handleAdminStatsRoute(
    new Request('https://trytoolscout.org/api/traffic-integrity-health'),state.env
  ),null);
  assert.equal(await handleAdminStatsRoute(
    new Request('https://trytoolscout.org/api/stats',{method:'POST'}),state.env
  ),null);
  assert.equal(state.writes,0);
});
