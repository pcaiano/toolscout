import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateIntegrityPayload,MISSION_CADENCE_LIMITS} from '../scripts/evaluate-v2-integrity-audit.mjs';
import {buildIntegrityIncidentSql} from '../scripts/persist-v2-integrity-report.mjs';
import fs from 'node:fs';

const missionRows=()=>Object.keys(MISSION_CADENCE_LIMITS).map(key=>{
  const [engine,mission]=key.split(':');
  return {
    engine,
    mission,
    status:'completed',
    age_minutes:1,
    completed_age_minutes:1
  };
});

const payload=()=>[
  {results:[{active_actions:12,missing_contracts:0,missing_executors:0}]},
  {results:[{orphan_nonterminal_contracts:0}]},
  {results:[{architecture_incidents_open:0}]},
  {results:[{stale_compute_leases:0,due_compute_jobs:0}]},
  {results:[{invalid_human_gates:0}]},
  {results:missionRows()},
  {results:[{diversified_sources:12,diversified_sources_due:0,diversified_sources_exhausted:4,ready_email:0,ready_route:2,cooldown:3,researching:1,email_discovered_unrouted:2}]},
  {results:[{gsc_cached_assets:2,outbound_events_24h:4,internal_verified_backlinks:8,internal_verified_authority_surfaces:6}]}
];

test('fresh running critical mission is healthy when a recent completed baseline exists',()=>{
  const data=payload();
  const row=data[5].results.find(x=>x.engine==='distribution'&&x.mission==='autonomous_cycle');
  Object.assign(row,{status:'running',age_minutes:1,completed_age_minutes:16});
  assert.doesNotThrow(()=>evaluateIntegrityPayload(data));
});

test('running critical mission fails when it exceeds the running grace window',()=>{
  const data=payload();
  const row=data[5].results.find(x=>x.engine==='distribution'&&x.mission==='autonomous_cycle');
  Object.assign(row,{status:'running',age_minutes:31,completed_age_minutes:16});
  assert.throws(()=>evaluateIntegrityPayload(data),/critical mission appears stuck/);
});

test('running critical mission requires a recent completed baseline',()=>{
  const data=payload();
  const row=data[5].results.find(x=>x.engine==='distribution'&&x.mission==='autonomous_cycle');
  Object.assign(row,{status:'running',age_minutes:1,completed_age_minutes:null});
  assert.throws(()=>evaluateIntegrityPayload(data),/critical mission has no completed baseline/);
});

test('completed critical mission still fails outside its cadence',()=>{
  const data=payload();
  const row=data[5].results.find(x=>x.engine==='growth'&&x.mission==='execution_contract');
  Object.assign(row,{status:'completed',age_minutes:46,completed_age_minutes:46});
  assert.throws(()=>evaluateIntegrityPayload(data),/critical mission outside cadence/);
});


test('failed audit is persisted as a P1 Growth Brain incident with evidence',()=>{
  const sql=buildIntegrityIncidentSql(
    {ok:false,code:'critical_mission_appears_stuck',message:'critical mission appears stuck',evidence:{engine:'distribution',mission:'network_cycle'},checked_at:'2026-10-05T19:20:00.000Z'},
    {github_run_id:'123',github_run_url:'https://github.com/pcaiano/toolscout/actions/runs/123',github_sha:'abc'}
  );
  assert.match(sql,/integrity_audit:critical_mission_appears_stuck/);
  assert.match(sql,/'P1','open','integrity_audit','github_actions'/);
  assert.match(sql,/'pending'/);
  assert.match(sql,/network_cycle/);
  assert.match(sql,/actions\/runs\/123/);
});

test('healthy audit resolves prior integrity audit incidents',()=>{
  const sql=buildIntegrityIncidentSql({ok:true,code:'healthy'});
  assert.match(sql,/status='resolved'/);
  assert.match(sql,/incident_key LIKE 'integrity_audit:%'/);
  assert.match(sql,/pending_resolved/);
});

test('workflow persists audit outcome before enforcing failure',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/toolscout-v2-integrity-audit.yml',import.meta.url),'utf8');
  assert.match(workflow,/id: production_audit/);
  assert.match(workflow,/continue-on-error: true/);
  assert.match(workflow,/persist-v2-integrity-report\.mjs/);
  assert.match(workflow,/wrangler d1 execute toolscout --remote --config wrangler\.toml --file integrity-incident\.sql/);
  assert.match(workflow,/if: steps\.production_audit\.outcome != 'success'/);
});
