import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('promoted competitive-gap tools keep the full catalog profile renderer',()=>{
  const generator=fs.readFileSync('scripts/generate-competitive-gap-profiles.mjs','utf8');
  assert.match(generator,/catalogSlugs/);
  assert.match(generator,/catalogSlugs\.has\(String\(profile\.slug\|\|''\)\)/);
  assert.match(generator,/delegatedToCatalog/);
});
