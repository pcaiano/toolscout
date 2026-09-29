import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../scripts/generate-software-trends-index.mjs',import.meta.url),'utf8');

test('Software Trends is a structured citation-ready dataset',()=>{
  assert.match(src,/const VERSION=4/);
  assert.match(src,/changeType/);
  assert.match(src,/buyerImpact/);
  assert.match(src,/decisionPagesFor/);
  assert.match(src,/primarySourceCount/);
  assert.match(src,/'@type':'Dataset'/);
  assert.match(src,/DataDownload/);
  assert.match(src,/Download the structured JSON dataset/);
});

test('Software Trends keeps affiliate status out of editorial selection',()=>{
  assert.match(src,/affiliate status out of inclusion decisions/i);
  assert.doesNotMatch(src,/commission.*sort|affiliate.*ranking|payout.*priority/i);
});

test('Software Trends preserves the existing canonical URL contract',()=>{
  assert.match(src,/const PAGE_URL=`${BASE}/software-trends-index.html`/);
  assert.match(src,/const DATA_URL=`${BASE}/software-trends-index.json`/);
});
