import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('editorial trust recognizes canonical extensionless ToolScout profile links',()=>{
  const validator=fs.readFileSync('scripts/validate-editorial-trust.mjs','utf8');
  assert.match(validator,/\/tools\\\/\(\[a-z0-9-\]\+\)\(\?:\\\.html\)\?/);
});

test('software trends scope gate accepts the current first-party editorial dataset wording',()=>{
  const validator=fs.readFileSync('scripts/validate-editorial-trust.mjs','utf8');
  const generator=fs.readFileSync('scripts/generate-software-trends-index.mjs','utf8');
  assert.match(validator,/first-party \(\?:observations\|editorial dataset\)/);
  assert.match(generator,/ToolScout first-party editorial dataset/i);
  assert.match(generator,/not a measure of global market share/i);
});
