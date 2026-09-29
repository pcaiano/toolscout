import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('tool profiles expose primary editorial evidence separately from affiliate CTA',()=>{
  const src=read('scripts/generate-tool-pages.mjs');
  assert.match(src,/Official product source/);
  assert.match(src,/Editorial evidence:/);
  assert.match(src,/href="\/go\/\$\{encodeURIComponent\(tool\.slug\)\}"/);
  assert.match(src,/href="\$\{esc\(tool\.sourceUrl\)\}"/);
});

test('commercial guides expose source date and official source',()=>{
  const src=read('scripts/generate-seo-pages.mjs');
  assert.match(src,/Source checked/);
  assert.match(src,/Official source/);
  assert.match(src,/target="_blank" rel="noopener"/);
});

test('comparisons expose both primary sources without changing affiliate CTAs',()=>{
  const src=read('scripts/generate-comparisons.mjs');
  assert.match(src,/Primary sources:/);
  assert.match(src,/official source/);
  assert.match(src,/Catalog evidence last checked/);
  assert.match(src,/href="\/go\/\$\{encodeURIComponent\(t\.slug\)\}/);
});
