import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const discovery=fs.readFileSync(new URL('../distribution-discovery-worker.js',import.meta.url),'utf8');
const policy=fs.readFileSync(new URL('../distribution-outreach-policy.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0111_phase253_surface_governance.sql',import.meta.url),'utf8');
const config=JSON.parse(fs.readFileSync(new URL('../data/distribution-discovery-sources.json',import.meta.url),'utf8'));

test('curated brand-named discovery platforms receive explicit surface types',()=>{
  const types=config.guardrails.canonical_types||{};
  for(const host of ['sourceforge.net','getapp.com','softwareadvice.com','capterra.com','crozdesk.com','solutions.trustradius.com','aitools.fyi','easywithai.com']){
    assert.equal(types[host],'directory',host);
  }
  assert.equal(types['producthunt.com'],'launch_surface');
  assert.equal(types['ardregistry.org'],'agent_registry');
  assert.match(discovery,/canonicalTypes=guardrails\.canonical_types\|\|\{\}/);
  assert.match(discovery,/override\.surface_type\|\|canonicalTypes\[bareHost\]\|\|inferredType/);
});

test('source-owned subdomains are ignored unless the source exposes an exact submission route',()=>{
  assert.match(discovery,/function sameHostFamily\(a,b\)/);
  assert.match(discovery,/sameHostFamily\(x\.host,sourceHost\)&&!x\.direct_action/);
  assert.match(discovery,/direct_action:directAction/);
});

test('direct software-discovery competitors are blocked from outreach but not self-service discovery',()=>{
  for(const host of ['capterra.com','getapp.com','softwareadvice.com','crozdesk.com','sourceforge.net','aitools.fyi','easywithai.com']){
    assert.match(policy,new RegExp(host.replaceAll('.','\\.')));
  }
  assert.match(migration,/phase253_competitor_outreach_suppressed_self_service_only/);
  assert.match(migration,/distribution_network_outreach/);
  assert.match(migration,/status='suppressed_competitor'/);
});

test('legacy Phase 251 noise is cancelled without deleting legitimate placements',()=>{
  assert.match(migration,/wordpress-org/);
  assert.match(migration,/app-getfernand-com/);
  assert.match(migration,/office-angi-com/);
  assert.match(migration,/status='skipped'/);
  assert.match(migration,/status='cancelled'/);
  assert.match(migration,/status NOT IN \('live','verified','submitted','pending_review'\)/);
});
