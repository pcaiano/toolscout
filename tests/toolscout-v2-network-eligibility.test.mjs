import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {networkOutreachEligibility} from '../distribution-network-worker.js';

const orch=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const net=fs.readFileSync(new URL('../distribution-network-worker.js',import.meta.url),'utf8');

test('directory-like surfaces are not publisher-network outreach candidates',()=>{
  assert.equal(networkOutreachEligibility({surface_type:'directory',action_url:'https://aitools.love/'}).eligible,false);
  assert.equal(networkOutreachEligibility({surface_type:'editorial_resource',action_url:'https://example.com/resources'}).eligible,true);
});

test('coordinator gates publisher contact work with network eligibility',()=>{
  assert.match(orch,/const networkOutreachEligible=networkOutreachEligibility\(row\)\.eligible/);
  assert.match(orch,/backlinkMissing&&networkOutreachEligible/);
  assert.match(orch,/acquisitionOpen&&networkOutreachEligible/);
});

test('targeted ineligible publisher contact task closes conclusively instead of recycling',()=>{
  assert.match(net,/outcome:'network_outreach_ineligible'/);
  assert.match(net,/conclusive:true/);
  assert.match(net,/surface_type_not_network_outreach/);
});
