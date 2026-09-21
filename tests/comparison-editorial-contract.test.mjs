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
  assert.doesNotMatch(html,/[\u2013\u2014]/);
});

test('registered static comparisons preserve the ToolScout conclusion',()=>{
  const pairs=JSON.parse(read('data/comparisons.json'));
  assert.ok(pairs.length>0);
  for(const [a,b] of pairs){
    const file=`${a}-vs-${b}.html`;
    const html=read(file);
    assert.match(html,/editorial-conclusion/,`${file} is missing the editorial conclusion section`);
    assert.match(html,/ToolScout conclusion/,`${file} is missing the ToolScout conclusion label`);
  }
});

test('comparison generator preserves editorial conclusions on regeneration',()=>{
  const generator=read('scripts/generate-comparisons.mjs');
  assert.match(generator,/function editorialConclusion\(a,b,aWins,bWins,overlap\)/);
  assert.match(generator,/class="section editorial-conclusion"/);
  assert.match(generator,/ToolScout conclusion/);
});
