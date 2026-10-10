import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchOfficial} from '../catalog-autonomy-worker.js';

test('Codex P2: a shortened final vendor retry is deferred, never recorded as genuine source failure',async()=>{
  const realNow=Date.now;
  const realFetch=globalThis.fetch;
  const started=realNow();
  let virtualElapsed=0,requests=0;
  try{
    Date.now=()=>realNow()+virtualElapsed;
    globalThis.fetch=(_url,{signal})=>{
      requests++;
      if(requests===1){
        virtualElapsed=5900; // make the second attempt budget-constrained without sleeping six seconds
        return Promise.reject(new Error('temporary network error'));
      }
      return new Promise((_resolve,reject)=>{
        if(signal.aborted)return reject(Object.assign(new Error('aborted'),{name:'AbortError'}));
        signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
      });
    };
    const result=await fetchOfficial('https://docs.vendor.example/integrations',{deadlineAt:started+14500});
    assert.equal(requests,2,'the second retry was actually started');
    assert.equal(result.status,'network_warning');
    assert.equal(result.error,'quality_cycle_budget_deferred',
      'budget expiry cannot pollute the manufacturer warning ledger or trigger a false factual update');
  }finally{
    Date.now=realNow;
    globalThis.fetch=realFetch;
  }
});
