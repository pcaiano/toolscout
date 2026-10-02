import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const baseOf=p=>{
  const match=read(p).match(/import\s+base(?:,[^\n]*?)?\s+from\s+['"]\.\/([^'"]+)['"]/);
  return match?.[1]||null;
};
const baseChain=(start,max=100)=>{
  const out=[];
  const seen=new Set();
  let current=start;
  while(current&&out.length<max&&!seen.has(current)){
    seen.add(current);
    out.push(current);
    current=baseOf(current);
  }
  return out;
};

test('generic ToolScout 2.0 traversal bypasses revenue',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/revenue-worker\.js'/);

  const chain=baseChain('compute-router-worker.js');
  assert.deepEqual(chain.slice(0,3),[
    'compute-router-worker.js',
    'funnel-worker.js',
    'worker.js'
  ]);
});

test('revenue remains bounded inside the protected admin stats compatibility composition',()=>{
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');
  assert.equal(routeOwner('/analytics.html',{method:'GET'}).owner,'command_center_direct');

  const stats=read('admin-stats-runtime.js');
  assert.match(stats,/import legacyStatsBase from '\.\/authority-acquisition-worker\.js'/);
  assert.match(stats,/legacyStatsBase\.fetch\(request,env,ctx\)/);

  const protectedChain=baseChain('authority-acquisition-worker.js');
  assert.ok(protectedChain.includes('distribution-discovery-worker.js'));
  assert.ok(protectedChain.includes('revenue-worker.js'));
  assert.ok(protectedChain.indexOf('revenue-worker.js')>protectedChain.indexOf('distribution-discovery-worker.js'));

  const revenue=read('revenue-worker.js');
  assert.match(revenue,/import base from '\.\/worker\.js'/);
  assert.match(revenue,/url\.pathname === '\/api\/stats'/);
  assert.match(revenue,/revenueSnapshot/);
  assert.match(revenue,/commercialSnapshot/);
  assert.match(revenue,/trafficSnapshot/);
  assert.match(revenue,/trackingHealth/);
  assert.doesNotMatch(revenue,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
