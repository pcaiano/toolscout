import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMachineDiscoveryCatalogRoute} from '../machine-discovery-catalog-runtime.js';
import {routeOwner} from '../runtime-route-contract.js';

function env(){
  return {
    DB:{
      prepare(){
        return {
          bind(){return this},
          async all(){return {results:[
            {asset_url:'https://trytoolscout.org/best-seo-tools-for-agencies',asset_type:'guide',last_seen_at:'2026-09-29 12:00:00'}
          ]}}
        };
      }
    }
  };
}

test('machine discovery endpoints are directly owned',()=>{
  assert.equal(routeOwner('/.well-known/toolscout-distribution.json',{method:'GET'}).owner,'machine_discovery_catalog');
  assert.equal(routeOwner('/.well-known/api-catalog',{method:'GET'}).owner,'machine_discovery_catalog');
  assert.equal(routeOwner('/.well-known/api-catalog',{method:'HEAD'}).owner,'machine_discovery_catalog');
});

test('distribution manifest is served directly and read-only',async()=>{
  const response=await handleMachineDiscoveryCatalogRoute(
    new Request('https://trytoolscout.org/.well-known/toolscout-distribution.json'),
    env()
  );
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.name,'ToolScout');
  assert.equal(body.descriptor,'Independent Software Discovery & Decision Engine');
  assert.equal(body.plugin_display_name,'ToolScout: Software Decision Engine');
  assert.equal(body.canonical_identity,'ToolScout | Independent Software Discovery & Decision Engine | trytoolscout.org');
  assert.equal(body.machine_discovery.api_catalog,'https://trytoolscout.org/.well-known/api-catalog');
  assert.deepEqual(body.recent_assets,['https://trytoolscout.org/best-seo-tools-for-agencies']);
});

test('api catalog supports GET and HEAD with the same linkset contract',async()=>{
  const get=await handleMachineDiscoveryCatalogRoute(
    new Request('https://trytoolscout.org/.well-known/api-catalog'),
    env()
  );
  assert.equal(get.status,200);
  assert.match(get.headers.get('content-type')||'',/application\/linkset\+json/);
  const body=await get.json();
  assert.equal(body.linkset[0].anchor,'https://trytoolscout.org/api/recommend');

  const head=await handleMachineDiscoveryCatalogRoute(
    new Request('https://trytoolscout.org/.well-known/api-catalog',{method:'HEAD'}),
    env()
  );
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
  assert.equal(head.headers.get('link'),'</.well-known/api-catalog>; rel="api-catalog"');
});

test('unrelated distribution routes remain outside this owner',async()=>{
  const response=await handleMachineDiscoveryCatalogRoute(
    new Request('https://trytoolscout.org/api/recommend?q=crm'),
    env()
  );
  assert.equal(response,null);
});
