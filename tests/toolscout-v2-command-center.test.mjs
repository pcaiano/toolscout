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
  const owner=read('ga4-owner-context.js');
  assert.match(entry,/ownership\.owner==='command_center_direct'/);
  assert.match(entry,/ownership\.owner==='command_center_schema_control'/);
  assert.match(truth,/export async function handleCommandCenterDirectRoute/);
  assert.match(truth,/COMMAND_CENTER_SESSION_COOKIE/);
  assert.match(truth,/Response\.redirect\(target\.toString\(\),308\)/);
  assert.doesNotMatch(truth,/import base|base\.fetch|CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.doesNotMatch(facade,/operational-truth-reconciliation-worker/);
  assert.match(facade,/command-center-business-truth-runtime\.js/);
  assert.match(truth,/import \{withOwnerMarker\} from '\.\/ga4-owner-context\.js'/);
  assert.match(truth,/simplifiedPage\(null,env,request\)/);
  assert.match(truth,/return withOwnerMarker\(new Response\(commandCenterHtml\(\)/);
  assert.match(owner,/toolscout_owner/);
  assert.match(owner,/toolscout_owner_since/);
  assert.match(owner,/campaign_source:'\$\{OWNER_SOURCE\}'/);
  assert.match(entry,/import base from '\.\/affiliate-human-action-entry-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-autoload-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-resilient-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-human-truth-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-human-truth-final-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-human-truth-details-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-human-truth-chart-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/owner-exclusion-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/traffic-integrity-guard-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/traffic-integrity-live-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/outbound-integrity-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/visitor-integrity-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/traffic-integrity-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-integrity-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/mission-integrity-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/mission-integrity-v2-worker\.js'/);
  assert.match(entry,/handleMissionIntegrityRoute.*from '\.\/mission-integrity-v2-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-final-integrity-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-light-theme-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/growth-runtime-integrity-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/growth-runtime-closed-loop-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/growth-runtime-observability-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/growth-runtime-authority-drain-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/gsc-command-center-trend-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/gsc-command-center-visible-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-health-language-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/command-center-ga4-worker\.js'/);
  assert.doesNotMatch(entry,/import base from '\.\/d1-read-budget-worker\.js'/);
  assert.match(entry,/injectToolScoutSocialFooter/);
  assert.match(entry,/async function legacyFallback/);
  assert.equal(fs.existsSync(new URL('../operational-truth-reconciliation-worker.js',import.meta.url)),false);
});
