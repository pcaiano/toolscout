import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(ROOT,'scripts','validate-aeo-geo-readiness.mjs');
const requiredLinks=['guides.html','tools.html','compare.html','sitemap.xml'];
const fixture=(identity,operation='decide_software')=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'toolscout-decision-readiness-'));
  fs.writeFileSync(path.join(cwd,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://trytoolscout.org/sitemap.xml\n');
  fs.writeFileSync(path.join(cwd,'sitemap.xml'),'<urlset></urlset>\n');
  fs.writeFileSync(path.join(cwd,'llms.txt'),`${identity}\n${operation}\n${requiredLinks.join('\n')}\n`);
  return cwd;
};
const validate=cwd=>{
  try{
    const run=spawnSync(process.execPath,[script],{cwd,encoding:'utf8'});
    return {status:run.status,output:run.stdout,stderr:run.stderr};
  }finally{fs.rmSync(cwd,{recursive:true,force:true});}
};

test('decision-engine identity with an actual decision operation satisfies machine-readiness gate',()=>{
  const run=validate(fixture('ToolScout is an independent software decision engine'));
  assert.equal(run.status,0,run.output+'\n'+run.stderr);
});

test('legacy recommendation-engine identity remains backward compatible',()=>{
  const run=validate(fixture('ToolScout is a recommendation engine'));
  assert.equal(run.status,0,run.output+'\n'+run.stderr);
});

test('missing decision identity or missing operation fails explicitly',()=>{
  for(const [identity,operation] of [
    ['ToolScout is a software catalogue','decide_software'],
    ['ToolScout is a decision engine','search_tools']
  ]){
    const run=validate(fixture(identity,operation));
    assert.notEqual(run.status,0,'an undocumented decision contract cannot pass');
  }
});

test('concurrent main writers are retried without force pushing or dropping remote updates',()=>{
  for(const workflow of ['gsc-search-reality.yml','seo-engine-v2.yml']){
    const source=fs.readFileSync(path.join(ROOT,'.github','workflows',workflow),'utf8');
    assert.match(source,/for attempt in 1 2 3 4 5 6 7 8; do/);
    assert.match(source,/git pull --rebase origin main/);
    assert.match(source,/if git push origin HEAD:main; then/);
    assert.doesNotMatch(source,/git push --force/);
  }
});
