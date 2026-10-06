import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../scripts/generate-software-trends-index.mjs',import.meta.url),'utf8');

test('Software Trends is a structured citation ready dataset',()=>{
  assert.match(src,/const VERSION=6/);
  assert.match(src,/changeType/);
  assert.match(src,/buyerImpact/);
  assert.match(src,/decisionPagesFor/);
  assert.match(src,/trendBreakdown/);
  assert.match(src,/windowStart/);
  assert.match(src,/vendorActivity/);
  assert.match(src,/evidenceHighlights/);
  assert.match(src,/pressFindings/);
  assert.match(src,/momentum/);
  assert.match(src,/aiConnectivitySnapshot/);
  assert.match(src,/'@type':'Dataset'/);
  assert.match(src,/measurementTechnique/);
  assert.match(src,/citation:citations/);
  assert.match(src,/DataDownload/);
  assert.match(src,/software-trends-index\.csv/);
  assert.match(src,/software-trends-index-share\.svg/);
  assert.match(src,/DOWNLOAD JSON/);
});

test('Software Trends is analysis rather than a duplicate chronological feed',()=>{
  assert.match(src,/Software change,/);
  assert.match(src,/Built to be cited, not just browsed/);
  assert.match(src,/Where the change is clustering/);
  assert.match(src,/rolling 30-day/i);
  assert.match(src,/Observed activity/);
  assert.match(src,/The releases behind the signals/);
  assert.match(src,/VIEW ALL WHAT&#39;S NEW/);
  assert.match(src,/Press findings/);
  assert.match(src,/Momentum/);
  assert.doesNotMatch(src,/const updateCards=updates\.map/);
});

test('Software Trends keeps affiliate status out of editorial selection',()=>{
  assert.match(src,/Affiliate status never changes inclusion, weighting or prominence/i);
  assert.doesNotMatch(src,/commission.*sort|affiliate.*ranking|payout.*priority/i);
});

test('Software Trends preserves the existing asset canonical URL contract',()=>{
  assert.ok(src.includes("const PAGE_URL=BASE+'/software-trends-index'"));
  assert.ok(src.includes("const DATA_URL=BASE+'/software-trends-index.json'"));
});

test('Software Trends uses the ToolScout 2.0 visual system and reduced motion support',()=>{
  assert.match(src,/--graphite:#0B0D0C/);
  assert.match(src,/--lime:#B7FF3C/);
  assert.match(src,/prefers-reduced-motion/);
  assert.match(src,/a:focus-visible/);
  assert.match(src,/class=\"skipLink\"/);
  assert.match(src,/role=\"progressbar\"/);
  assert.doesNotMatch(src,/<nav><a class=\"brand\"/);
});
