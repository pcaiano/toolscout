import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreEditorialPage,
  authorityGapPriority,
  pageTypeForPath
} from '../scripts/editorial-authority-model.mjs';

test('commercial editorial authority does not depend on direct vendor outbounds',()=>{
  const thin='<html><head><link rel="canonical" href="https://trytoolscout.org/x"></head><body><h1>Best tools</h1><p>Choose the right software.</p></body></html>';
  const rich='<html><head><link rel="canonical" href="https://trytoolscout.org/x"><script type="application/ld+json">{}</script></head><body><h1>Decision guide</h1><p>ToolScout analysis: what this means in practice for buyers before choosing. Trade-off and limitation analysis.</p><p>Information last checked 2026-09-29.</p><p>ToolScout may earn affiliate compensation.</p>'+('<p>Evidence and workflow detail.</p>'.repeat(120))+'</body></html>';
  const a=scoreEditorialPage(thin,{pageType:'guide'});
  const b=scoreEditorialPage(rich,{pageType:'guide',hasFreshUpdate:true});
  assert.ok(b.score>a.score);
  assert.equal(b.sourceLinks,0);
  assert.equal(b.hasVerification,true);
  assert.equal(b.hasAnalysis,true);
  assert.equal(b.hasTradeoffs,true);
});

test('observed demand plus authority gap produces intervention priority',()=>{
  const low=authorityGapPriority({impressions:300,position:25,authorityScore:30,weight:0.15});
  const high=authorityGapPriority({impressions:300,position:25,authorityScore:85,weight:0.15});
  assert.ok(low>high);
});

test('page types distinguish the authority wedge from money pages',()=>{
  assert.equal(pageTypeForPath('/news/zapier-next-gen-zaps-mcp'),'news');
  assert.equal(pageTypeForPath('/make-vs-zapier'),'comparison');
  assert.equal(pageTypeForPath('/best-project-management-tools'),'guide');
  assert.equal(pageTypeForPath('/software-trends-index'),'proprietary_dataset');
});


test('current ToolScout editorial view with recent verification can meet the 95 quality target',()=>{
  const html='<html><head><link rel="canonical" href="https://trytoolscout.org/tools/example"><script type="application/ld+json">{}</script></head><body>'+
    '<a href="https://vendor.example/docs">Official source</a>'+
    '<section><h2>ToolScout view</h2><p>In practice this tool is best for teams that value workflow fit. The main trade-off is limited flexibility for edge cases, so compare alternatives before choosing.</p></section>'+
    '<p>Information last checked 2026-10-01. ToolScout may earn affiliate compensation.</p>'+
    ('<p>Verified capability and buyer decision context.</p>'.repeat(55))+
    '</body></html>';
  const out=scoreEditorialPage(html,{pageType:'tool_profile'});
  assert.equal(out.hasAnalysis,true);
  assert.equal(out.hasRecentVerification,true);
  assert.ok(out.score>=95);
});

test('authority gap closes at the 95 target instead of rewarding endless on-page expansion',()=>{
  const healthy=authorityGapPriority({impressions:300,position:55,authorityScore:95,targetScore:95,hardFloorScore:90,weight:0.2});
  const weak=authorityGapPriority({impressions:300,position:55,authorityScore:80,targetScore:95,hardFloorScore:90,weight:0.2});
  assert.ok(weak>healthy);
});
