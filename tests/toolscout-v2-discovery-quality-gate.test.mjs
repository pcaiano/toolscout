import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const discovery=fs.readFileSync(new URL('../distribution-discovery-worker.js',import.meta.url),'utf8');

test('generic AI/app/software product domains are not sufficient discovery evidence',()=>{
  assert.match(discovery,/DISTRIBUTION_SURFACE_RE/);
  assert.match(discovery,/const curated=Boolean\(canonicalSlug\|\|overrides\[bareHost\]\)/);
  assert.match(discovery,/if\(!curated&&!DISTRIBUTION_SURFACE_RE\.test\(text\)\)return null/);
  assert.doesNotMatch(discovery,/\/directory\|tool\|software\|app\/\.test\(text\)\?'directory'/);
});

test('direct submission URLs survive discovery instead of being collapsed to the homepage',()=>{
  assert.match(discovery,/DIRECT_ACTION_PATH_RE/);
  assert.match(discovery,/const directAction=DIRECT_ACTION_PATH_RE\.test/);
  assert.match(discovery,/const actionUrl=directAction\?x\.toString\(\):x\.origin\+'\/'/);
  assert.match(discovery,/url:actionUrl/);
});

test('known curated hosts can still enter discovery even when their brand lacks a generic surface token',()=>{
  assert.match(discovery,/const canonical=guardrails\.canonical_hosts\|\|\{\}/);
  assert.match(discovery,/const curated=Boolean\(canonicalSlug\|\|overrides\[bareHost\]\)/);
});
