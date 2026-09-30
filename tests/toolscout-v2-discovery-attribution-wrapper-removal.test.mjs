import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('generic traversal bypasses discovery attribution decorator',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/content-engine-intelligence-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
});

test('direct analytics stats retains discovery attribution truth',()=>{
  const resilient=read('command-center-resilient-worker.js');
  assert.match(resilient,/discoveryAttribution:\{status:'observed'/);
  assert.match(resilient,/Known sources use referrer or campaign evidence/);
  assert.match(resilient,/Unattributed deep entry means direct first entry on a non-home page and is not a proven channel/);
});

test('legacy discovery attribution wrapper remains compatibility-only',()=>{
  const legacy=read('discovery-attribution-worker.js');
  assert.match(legacy,/async function attributionSnapshot/);
  assert.match(legacy,/url\.pathname==='\/analytics\/api\/stats'/);
  assert.match(legacy,/ANALYTICS_PATHS\.has\(url\.pathname\)/);
  assert.doesNotMatch(legacy,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
