import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { editorialOverrideFitsShortlist } from '../scripts/editorial-override-fit.mjs';

test('current shortlist leaders must appear as named products in editorial analysis',()=>{
  const crm='Freshsales prioritises lead workflow; Zoho CRM offers another approach. monday CRM is also a candidate.';
  assert.equal(editorialOverrideFitsShortlist(crm,[{name:'Freshsales'},{name:'Zoho CRM'},{name:'monday CRM'}]),true);
  assert.equal(editorialOverrideFitsShortlist(crm,[{name:'Pipedrive'},{name:'HubSpot'}]),false);
});
test('brand word boundaries prevent accidental matches in unrelated prose',()=>{
  assert.equal(editorialOverrideFitsShortlist('Making thoughtful choices about workflows can help Buffer users.',[{name:'Make'},{name:'Buffer'}]),false);
  assert.equal(editorialOverrideFitsShortlist('Make and Buffer approach different jobs.',[{name:'Make'},{name:'Buffer'}]),true);
});
test('empty or single-option shortlists never publish static vendor comparisons',()=>{
  assert.equal(editorialOverrideFitsShortlist('Semrush leads.',[{name:'Semrush'}]),false);
  assert.equal(editorialOverrideFitsShortlist('',[{name:'Semrush'},{name:'Ahrefs'}]),false);
});

test('Codex #646: GSC-priority guides keep ranked leaders, source conclusions and static pages aligned',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../data/organic-growth-engine.json',import.meta.url),'utf8'));
  const guides=[
    'best-crm-for-small-business',
    'best-free-crm',
    'best-social-media-management-tools',
    'best-project-management-tools'
  ];
  const escapeHtml=value=>String(value||'').replace(/[\u2014\u2013]/g,'-')
    .replace(/\s+/g,' ').trim().replaceAll('&','&amp;')
    .replaceAll("'",'&#39;').replaceAll('"','&quot;');
  const generator=fs.readFileSync(new URL('../scripts/generate-seo-pages.mjs',import.meta.url),'utf8');
  assert.match(generator,/shortlistGuardedIntents/);
  assert.match(generator,/editorialOverrideFitsShortlist\(override,toolsForPage\)/);
  for(const slug of guides){
    const html=fs.readFileSync(new URL('../'+slug+'.html',import.meta.url),'utf8');
    const override=config.editorialQuality.guideOverrides[slug];
    const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]||'{}');
    const leaders=schema.mainEntity.itemListElement.slice(0,2).map(row=>({name:row.item.name}));
    const analysis=html.match(/<section class="section editorial-analysis"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1]||'';
    assert.equal(leaders.length,2,'Missing two ranked leaders: '+slug);
    assert.equal(editorialOverrideFitsShortlist(override,leaders),true,'Stale configured conclusion: '+slug);
    assert.equal(editorialOverrideFitsShortlist(analysis,leaders),true,'Published conclusion disagrees with ranked leaders: '+slug);
    assert.ok(analysis.includes(escapeHtml(override).slice(0,85)),'Committed guide does not match source conclusion: '+slug);
    assert.ok(html.includes('<link rel="canonical" href="https://trytoolscout.org/'+slug+'">'),'Canonical drift: '+slug);
    assert.ok(html.includes('href="/go/'),'Missing commercial redirect: '+slug);
  }
});
