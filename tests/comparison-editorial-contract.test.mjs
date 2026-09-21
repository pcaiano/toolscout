import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');

test('dynamic comparator always renders a ToolScout editorial analysis',()=>{
  const html=read('compare.html');
  assert.match(html,/id="analysis"/);
  assert.match(html,/ToolScout analysis/);
  assert.match(html,/function editorialConclusion\(a,b\)/);
  assert.match(html,/comparisonDimensions=/);
  assert.match(html,/editorialConclusion\(x,y\)/);
  assert.match(html,/data-default-a="" data-default-b=""/);
  assert.doesNotMatch(html,/[\u2013\u2014]/);
});

test('registered static comparisons use the dynamic comparator surface',()=>{
  const pairs=JSON.parse(read('data/comparisons.json'));
  const dynamic=read('compare.html');
  const dynamicStyle=dynamic.match(/<style>[\s\S]*?<\/style>/)?.[0];
  assert.ok(dynamicStyle);
  assert.ok(pairs.length>0);
  for(const [a,b] of pairs){
    const file=`${a}-vs-${b}.html`;
    const html=read(file);
    assert.equal(html.match(/<style>[\s\S]*?<\/style>/)?.[0],dynamicStyle,`${file} must share the dynamic comparator styling`);
    assert.match(html,new RegExp(`data-default-a="${a}" data-default-b="${b}"`));
    assert.match(html,/class="table"/);
    assert.match(html,/ToolScout analysis/);
    assert.match(html,/What this comparison means in practice/);
    assert.doesNotMatch(html,/Frequently asked questions|Related buying guides|How this comparison works|class="decision"/);
    assert.doesNotMatch(html,/[\u2013\u2014]/);
  }
});

test('comparison generator derives static pages from compare.html',()=>{
  const generator=read('scripts/generate-comparisons.mjs');
  assert.match(generator,/compareTemplate=fs\.readFileSync\(path\.join\(ROOT,'compare\.html'\)/);
  assert.match(generator,/function editorialConclusion\(a,b\)/);
  assert.match(generator,/data-default-a=/);
  assert.match(generator,/initialTable\(a,b\)/);
  assert.doesNotMatch(generator,/Related buying guides|Frequently asked questions|How this comparison works/);
});

test('dynamic comparator stays within a mobile viewport',()=>{
  const html=read('compare.html');
  assert.match(html,/@media\(max-width:650px\)/);
  assert.match(html,/\.row\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);min-width:0\}/);
  assert.match(html,/\.table\{overflow:hidden\}/);
  assert.match(html,/overflow-wrap:anywhere/);
  assert.match(html,/\.actions\{display:grid;grid-template-columns:1fr/);
});
