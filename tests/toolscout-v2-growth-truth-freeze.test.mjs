import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('growth truth production repair is frozen to manual fallback after successful deploy',()=>{
  const workflow=read('.github/workflows/growth-truth-production-repair.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\n\s*push:/);
  assert.doesNotMatch(workflow,/github\.event\.head_commit/);
});

test('integrity audit prints identities for missing execution contracts before failing closed',()=>{
  const workflow=read('.github/workflows/toolscout-v2-integrity-audit.yml');
  assert.match(workflow,/Missing execution contract detail/);
  assert.match(workflow,/WHERE c\.task_id IS NULL/);
  assert.match(workflow,/a\.opportunity_key,a\.subject_type,a\.subject_key,a\.action,a\.updated_at/);
  assert.match(workflow,/evaluate-v2-integrity-audit\.mjs integrity\.json/);
});
