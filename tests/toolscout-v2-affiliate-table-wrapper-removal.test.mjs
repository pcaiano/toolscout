import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleCommandCenterLocalLoginRoute,LOCAL_LOGIN_EXPIRES_AT} from '../command-center-local-login-runtime.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('expired local Command Center login has direct ToolScout 2.0 ownership',()=>{
  for(const path of ['/analytics/login','/analytics/login/']){
    assert.equal(routeOwner(path,{method:'GET'}).owner,'command_center_local_login');
  }
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='command_center_local_login'/);
  assert.match(compute,/handleCommandCenterLocalLoginRoute\(request,env\)/);
});

test('expired local login preserves fail-closed availability semantics',async()=>{
  assert.equal(LOCAL_LOGIN_EXPIRES_AT,1788972710);
  const request=new Request('https://trytoolscout.org/analytics/login?token=obsolete');
  const unavailable=await handleCommandCenterLocalLoginRoute(request,{});
  assert.equal(unavailable.status,503);
  assert.equal(await unavailable.text(),'Command Center unavailable');
  const expired=await handleCommandCenterLocalLoginRoute(request,{ADMIN_TOKEN:'configured'});
  assert.equal(expired.status,410);
  assert.equal(await expired.text(),'Login link expired');
  assert.equal(expired.headers.get('Cache-Control'),'no-store');
});

test('generic request traversal bypasses the affiliate table compatibility wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-command-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-affiliate-table-worker\.js'/);
  assert.match(compute,/const protectedLegacyBase=withPrivateAssets\(/);
});
