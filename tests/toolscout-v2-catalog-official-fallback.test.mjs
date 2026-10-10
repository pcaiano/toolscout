import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedCandidateOfficialFallbackUrls,fetchTrustedCandidateOfficialSource}
  from '../catalog-autonomy-worker.js';
const cohort=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave4-decision-ready.json',import.meta.url),'utf8'));
const clio=cohort.find(x=>x.slug==='clio-manage');
assert.ok(clio);

test('only dated, first-party non-homepage manufacturer documents are usable for fallback',()=>{
  const docs=trustedCandidateOfficialFallbackUrls(clio);
  assert.equal(docs.length,2);
  assert.deepEqual(docs, [
    'https://help.clio.com/hc/en-us/articles/9285959663131-Create-Matters',
    'https://help.clio.com/hc/en-us/articles/9289741706779-Time-Entries'
  ]);
  assert.ok(docs.every(url=>url.startsWith('https://help.clio.com/hc/en-us/articles/')));
  const external='https://clio.com.evil.example/pricing';
  const tampered=structuredClone(clio);
  tampered.editorialReview.sourceUrls.unshift(external,'https://www.clio.com/');
  tampered.evidence.push({claimScope:'toolscout_editorial_review',sourceUrl:external,verifiedAt:'2026-10-10'});
  assert.deepEqual(trustedCandidateOfficialFallbackUrls(tampered),docs,'external site and homepage cannot bypass first-party gate');
  const unverified=structuredClone(clio);
  unverified.editorialReview.sourceUrls.push('https://www.clio.com/not-reviewed');
  assert.deepEqual(trustedCandidateOfficialFallbackUrls(unverified),docs,'unreviewed path is not evidence');
  assert.deepEqual(trustedCandidateOfficialFallbackUrls({...clio,decisionClaims:[]}),[],
    'no verified decision claims means no fallback permission');
});
test('homepage inaccessible but manufacturer case documentation reachable permits official source check',async()=>{
  const native=globalThis.fetch,calls=[];
  globalThis.fetch=async (url)=>{
    calls.push(String(url));
    if(String(url)==='https://www.clio.com/')
      return new Response('Forbidden',{status:403,headers:{'Content-Type':'text/html'}});
    if(String(url)==='https://help.clio.com/hc/en-us/articles/9285959663131-Create-Matters')
      return new Response('<html><head><title>Clio Case Management</title></head><body><main>Clio Manage handles matters, legal documents and case calendars.</main></body></html>',{status:200,headers:{'Content-Type':'text/html'}});
    throw Error('unexpected source fetch '+String(url));
  };
  try{
    const result=await fetchTrustedCandidateOfficialSource(clio);
    assert.equal(result.status,'ok');
    assert.equal(result.selectedSource,'manufacturer_document');
    assert.ok(result.finalUrl.startsWith('https://help.clio.com/hc/en-us/articles/'));
    assert.deepEqual(calls,['https://www.clio.com/','https://help.clio.com/hc/en-us/articles/9285959663131-Create-Matters']);
  }finally{globalThis.fetch=native}
});
test('redirect to off-domain or no reachable documents never becomes a trusted admission signal',async()=>{
  const native=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url)==='https://www.clio.com/')return new Response('Blocked',{status:403,headers:{'Content-Type':'text/html'}});
    const fake=new Response('<html><title>Injected outside content</title><body>Wrong domain</body></html>',
      {status:200,headers:{'Content-Type':'text/html'}});
    Object.defineProperty(fake,'url',{value:'https://external-fake.example/page'});
    return fake;
  };
  try{
    const result=await fetchTrustedCandidateOfficialSource(clio);
    assert.equal(result.status,'blocked_or_limited');
    assert.equal(result.selectedSource,'none');
    assert.equal(result.fallbackDocumentsAttempted,2);
  }finally{globalThis.fetch=native}
});
