import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('business truth exposes the ToolScout 2.0 editorial portfolio',()=>{
  const truth=read('command-center-business-truth-runtime.js');
  assert.match(truth,/editorialAuthorityPortfolio/);
  assert.match(truth,/command-center-business-truth-v6-editorial-authority/);
  assert.match(truth,/averagePriorityScore/);
  assert.match(truth,/primarySourceLinks/);
  assert.match(truth,/\/reports\/editorial-authority-portfolio\.json/);
});

test('Command Center puts editorial authority beside business outcomes',()=>{
  const ui=read('command-center-simplified-view.js');
  assert.match(ui,/Business outcomes first: demand, traffic, authority, editorial depth and monetized outbound/);
  assert.match(ui,/id="editorialBody"/);
  assert.match(ui,/function editorialAuthority\(\)/);
  assert.match(ui,/Highest-priority authority gaps/);
  assert.match(ui,/It is not a Google ranking score/);
  assert.match(ui,/metric\('Referring domains'/);
  assert.match(ui,/metric\('Editorial portfolio'/);
  assert.match(ui,/gscProgress\(\);editorialAuthority\(\);brain\(\)/);
});

test('Command Center GET observability no longer mutates affiliate schema',()=>{
  const truth=read('command-center-business-truth-runtime.js');
  assert.match(truth,/affiliateNetworkEvidenceSchemaState/);
  assert.match(truth,/read_only_schema_probe/);
  const schemaControl=read('command-center-schema-control-runtime.js');
  assert.match(schemaControl,/reconcile-affiliate-schema/);
  assert.match(schemaControl,/migration_owned_read_only_probe/);
  assert.doesNotMatch(schemaControl,/CREATE TABLE|CREATE INDEX|ALTER TABLE|\.run\(|\.batch\(/);
  assert.doesNotMatch(truth,/buildCommandCenterBusinessTruth\(request,env\)\{\s*const affiliateEvidenceSchemaOk=await reconcileAffiliateNetworkEvidenceSchema/);
  const buildStart=truth.indexOf('async function buildCommandCenterBusinessTruth');
  const buildEnd=truth.indexOf('async function commandCenterBusinessTruth',buildStart);
  const buildBody=truth.slice(buildStart,buildEnd);
  assert.doesNotMatch(buildBody,/CREATE TABLE|CREATE INDEX|ALTER TABLE|reconcileAffiliateNetworkEvidenceSchema/);
});


test('Command Center read paths bypass the legacy wrapper chain',()=>{
  assert.equal(routeOwner('/analytics',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/analytics-v2',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/api/command-center-business-truth',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/api/command-center-simplified-health',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/api/command-center-business-truth/reconcile-affiliate-schema',{method:'POST'}).owner,'command_center_schema_control');

  const entry=read('compute-router-worker.js');
  const truth=read('command-center-business-truth-runtime.js');
  const facade=read('command-center-direct-runtime.js');
  assert.match(entry,/ownership\.owner==='command_center_direct'/);
  assert.match(entry,/ownership\.owner==='command_center_schema_control'/);
  assert.match(truth,/export async function handleCommandCenterDirectRoute/);
  assert.match(truth,/COMMAND_CENTER_SESSION_COOKIE/);
  assert.match(truth,/Response\.redirect\(target\.toString\(\),308\)/);
  assert.doesNotMatch(truth,/import base|base\.fetch|CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.doesNotMatch(facade,/operational-truth-reconciliation-worker/);
  assert.match(facade,/command-center-business-truth-runtime\.js/);
  assert.match(entry,/import base from '\.\/ga4-owner-exclusion-worker\.js'/);
  assert.match(entry,/injectToolScoutSocialFooter/);
  assert.match(entry,/async function legacyFallback/);
  assert.equal(fs.existsSync(new URL('../operational-truth-reconciliation-worker.js',import.meta.url)),false);
});
