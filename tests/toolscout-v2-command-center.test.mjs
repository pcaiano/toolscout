import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('business truth exposes the ToolScout 2.0 editorial portfolio',()=>{
  const truth=read('operational-truth-reconciliation-worker.js');
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
