import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../seo-cloudflare-runtime-worker.js',import.meta.url),'utf8');
const executor=fs.readFileSync(new URL('../seo-execution-runtime.js',import.meta.url),'utf8');

test('click capture creates a bounded public meta description with a task-specific marker',()=>{
  assert.match(runtime,/function clickCaptureDescription/);
  assert.match(runtime,/function improveClickCapture/);
  assert.match(runtime,/execution_contract:improve_click_capture/);
  assert.match(runtime,/data-toolscout-click-capture="1"/);
  assert.match(runtime,/click_capture_description_too_short/);
  assert.match(runtime,/click_capture_description_too_long/);
});

test('click capture execution is only verified after the public mutation is visible',()=>{
  assert.match(executor,/async function verifyClickCaptureIntervention/);
  assert.match(executor,/ToolScout-SEO-Click-Capture-Probe\/1\.0/);
  assert.match(executor,/data-toolscout-click-capture/);
  assert.match(executor,/click_capture_not_yet_public/);
  assert.match(executor,/public_click_capture_verified/);
});

test('indexing repair requires a public self canonical page without noindex',()=>{
  assert.match(executor,/const noindex=\/\\bnoindex\\b\/i/);
  assert.match(executor,/indexable:canonicalVerified&&!noindex/);
  assert.match(executor,/async function verifyIndexabilityIntervention/);
  assert.match(executor,/public_indexability_verified/);
  assert.match(executor,/indexability_not_yet_public/);
});
