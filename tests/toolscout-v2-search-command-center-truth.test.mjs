import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const truth=fs.readFileSync(new URL('../command-center-business-truth-runtime.js',import.meta.url),'utf8');
const view=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

test('Command Center search truth reads only active search execution contracts',()=>{
  assert.match(truth,/const \[supervisorRows,contractRows,seoExecutionRows,gscSignals/);
  assert.match(truth,/c\.executor='seo_cloudflare'/);
  assert.match(truth,/c\.subject_type='search'/);
  assert.match(truth,/g\.status='active'/);
  assert.match(truth,/JOIN json_each\(g\.action_json\) j ON j\.value=c\.action/);
  assert.match(truth,/GROUP BY c\.action,c\.status/);
});

test('search execution preserves unavailable instead of manufacturing zero',()=>{
  assert.match(truth,/\.all\(\)\.then\(r=>r\.results\|\|\[\]\)\.catch\(\(\)=>null\)/);
  assert.match(truth,/const searchExecutionAvailable=Array\.isArray\(seoExecutionRows\)/);
  assert.match(truth,/\{available:false,states:null,actions:null,total:null,ready:null,inFlight:null,deferred:null,verified:null,stalled:null/);
  assert.match(truth,/execution:searchExecution/);
  assert.match(view,/SEO execution truth unavailable\. Contract counts are not being converted to zero\./);
});

test('search execution exposes lifecycle totals and per-intervention status',()=>{
  assert.match(truth,/searchExecution\.ready=truthNum\(searchExecution\.states\.pending\)/);
  assert.match(truth,/searchExecution\.inFlight=truthNum\(searchExecution\.states\.claimed\)\+truthNum\(searchExecution\.states\.attempted\)/);
  assert.match(truth,/searchExecution\.deferred=truthNum\(searchExecution\.states\.deferred\)/);
  assert.match(truth,/searchExecution\.verified=truthNum\(searchExecution\.states\.verified\)/);
  assert.match(truth,/searchExecution\.stalled=truthNum\(searchExecution\.states\.stalled\)/);
  assert.match(view,/Search execution · active demand contracts/);
  assert.match(view,/By intervention/);
  assert.match(view,/Verified means the current active search contract has task-specific execution proof/);
});

test('search execution card prioritizes concrete SEO interventions',()=>{
  assert.match(view,/repair_indexing/);
  assert.match(view,/repair_canonical_alignment/);
  assert.match(view,/deepen_existing_search_asset/);
  assert.match(view,/improve_click_capture/);
  assert.match(view,/strengthen_internal_links/);
});
