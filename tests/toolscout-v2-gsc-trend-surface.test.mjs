import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GSC trend surface has one explicit route owner',()=>{
  const runtime=read('gsc-command-center-visible-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleGscTrendSurfaceRoute/);
  assert.match(contract,/owner:'gsc_trend_surface'/);
  assert.match(compute,/ownership\.owner==='gsc_trend_surface'/);
  assert.match(compute,/handleGscTrendSurfaceRoute/);

  for(const path of ['/api/gsc-trend.svg','/api/gsc-trend.css','/api/health']){
    assert.ok(contract.includes(path),path+' must stay in the explicit GSC trend surface contract');
  }
});

test('GSC trend SVG and CSS remain no-store and versioned',()=>{
  const runtime=read('gsc-command-center-visible-worker.js');
  assert.match(runtime,/SURFACE_VERSION=9/);
  assert.match(runtime,/image\/svg\+xml; charset=UTF-8/);
  assert.match(runtime,/text\/css; charset=UTF-8/);
  assert.match(runtime,/cache-control':'no-store/);
  assert.match(runtime,/gsc-trend\.svg\?v=\$\{SURFACE_VERSION\}/);
  assert.match(runtime,/trailingIncompleteDays:'excluded'/);
});

test('api health enrichment still composes the lower runtime before adding trend evidence',()=>{
  const runtime=read('gsc-command-center-visible-worker.js');
  const health=runtime.indexOf("url.pathname==='/api/health'");
  const lower=runtime.indexOf('await base.fetch(request,env,ctx)',health);
  const evidence=runtime.indexOf('d.gscTrendSurface=',health);
  assert.ok(health>=0&&lower>health&&evidence>lower,'health must remain lower-runtime -> GSC trend enrichment');
  assert.match(runtime,/strategy:'compact-container-svg'/);
});

test('generic request traversal bypasses the visible GSC decorator',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-autonomous-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-autoload-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-resilient-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-final-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-details-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-chart-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-guard-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-live-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/outbound-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/mission-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/mission-integrity-v2-worker\.js'/);
  assert.match(compute,/handleMissionIntegrityRoute.*from '\.\/mission-integrity-v2-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-final-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-light-theme-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-closed-loop-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-observability-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-authority-drain-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-trend-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-visible-worker\.js'/);
});
