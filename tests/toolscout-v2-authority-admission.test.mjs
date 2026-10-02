import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {genericBatchAdmissionWhere,executorTaskOrderSql} from '../growth-execution-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution network admits only currently actionable external authority surfaces',()=>{
  const where=genericBatchAdmissionWhere('distribution_network');
  assert.match(where,/source_kind='supervisor'/);
  assert.match(where,/source_kind='opportunity'/);
  assert.match(where,/publisher_contact_discovery/);
  assert.match(where,/execute_alternate_routes/);
  assert.match(where,/scale_proven_surface/);
  assert.match(where,/authority_surface\.status IN \('discovered','candidate','research_required','stale'\)/);
  assert.doesNotMatch(where,/research_required','deferred','stale/);
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
  assert.match(where,/authority_surface\.status IN \('discovered','candidate','research_required','stale'\)/);
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


test('orchestrator lane selection uses the same claimability predicates as admission and claim',()=>{
  const src=read('distribution-orchestrator-worker.js');
  assert.match(src,/genericBatchAdmissionWhere\('distribution_network'\)/);
  assert.match(src,/genericBatchAdmissionWhere\('distribution_autonomous'\)/);
  assert.match(src,/genericBatchAdmissionWhere\('affiliate_cycle'\)/);
  assert.match(src,/executor='distribution_network'\$\{networkAdmission\}/);
  assert.match(src,/executor='distribution_autonomous'\$\{autonomousAdmission\}/);
  assert.match(src,/executor='affiliate_cycle'\$\{affiliateAdmission\}/);
});


test('rebalance demotes generic pending tasks that are no longer currently actionable',()=>{
  const src=read('growth-execution-contract.js');
  assert.match(src,/deferred_not_currently_actionable/);
  assert.match(src,/const allPending=await env\.DB\.prepare/);
  assert.match(src,/const eligible=new Set\(pendingIds\)/);
  assert.match(src,/ineligibleDemoted/);
});


test('no-proof authority work cools down before re-admission',()=>{
  const src=read('growth-execution-contract.js');
  assert.match(src,/authorityNoProofCooldown/);
  assert.match(src,/cycle_completed_without_task_specific_proof_v3/);
  assert.match(src,/updated_at<=datetime\('now','-90 minutes'\)/);
});


test('growth execution lane prioritizes authority proof over no-proof scaling',()=>{
  const src=read('distribution-orchestrator-worker.js');
  const start=src.indexOf("SELECT executor FROM growth_execution_contract");
  const end=src.indexOf("LIMIT 1`).first()",start);
  assert.ok(start>=0&&end>start);
  const selector=src.slice(start,end);
  assert.ok(selector.indexOf("verify_backlink_acquisition")<selector.indexOf("scale_proven_surface"));
  assert.match(selector,/priority_score DESC/);
});


test('distribution task-specific proof closes the execution contract',()=>{
  const src=read('distribution-orchestrator-worker.js');
  assert.match(src,/executor==='distribution_network'\|\|executor==='distribution_autonomous'/);
  assert.match(src,/out\?\.taskProof\?\.verified===true/);
  assert.match(src,/recordExecutionProof\(env,/);
  assert.match(src,/proof\.publicUrl\|\|proof\.routeUrl\|\|proof\.liveUrl/);
});


test('authority executor queues prioritize acquisition work before verification-only work',()=>{
  const network=executorTaskOrderSql('distribution_network');
  const autonomous=executorTaskOrderSql('distribution_autonomous');
  assert.ok(network.indexOf("execute_alternate_routes")<network.indexOf("publisher_contact_discovery"));
  assert.ok(network.indexOf("publisher_contact_discovery")<network.indexOf("scale_proven_surface"));
  assert.ok(autonomous.indexOf("autonomous_route_qualification")<autonomous.indexOf("verify_backlink_acquisition"));
});

test('growth lane selector is acquisition-first while the authority backlog is active',()=>{
  const src=read('distribution-orchestrator-worker.js');
  const start=src.indexOf("SELECT executor FROM growth_execution_contract");
  const end=src.indexOf("created_at ASC LIMIT 1",start);
  assert.ok(start>=0&&end>start);
  const selector=src.slice(start,end);
  assert.ok(selector.indexOf("execute_alternate_routes")<selector.indexOf("verify_backlink_acquisition"));
  assert.ok(selector.indexOf("autonomous_route_qualification")<selector.indexOf("verify_backlink_acquisition"));
  assert.ok(selector.indexOf("verify_backlink_acquisition")<selector.indexOf("scale_proven_surface"));
});

test('rebalance promotion and executor claims share acquisition-first ordering',()=>{
  const src=read('growth-execution-contract.js');
  assert.match(src,/const taskOrder=executorTaskOrderSql\(executor\)/);
  assert.match(src,/status='deferred'.*ORDER BY \$\{taskOrder\},priority_score DESC/s);
  assert.match(src,/status IN \('pending','stalled'\).*ORDER BY CASE WHEN status='stalled' THEN 0 ELSE 1 END,\$\{taskOrder\},priority_score DESC/s);
});


test('non-authority executor ordering is a SQLite expression, never positional ORDER BY 0',()=>{
  const order=executorTaskOrderSql('content_issue');
  assert.notEqual(order,'0');
  assert.match(order,/^CASE /);
});
