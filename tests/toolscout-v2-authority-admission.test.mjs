import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {genericBatchAdmissionWhere} from '../growth-execution-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution executors admit bounded authority opportunity work as well as supervisor directives',()=>{
  for(const executor of ['distribution_network','distribution_autonomous']){
    const where=genericBatchAdmissionWhere(executor);
    assert.match(where,/source_kind='supervisor'/);
    assert.match(where,/source_kind='opportunity'/);
    assert.match(where,/publisher_contact_discovery/);
    assert.match(where,/autonomous_route_qualification/);
    assert.match(where,/verify_backlink_acquisition/);
  }
});

test('affiliate generic batch remains supervisor-only',()=>{
  const where=genericBatchAdmissionWhere('affiliate_cycle');
  assert.equal(where," AND source_kind='supervisor'");
});

test('rebalance and claim share the same authority admission predicate',()=>{
  const src=read('growth-execution-contract.js');
  const uses=(src.match(/genericBatchAdmissionWhere\(executor\)/g)||[]).length;
  assert.ok(uses>=3,'admission predicate must guard pending retention, deferred promotion and claims');
  assert.match(src,/distribution_network:1/);
  assert.match(src,/distribution_autonomous:1/);
});
