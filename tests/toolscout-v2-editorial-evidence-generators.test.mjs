import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('tool profiles keep vendor evidence internal and commercial CTA routed through ToolScout',()=>{
  const src=read('scripts/generate-tool-pages.mjs');
  assert.match(src,/href="\/go\/${encodeURIComponent\(tool\.slug\)\}"/);
  assert.doesNotMatch(src,/Official product source/);
  assert.doesNotMatch(src,/href="${esc\(tool\.sourceUrl\)\}"/);
  assert.match(src,/Information last checked/);
});

test('commercial guides do not publish direct vendor source links',()=>{
  const src=read('scripts/generate-seo-pages.mjs');
  assert.match(src,/Checked/);
  assert.doesNotMatch(src,/Official source/);
  assert.doesNotMatch(src,/href="${esc\(tool\.sourceUrl\)\}"/);
  assert.match(src,/href="\/go\/${encodeURIComponent\(tool\.slug\)\}"/);
});

test('comparisons keep vendor source URLs internal while preserving monetized CTAs',()=>{
  const src=read('scripts/generate-comparisons.mjs');
  assert.doesNotMatch(src,/official source/i);
  assert.doesNotMatch(src,/href="${esc\((?:a|b)\.sourceUrl\)\}"/);
  assert.match(src,/Catalog evidence last checked/);
  assert.match(src,/href="\/go\/${encodeURIComponent\(t\.slug\)\}/);
});
