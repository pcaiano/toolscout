import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fetchOfficial} from '../catalog-autonomy-worker.js';

const source=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
const verify=source.slice(source.indexOf('export async function verifyBatch(env)'),source.indexOf('function validCandidate(',source.indexOf('export async function verifyBatch(env)')));

test('quality fetch skips a vendor without starting network requests once its deadline has no safe runway',async()=>{
  const previous=globalThis.fetch;
  let requests=0;
  globalThis.fetch=()=>{requests++;throw Error('expired quality fetch must not execute');};
  try{
    const response=await fetchOfficial('https://docs.vendor.example/features',{deadlineAt:Date.now()+2000});
    assert.equal(response.status,'network_warning');
    assert.equal(response.error,'quality_cycle_budget_deferred');
    assert.equal(requests,0);
  }finally{globalThis.fetch=previous;}
});

test('slow first-party request respects the remaining quality-cycle network window',async()=>{
  const previous=globalThis.fetch;
  let requests=0;
  globalThis.fetch=(_url,{signal})=>{
    requests++;
    return new Promise((_resolve,reject)=>{
      if(signal.aborted)return reject(Object.assign(new Error('aborted'),{name:'AbortError'}));
      signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    });
  };
  try{
    const started=Date.now();
    const result=await fetchOfficial('https://docs.vendor.example/pricing',{deadlineAt:started+8300});
    assert.equal(result.error,'quality_cycle_budget_deferred');
    assert.equal(result.status,'network_warning');
    assert.equal(requests,1,'no second fetch once the quality cycle has reached its reserved finalisation window');
    assert.ok(Date.now()-started<2000,'an unresponsive manufacturer cannot consume the full 180-second mission');
  }finally{globalThis.fetch=previous;}
});

test('quality cycle never mislabels skipped documents as feature removal or proceeds to vendor-state D1 writes',()=>{
  assert.match(verify,/fetchOfficial\(verifyUrl,\{deadlineAt\}\)/);
  assert.match(verify,/if\(result\.error==='quality_cycle_budget_deferred'\)\{cycleBudgetExhausted=true;return;\}/);
  assert.match(verify,/fetchDocument:async url=>\{/);
  assert.match(verify,/fetchOfficial\(url,\{deadlineAt\}\)/);
  assert.match(verify,/if\(documentBudgetDeferred\|\|Date\.now\(\)>=deadlineAt\)\{cycleBudgetExhausted=true;return;\}/);
  assert.ok(verify.indexOf('if(documentBudgetDeferred')<verify.indexOf('await correctManufacturerCatalogFacts('));
  assert.ok(verify.indexOf('if(documentBudgetDeferred')<verify.indexOf('INSERT INTO catalog_runtime_state('));
  assert.match(source,/Math\.min\(FETCH_TIMEOUT_MS,available\)/);
  assert.match(verify,/cycle_budget_exhausted:cycleBudgetExhausted/);
  assert.match(verify,/verifyManufacturerDocuments\(env,tool/);
});
