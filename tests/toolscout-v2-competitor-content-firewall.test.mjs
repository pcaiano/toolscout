import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0112_phase254_competitor_content_firewall.sql',import.meta.url),'utf8');

test('competitive surfaces cannot receive content relevance amplification',()=>{
  assert.match(orchestrator,/competitiveOutreachExclusion/);
  assert.match(orchestrator,/const competitiveSurface=competitiveOutreachExclusion/);
  assert.match(orchestrator,/acquisitionOpen&&!competitiveSurface&&Number\(row\.route_content\|\|0\)>0/);
  assert.match(orchestrator,/competitive_surface:competitiveSurface/);
});

test('existing competitor content tasks are cancelled by migration',()=>{
  assert.match(migration,/executor='content_issue'/);
  assert.match(migration,/action='content_relevance_amplification'/);
  assert.match(migration,/crozdesk-com/);
  assert.match(migration,/status='cancelled'/);
  assert.match(migration,/phase254_competitor_content_amplification_suppressed/);
});
