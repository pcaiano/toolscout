import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const authorityDrain=fs.readFileSync(new URL('../growth-runtime-authority-drain-worker.js',import.meta.url),'utf8');
const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const network=fs.readFileSync(new URL('../distribution-network-worker.js',import.meta.url),'utf8');
const executionContract=fs.readFileSync(new URL('../growth-execution-contract.js',import.meta.url),'utf8');
const contentEngine=fs.readFileSync(new URL('../content-engine-intelligence-worker.js',import.meta.url),'utf8');

test('authority sender drain follows the canonical ToolScout 2.0 hourly contract',()=>{
  assert.match(authorityDrain,/import \{TOOLSCOUT_CRONS\} from '\.\/runtime-schedule-contract\.js'/);
  assert.match(authorityDrain,/event\?\.cron\|\|'scheduled'\)!==TOOLSCOUT_CRONS\.hourly/);
  assert.doesNotMatch(authorityDrain,/!=='15 \* \* \* \*'/);
});

test('strict-human evidence materializes a scale-proven surface without bypassing competitor policy',()=>{
  assert.match(orchestrator,/const provenSurface=humanOrCommercialSignal\|\|Number\(row\.route_verified\|\|0\)>0/);
  assert.match(orchestrator,/if\(externalSurface&&provenSurface&&!competitiveSurface\)actions\.unshift\('scale_proven_surface'\)/);
  assert.match(orchestrator,/proven_surface:provenSurface/);
  assert.match(orchestrator,/human_or_commercial_signal:humanOrCommercialSignal/);
});

test('execution admission accepts strict-human proven surfaces before live status',()=>{
  assert.match(executionContract,/growth_execution_contract\.action='scale_proven_surface'/);
  assert.match(executionContract,/distribution_economic_learning proven/);
  assert.match(executionContract,/COALESCE\(proven\.browser_confirmed_sessions_30d,0\)>0/);
  assert.match(executionContract,/COALESCE\(proven\.outbound_clicks_30d,0\)>0/);
  assert.match(executionContract,/COALESCE\(proven\.monetized_outbound_30d,0\)>0/);
});

test('proven human content routes are repeatable but bounded',()=>{
  assert.match(network,/MAX_PROVEN_ROUTE_CONTENT_ATTEMPTS=4/);
  assert.match(network,/PROVEN_ROUTE_REPEAT_COOLDOWN_HOURS=72/);
  assert.match(network,/async function rearmProvenContentRoutes/);
  assert.match(network,/status='verified_human_impact'/);
  assert.match(network,/last_result='proven_human_source_repeat_due'/);
  assert.match(contentEngine,/a\.last_result='proven_human_source_repeat_due' AND a\.attempts<4/);
  assert.match(contentEngine,/CASE WHEN a\.last_result='proven_human_source_repeat_due' THEN 0 ELSE 1 END/);
});

test('scale proof recognizes already-proven outcomes rather than requiring a new adoption in the same cycle',()=>{
  assert.match(network,/async function provenSurfaceEvidence/);
  assert.match(network,/const alreadyProven=strictSessions>0\|\|outboundClicks>0\|\|monetizedOutbound>0/);
  assert.match(network,/outcome:scaled\?'proven_surface_rearmed':alreadyProven\?'proven_surface_confirmed'/);
  assert.match(network,/verified:alreadyProven\|\|scaled/);
});
