import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agents=fs.readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
const memory=fs.readFileSync(new URL('../docs/OPERATING-MEMORY.md',import.meta.url),'utf8');
const external=fs.readFileSync(new URL('../docs/external-distribution.md',import.meta.url),'utf8');

test('ToolScout external forms are browser first when a live browser is available',()=>{
  assert.match(agents,/prefer live browser automation over giving the owner field-by-field manual instructions/i);
  assert.match(agents,/CAPTCHA, MFA, password entry/i);
  assert.match(agents,/browser-completed form is not a verified placement/i);
  assert.match(external,/default interactive path is browser automation/i);
  assert.match(external,/Pause only for CAPTCHA, MFA/i);
});

test('Browser automation stays bounded and does not become bulk spam capacity',()=>{
  assert.match(agents,/Do not turn browser automation into an unbounded crawler or bulk-spam executor/i);
  assert.match(memory,/bounded sidecar rather than general autonomous bulk executor capacity/i);
});

test('Owner manual work is reserved for genuine browser boundaries',()=>{
  assert.match(memory,/Exact external forms should become browser-ready work before they become owner-manual work/i);
  assert.match(memory,/legal attestations/i);
  assert.match(external,/Do not collapse back to generic instructions/i);
});
