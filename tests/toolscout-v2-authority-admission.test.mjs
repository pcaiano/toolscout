import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {genericBatchAdmissionWhere} from '../growth-execution-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution network admits only currently actionable external authority surfaces',()=>{
  const where=genericBatchAdmissionWhere('distribution_network');
  assert.match(where,/source_kind='supervisor'/);
  assert.match(where,/source_kind='opportunity'/);
  assert.match(where,/publisher_contact_discovery/);
  assert.match(where,/execute_alternate_routes/);
  assert.match(where,/scale_proven_surface/);
  assert.match(where,/authority_surface\.status IN \('discovered','candidate','research_required','deferred','stale'\)/);
  assert.match(where,/growth_execution_contract\.action='scale_proven_surface' AND authority_surface\.status IN \('live','verified'\)/);
  assert.match(where,/COALESCE\(authority_surface\.human_required,0\)=0/);
  assert.match(where,/NOT LIKE 'https:\/\/trytoolscout\.org\/%'/);
  assert.match(where,/toolscout-machine-discovery/);
});

test('autonomous distribution separates qualification from backlink verification states',()=>{
  const where=genericBatchAdmissionWhere('distribution_autonomous');
  assert.match(where,/autonomous_route_qualification/);
  assert.match(where,/verify_backlink_acquisition/);
  assert.match(where,/authority_surface\.status IN \('submitted','pending_review','live','verified'\)/);
  assert.doesNotMatch(where,/publisher_contact_discovery/);
  assert.doesNotMatch(where,/scale_proven_surface/);
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
