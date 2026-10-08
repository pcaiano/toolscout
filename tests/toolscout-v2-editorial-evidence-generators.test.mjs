import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('tool profiles keep vendor evidence internal and commercial CTA routed through ToolScout',()=>{
  const src=read('scripts/generate-tool-pages.mjs');
  assert.match(src,/href="\/go\/\${encodeURIComponent\(tool\.slug\)\}"/);
  assert.doesNotMatch(src,/Official product source/);
  assert.doesNotMatch(src,/href="\${esc\(tool\.sourceUrl\)\}"/);
  assert.match(src,/Source data last checked/);
});

test('commercial guides do not publish direct vendor source links',()=>{
  const src=read('scripts/generate-seo-pages.mjs');
  assert.match(src,/Checked/);
  assert.doesNotMatch(src,/Official source/);
  assert.doesNotMatch(src,/href="\${esc\(tool\.sourceUrl\)\}"/);
  assert.match(src,/href="\/go\/\${encodeURIComponent\(tool\.slug\)\}"/);
});

test('comparisons keep vendor source URLs internal while preserving monetized CTAs',()=>{
  const src=read('scripts/generate-comparisons.mjs');
  assert.doesNotMatch(src,/official source/i);
  assert.doesNotMatch(src,/href="\${esc\((?:a|b)\.sourceUrl\)\}"/);
  assert.match(src,/Catalog evidence last checked/);
  assert.match(src,/href="\/go\/\${encodeURIComponent\(t\.slug\)\}/);
});

test('decision editorial cohort gives ten distinct profile analyses and source-anchored buyer checks',()=>{
  const cfg=JSON.parse(read('data/organic-growth-engine.json')).editorialQuality;
  const catalog=JSON.parse(read('data/tools.json'));
  const ids=Object.keys(cfg.profileDecisionEvidence||{});
  assert.equal(ids.length,10);
  const opens=new Set();
  for(const slug of ids){
    const evidence=cfg.profileDecisionEvidence[slug];
    const review=cfg.profileOverrides[slug];
    const html=read('tools/'+slug+'.html');
    assert.ok(catalog.some(x=>x.slug===slug),'Missing catalog product '+slug);
    assert.ok(review&&review.length>=350,'Weak profile analysis '+slug);
    assert.ok(evidence.angle&&evidence.buyerCheck&&evidence.checkedOn==='2026-10-08','Missing buyer evidence '+slug);
    assert.match(evidence.sourceUrl,/^https:\/\//);
    assert.equal(evidence.handsOnTested,false,'No unperformed hands-on tests may be asserted');
    assert.ok(html.includes('editorialBuyerCheck'),'Missing displayed buyer checklist on '+slug);
    assert.ok(html.includes(evidence.buyerCheck.replaceAll('&','&amp;').replaceAll("'","&#39;")),'Mismatch buyer checklist '+slug);
    assert.ok(html.includes(review.slice(0,36).replaceAll("'","&#39;")),'Prebuilt profile has stale editorial analysis '+slug);
    assert.ok(html.includes('rel="canonical"'),'Lost canonical on '+slug);
    assert.ok(html.includes('href="/go/'+slug+'"'),'Lost affiliate-routing CTA on '+slug);
    opens.add(review.split(/\s+/).slice(0,6).join(' ').toLowerCase());
  }
  assert.equal(opens.size,10,'Repeated lead architecture detected in decision-grade profiles');
});

test('six prebuilt comparisons and two guides share editorial conclusions with their source config',()=>{
  const ed=JSON.parse(read('data/organic-growth-engine.json')).editorialQuality;
  const pairs=[['make','zapier'],['hubspot','pipedrive'],['semrush','ahrefs'],['notion','clickup'],['airtable','notion'],['n8n','make']];
  const esc=s=>s.replaceAll('&','&amp;').replaceAll("'","&#39;");
  for(const [a,b] of pairs){
    const key=[a,b].sort().join('|'),review=ed.comparisonOverrides[key];
    assert.ok(review?.analysis?.length>=380&&review?.decision?.length>=100,'Weak comparison '+key);
    const html=read(a+'-vs-'+b+'.html');
    assert.ok(html.includes(esc(review.analysis).slice(0,90)),'Stale static comparison '+key);
    assert.ok(html.includes(esc(review.decision).slice(0,90)),'Stale static decision '+key);
    assert.ok(html.includes('<link rel="canonical" href="https://trytoolscout.org/'+a+'-vs-'+b+'">'),'Canonical drift '+key);
  }
  for(const slug of ['best-seo-tools-for-agencies','best-workflow-automation-tools']){
    const text=ed.guideOverrides[slug],html=read(slug+'.html');
    assert.ok(text?.length>=400,'Weak guide conclusion '+slug);
    assert.ok(html.includes(esc(text).slice(0,110)),'Stale static guide '+slug);
    assert.ok(html.includes('<link rel="canonical"'),'Guide canonical lost '+slug);
  }
});

test('verified free plans have dated vendor evidence and unknown status is not inferred',()=>{
  const catalog=JSON.parse(read('data/tools.json'));
  const verified=['hubspot','ahrefs','notion','make','airtable'];
  for(const slug of verified){
    const tool=catalog.find(x=>x.slug===slug);
    assert.equal(tool.freePlanKnown,true,slug);
    assert.equal(tool.freePlan,true,slug);
    assert.equal(tool.pricingDetails?.freePlanStatus,'verified_available',slug);
    assert.equal(tool.pricingDetails?.verifiedAt,'2026-10-08',slug);
    assert.match(tool.pricingDetails?.sourceUrl,/^https:\/\//);
    assert.match(read('tools/'+slug+'.html'),/Free plan recorded:<\/strong> Yes/);
  }
  assert.match(read('scripts/generate-tool-pages.mjs'),/tool\.freePlanKnown!==true/);
  assert.match(read('scripts/generate-comparisons.mjs'),/t\.freePlanKnown!==true/);
  assert.match(read('compare.html'),/t\.freePlanKnown!==true/);
});
