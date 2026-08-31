import test from 'node:test';
import assert from 'node:assert/strict';
import { appendVerifiedSubId, summarizeLedger } from '../revenue-attribution.js';

const clickRef = 'clk_1e2d3c4b-5a69-4788-9abc-0123456789ab';

test('propagates a click reference only with explicit verified vendor support', () => {
  const entry={enabled:true,tracking:{subId:{supported:true,parameter:'tk',evidenceUrl:'https://help.systeme.io/article/1508-how-to-tag-an-affiliate-link'}}};
  const result=appendVerifiedSubId('https://systeme.io/?sa=affiliate',entry,clickRef);
  assert.equal(new URL(result.destination).searchParams.get('tk'),clickRef);
  assert.equal(result.subId,clickRef);
});

test('does not invent sub-ID propagation for unverified or disabled programs', () => {
  assert.deepEqual(appendVerifiedSubId('https://vendor.example/?via=x',{enabled:true},clickRef),{destination:'https://vendor.example/?via=x',subId:null});
  assert.deepEqual(appendVerifiedSubId('https://vendor.example/?via=x',{enabled:false,tracking:{subId:{supported:true,parameter:'sid',evidenceUrl:'https://vendor.example/docs'}}},clickRef),{destination:'https://vendor.example/?via=x',subId:null});
});

test('keeps lifecycle and attribution evidence distinct', () => {
  assert.deepEqual(summarizeLedger([
    {status:'pending',attribution_status:'unattributed'},
    {status:'paid',attribution_status:'vendor_confirmed'},
    {status:'reversed',attribution_status:'attributed'}
  ]),{
    lifecycle:{pending:1,confirmed:0,paid:1,reversed:1},
    attribution:{unattributed:1,attributed:1,vendor_confirmed:1}
  });
});
