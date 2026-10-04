import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {executableIntentSearchActions} from '../search-action-policy.js';

const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const contracts=fs.readFileSync(new URL('../growth-execution-contract.js',import.meta.url),'utf8');

test('intent-level organic execution plans remain planning evidence, not worker actions',()=>{
  const result=executableIntentSearchActions({
    lane:'seo-authority-depth',
    executionPlan:['deepen-evidence-and-relevance','improve-query-intent-match','strengthen-internal-links','publish','measure']
  });
  assert.deepEqual(result.actions,['content_amplification','search_measurement']);
  assert.deepEqual(result.planningActions,[
    'deepen-evidence-and-relevance',
    'improve-query-intent-match',
    'strengthen-internal-links',
    'publish',
    'measure'
  ]);
  assert.equal(result.planningScope,'signal_only_not_execution_contract');
  assert.equal(result.contractScope,'intent_level_executable_actions_only');
});

test('observation, indexing recovery and editorial safety do not manufacture content or SEO tasks',()=>{
  for(const lane of ['seo-first-page-observation','seo-striking-distance-observation','seo-indexing-recovery','editorial-safety','measure']){
    const result=executableIntentSearchActions({lane,executionPlan:['preserve-current-url','recheck-automatically']});
    assert.deepEqual(result.actions,['search_measurement']);
    assert.equal(result.editorialExecution,false);
  }
});

test('orchestrator stores planning vocabulary in signal_json and only executable actions in action_json',()=>{
  assert.match(orchestrator,/const intentExecution=executableIntentSearchActions\(op\)/);
  assert.match(orchestrator,/const actions=intentExecution\.actions/);
  assert.match(orchestrator,/execution_plan:intentExecution\.planningActions/);
  assert.match(orchestrator,/execution_plan_scope:intentExecution\.planningScope/);
  assert.doesNotMatch(orchestrator,/\.\.\.execution,'content_amplification','search_measurement'/);
});

test('execution contract no longer routes unknown search verbs to seo_cloudflare',()=>{
  assert.match(contracts,/const searchExecutableSql=Object\.keys\(ACTION_EXECUTOR\)\.map\(q\)\.join\(','\)/);
  assert.match(contracts,/AND \(g\.subject_type<>'search' OR j\.value IN \(\$\{searchExecutableSql\}\)\)/);
  assert.doesNotMatch(contracts,/CASE WHEN g\.subject_type='search' THEN 'seo_cloudflare'/);
});

test('legacy unsupported search tasks become cancellable once they are no longer executable source actions',()=>{
  const matches=contracts.match(/g\.subject_type<>'search' OR j\.value IN \(\$\{searchExecutableSql\}\)/g)||[];
  assert.ok(matches.length>=2,'expected executable-action filter in both materialization and cancellation checks');
});
