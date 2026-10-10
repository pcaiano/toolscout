import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Terms, Support and Publisher Kit have one canonical public ToolScout 2.0 shell',()=>{
 for(const [path,canonical] of [
  ['terms.html','https://trytoolscout.org/terms'],
  ['support.html','https://trytoolscout.org/support'],
  ['distribution/publisher-kit.html','https://trytoolscout.org/distribution/publisher-kit']]){
   const html=read(path);
   assert.match(html,/data-toolscout-redesign="2"/,path);
   assert.match(html,/data-toolscout-public-redesign="2"/,path);
   assert.match(html,/class="ts2-brand"/,path);
   assert.equal((html.match(/class="ts2-global-nav"/g)||[]).length,1,path);
   assert.doesNotMatch(html,/class="ts-global-nav"/,path);
   assert.ok(html.includes('rel="canonical" href="'+canonical+'"'),path+' canonical preserved');
   assert.match(html,/href="\/distribution\/publisher-kit"/,path);
   assert.match(html,/href="\/tools"/,path);
   assert.match(html,/href="\/guides"/,path);
   assert.match(html,/href="\/compare"/,path);
   assert.match(html,/href="\/whats-new"/,path);
   assert.match(html,/href="\/software-trends-index"/,path);
 }
});
test('legal and support text must survive presentation unification',()=>{
 assert.match(read('terms.html'),/Informational service/);
 assert.match(read('terms.html'),/Public API and AI integrations/);
 assert.match(read('support.html'),/Software data corrections/);
 assert.match(read('support.html'),/AI plugin and MCP/);
 assert.match(read('support.html'),/pedro@trytoolscout\.org/);
});
test('visual acceptance checks the shorter desktop hero actually in the homepage',()=>{
 const home=read('index.html'),checker=read('scripts/verify-redesign-2-live.mjs');
 assert.match(home,/\.hero\{min-height:410px;/);
 assert.match(home,/content:"Explore ↓"/);
 assert.match(checker,/home_desktop_hero_height_regressed/);
 assert.doesNotMatch(checker,/home_desktop_hero_too_tall/);
 assert.doesNotMatch(checker,/min-height:520px;/);
});
