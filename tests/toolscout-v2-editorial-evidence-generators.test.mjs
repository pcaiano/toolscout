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
  assert.match(src,/Catalog checked|catalog-based editorial assessment/);
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

test('decision editorial catalog has 127 individual assessments with transparent provenance',()=>{
  const cfg=JSON.parse(read('data/organic-growth-engine.json')).editorialQuality;
  const catalog=JSON.parse(read('data/tools.json'));
  const ids=Object.keys(cfg.profileDecisionEvidence||{});
  assert.equal(ids.length,127);
  const opens=new Set();
  for(const slug of ids){
    const evidence=cfg.profileDecisionEvidence[slug];
    const review=cfg.profileOverrides[slug];
    const html=read('tools/'+slug+'.html');
    assert.ok(catalog.some(x=>x.slug===slug),'Missing catalog product '+slug);
    assert.ok(review&&review.length>=190,'Weak profile analysis '+slug);
    assert.ok(evidence.angle&&evidence.buyerCheck&&evidence.checkedOn==='2026-10-08','Missing buyer evidence '+slug);
    if(evidence.evidenceType==='catalog_assessment_unverified')assert.equal(evidence.sourceUrl,null,'Catalog-only is not verified vendor evidence '+slug);
    else assert.match(evidence.sourceUrl,/^https:\/\//);
    assert.equal(evidence.handsOnTested,false,'No unperformed hands-on tests may be asserted');
    assert.ok(html.includes('editorialBuyerCheck'),'Missing displayed buyer checklist on '+slug);
    assert.ok(html.includes(evidence.buyerCheck.replaceAll('&','&amp;').replaceAll("'","&#39;")),'Mismatch buyer checklist '+slug);
    assert.ok(html.includes(review.slice(0,36).replaceAll("'","&#39;")),'Prebuilt profile has stale editorial analysis '+slug);
    assert.ok(html.includes('rel="canonical"'),'Lost canonical on '+slug);
    assert.ok(html.includes('href="/go/'+slug+'"'),'Lost affiliate-routing CTA on '+slug);
    opens.add(review.split(/\s+/).slice(0,6).join(' ').toLowerCase());
  }
  assert.equal(opens.size,ids.length,'Repeated lead architecture detected in decision-grade profiles');
  const provisional=catalog.filter(x=>x.editorialReview?.verificationStatus==='catalog_only');
  const sourced=catalog.filter(x=>x.editorialReview&&!provisional.includes(x));
  assert.equal(provisional.length,10);
  assert.equal(sourced.length,117);
  for(const tool of provisional){
    const html=read('tools/'+tool.slug+'.html');
    assert.match(html,/Catalog-based; vendor claims and plan limits not independently verified/i);
    assert.match(html,/catalog-based editorial assessment only/i);
    assert.equal(tool.editorialReview.sourceUrl,null);
    assert.equal(tool.editorialReview.handsOnTested,false);
    assert.ok(!tool.evidence?.length,'Unverified assertions cannot masquerade as evidence '+tool.slug);
  }
  const disputed=catalog.filter(x=>x.categoryReviewRequired);
  assert.equal(disputed.length,10);
  for(const tool of disputed){
    assert.match(read('tools/'+tool.slug+'.html'),/Category under review|category review pending/i);
    assert.ok(['developer','forms','ai-assistant'].includes(tool.category));
  }
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

test('second decision editorial cohort matches catalog, static pages, independent guides and comparisons',()=>{
  const catalog=JSON.parse(read('data/tools.json')),ed=JSON.parse(read('data/organic-growth-engine.json')).editorialQuality;
  const reviewed=['mailchimp','brevo','trello','linear','tally','figma'];
  const esc=s=>s.replaceAll('&','&amp;').replaceAll("'","&#39;");
  for(const slug of reviewed){
    const t=catalog.find(x=>x.slug===slug),html=read('tools/'+slug+'.html');
    assert.ok(t&&t.editorialReview,'Missing decision record '+slug);
    assert.ok(html.includes(esc(t.editorialReview.summary).slice(0,75)),'Stale review '+slug);
    assert.ok(html.includes(esc(t.editorialReview.buyerCheck).slice(0,65)),'Stale checklist '+slug);
    assert.ok(html.includes(esc(t.pricingDetails.freePlanSummary).slice(0,35)),'Stale pricing summary '+slug);
    assert.ok(html.includes('href="/go/'+slug+'"'),'Missing monetized route '+slug);
    assert.ok(html.includes('rel="canonical"'),'Missing canonical '+slug);
    assert.equal(t.editorialReview.handsOnTested,false);
    assert.match(t.pricingDetails.sourceUrl,/^https:\/\//);
    assert.equal(t.freePlanKnown,true);
  }
  for(const [a,b] of [['brevo','mailchimp'],['tally','typeform']]){
    const id=a+'-vs-'+b, key=[a,b].sort().join('|'),html=read(id+'.html'),r=ed.comparisonOverrides[key];
    assert.ok(r?.analysis?.length>400&&r?.decision?.length>100);
    assert.ok(html.includes(esc(r.analysis).slice(0,80)));
    assert.ok(html.includes(esc(r.decision).slice(0,80)));
    assert.ok(html.includes('<link rel="canonical" href="https://trytoolscout.org/'+id+'">'));
  }
  for(const slug of ['best-email-marketing-tools','best-forms-for-small-business']){
    assert.ok(read(slug+'.html').includes(esc(ed.guideOverrides[slug]).slice(0,90)));
  }
  const zap=catalog.find(x=>x.slug==='zapier');
  assert.equal(zap.freePlanKnown,true);
  assert.equal(zap.pricingDetails.verifiedAt,'2026-10-08');
  assert.ok(read('tools/zapier.html').includes('Free plan recorded:</strong> Yes'));
  assert.ok(read('tools/zapier.html').includes('100 monthly tasks'));
});

test('third decision editorial cohort distinguishes verified trials from permanent free plans',()=>{
  const catalog=JSON.parse(read('data/tools.json')),ed=JSON.parse(read('data/organic-growth-engine.json')).editorialQuality;
  const esc=s=>s.replaceAll('&','&amp;').replaceAll("'","&#39;");
  for(const slug of ['activecampaign','asana','clickup','typeform']){
    const t=catalog.find(x=>x.slug===slug);
    assert.ok(t?.editorialReview?.summary?.length>380,'Missing reviewed conclusion '+slug);
    assert.ok(t.strengths.length>0&&t.limitations.length>0&&t.tradeoffs.length>0);
    assert.ok(t.editorialReview.sourceUrl.startsWith('https://'));
    assert.equal(t.editorialReview.handsOnTested,false);
    const html=read('tools/'+slug+'.html');
    assert.ok(html.includes(esc(t.editorialReview.summary).slice(0,65)),'Stale static review '+slug);
    assert.ok(html.includes(esc(t.editorialReview.buyerCheck).slice(0,60)),'Missing buying checklist '+slug);
    assert.ok(html.includes('href="/go/'+slug+'"'));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes('Free plan recorded:</strong> '+(t.freePlanKnown===true?'Yes':'Unknown')));
  }
  const active=catalog.find(x=>x.slug==='activecampaign');
  assert.equal(active.freePlanKnown,false,'Unverified ongoing free plans must not become verified by the existence of a trial');
  assert.equal(active.pricingDetails.trialStatus,'verified_available');
  assert.ok(active.pricingDetails.trialSummary.includes('14-day'));
  assert.ok(read('tools/activecampaign.html').includes('14-day trial'));
  for(const slug of ['asana','clickup','typeform']){
    const t=catalog.find(x=>x.slug===slug);
    assert.equal(t.freePlanKnown,true);
    assert.equal(t.pricingDetails.freePlanStatus,'verified_available');
  }
  for(const [a,b] of [['asana','clickup'],['activecampaign','mailchimp'],['jotform','typeform']]){
    const key=[a,b].sort().join('|'),id=a+'-vs-'+b,r=ed.comparisonOverrides[key],html=read(id+'.html');
    assert.ok(r.analysis.length>300&&r.decision.length>120);
    assert.ok(html.includes(esc(r.analysis).slice(0,75)));
    assert.ok(html.includes(esc(r.decision).slice(0,65)));
    assert.ok(html.includes('<link rel="canonical" href="https://trytoolscout.org/'+id+'">'));
  }
  for(const slug of ['best-project-management-tools','best-lead-capture-forms'])
    assert.ok(read(slug+'.html').includes(esc(ed.guideOverrides[slug]).slice(0,100)));
});

test('all 38 guides and 15 comparisons publish their unique decision conclusions with canonicals intact',()=>{
  const ed=JSON.parse(read('data/organic-growth-engine.json')).editorialQuality;
  const intents=JSON.parse(read('data/intents.json'));
  const pairs=JSON.parse(read('data/comparisons.json'));
  const esc=v=>String(v||'').replace(/[\u2014\u2013]/g,'-').replace(/\s+/g,' ').trim().replaceAll('&','&amp;').replaceAll("'","&#39;").replaceAll('"','&quot;');
  assert.equal(intents.length,38);
  assert.equal(pairs.length,15);
  assert.equal(Object.keys(ed.guideOverrides).length,38);
  assert.equal(Object.keys(ed.comparisonOverrides).length,15);
  const uniqueGuides=new Set(),uniqueComparisons=new Set();
  const holds=JSON.parse(read('reports/seo-publication-holds.json')).items||[];
  const heldSlugs=new Set(holds.map(x=>x.intent));
  let liveGuides=0;
  for(const item of intents){
    const path=item.slug+'.html',copy=ed.guideOverrides[item.slug];
    assert.ok(copy?.length>=220,'Missing substantial guide analysis: '+item.slug);
    uniqueGuides.add(copy.slice(0,80).toLowerCase());
    if(heldSlugs.has(item.slug)){
      assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),false,'Held SEO guide must remain unpublished: '+item.slug);
      continue;
    }
    const html=read(path);
    liveGuides++;
    assert.ok(html.includes(esc(copy).slice(0,85)),'Stale guide analysis: '+item.slug);
    assert.ok(html.includes('<link rel="canonical" href="https://trytoolscout.org/'+item.slug+'">'),'Canonical drift '+item.slug);
    assert.ok(!html.includes('This is a genuine trade-off rather than a cosmetic tie.'),'Generic filler '+item.slug);
  }
  assert.equal(liveGuides,36,'SEO publication holds must not be bypassed');
  for(const [a,b] of pairs){
    const id=a+'-vs-'+b,key=[a,b].sort().join('|'),copy=ed.comparisonOverrides[key],html=read(id+'.html');
    assert.ok(copy?.analysis?.length>=250,'Missing comparison analysis '+key);
    assert.ok(copy?.decision?.length>=100,'Missing comparison decision '+key);
    assert.ok(html.includes(esc(copy.analysis).slice(0,85)),'Stale comparison analysis: '+key);
    assert.ok(html.includes(esc(copy.decision).slice(0,65)),'Stale comparison verdict: '+key);
    assert.ok(html.includes('<link rel="canonical" href="https://trytoolscout.org/'+id+'">'),'Canonical drift '+key);
    uniqueComparisons.add(copy.analysis.slice(0,80).toLowerCase());
  }
  assert.equal(uniqueGuides.size,38,'Guide editorial must not be copy-pasted');
  assert.equal(uniqueComparisons.size,15,'Comparison editorial must not be copy-pasted');
});

test('general AI assistant guide cannot rank niche personas or unresolved support agents as work assistants',()=>{
  const html=read('best-ai-assistants.html');
  for(const slug of ['chatgpt','gemini','claude'])
    assert.ok(html.includes('href="/go/'+slug+'"'),'Missing general work assistant '+slug);
  for(const slug of ['cosupport-ai','questie-ai','lorka-ai'])
    assert.ok(!html.includes('href="/go/'+slug+'"'),'Niche assistant promoted into general work shortlist: '+slug);
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]||'{}');
  assert.deepEqual(schema.mainEntity.itemListElement.map(x=>x.item.name),['ChatGPT','Gemini','Claude']);
  const code=read('scripts/seo-eligibility.mjs');
  assert.match(code,/best-ai-assistants/);
  assert.match(code,/tool\?\.categoryReviewRequired !== true/);
});
