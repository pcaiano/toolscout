import test from 'node:test';
import assert from 'node:assert/strict';
import {withPrivateAssets, privateAssetPaths} from '../private-assets.js';

test('private files cannot reach the public asset fallback, including encoded paths', async () => {
  let calls=0;
  const worker=withPrivateAssets({fetch(){calls++;return new Response('private');}});
  for(const path of [...privateAssetPaths,'/data/%61ffiliate-pipeline.json','/data/affiliate-pipeline.json/']) {
    const r=await worker.fetch(new Request('https://trytoolscout.org'+path),{},{});
    assert.equal(r.status,404);
    assert.equal(r.headers.get('cache-control'),'no-store');
  }
  assert.equal(calls,0);
});
test('public catalog keeps recommendation fields and omits commercial metadata', async () => {
  const data=[{slug:'podia',name:'Podia',scores:{ease:8},sourceUrl:'https://www.podia.com/',commission:'private terms',affiliateProgram:'private status',affiliateUrl:'private'}];
  const env={ASSETS:{fetch:async()=>Response.json(data)}};
  const worker=withPrivateAssets({fetch(){throw new Error('unexpected fallback');}});
  for(const path of ['/data/tools.json','/data/pending-affiliate-tools.json']) {
    const result=await (await worker.fetch(new Request('https://trytoolscout.org'+path),env,{})).json();
    assert.deepEqual(result,[{slug:'podia',name:'Podia',scores:{ease:8},sourceUrl:'https://www.podia.com/'}]);
  }
  assert.equal((await (await env.ASSETS.fetch()).json())[0].commission,'private terms');
});
test('other requests and scheduled handlers retain original behavior',async()=>{
  const scheduled=()=>42;const env={},ctx={};const req=new Request('https://trytoolscout.org/api/health');
  const worker=withPrivateAssets({scheduled,fetch(r,e,c){assert.equal(r,req);assert.equal(e,env);assert.equal(c,ctx);return new Response('ok');}});
  assert.equal(worker.scheduled,scheduled);
  assert.equal(await (await worker.fetch(req,env,ctx)).text(),'ok');
});
