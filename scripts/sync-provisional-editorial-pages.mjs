#!/usr/bin/env node
/* Surgical regeneration of catalog-only editorial HTML.
   Doesn't touch URLs, nav, canonical, metadata, affiliate routes or verified reviews. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/tools.json'),'utf8'));
const esc=v=>String(v??'').replace(/[\u2014\u2013]/g,'-').replace(/\s+/g,' ').trim()
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const section=/<section class="editorialIntro"><div class="eyebrow">ToolScout view<\/div><p>[\s\S]*?<\/p>(?:<div class="editorialBuyerCheck">[\s\S]*?<\/div>)?<\/section>/;
const oldEvidence='first-party vendor source recorded in the ToolScout catalog and separated from the commercial outbound route.';
const newEvidence='catalog-based editorial assessment only; product claims, plans and integrations are not independently verified.';
const introCSS='.editorialIntro p{font-size:16px;line-height:1.7;color:#475467;margin:8px 0 0}';
const extraCSS='.editorialBuyerCheck{margin-top:14px;padding-top:12px;border-top:1px solid #e4e7ec;color:#344054;font-size:14px;line-height:1.6}.editorialBuyerCheck strong{color:#101828}';
const flag=' <strong>Category under review:</strong> check whether this is the right type of software for your task.';
let modified=0,processed=0,unexpected=0;
for(const tool of catalog){
  if(tool.editorialReview?.verificationStatus!=='catalog_only')continue;
  processed++;
  const filepath=path.join(root,'tools',tool.slug+'.html');
  if(!fs.existsSync(filepath))throw Error('Missing original profile: '+tool.slug);
  const original=fs.readFileSync(filepath,'utf8');
  const beforeCanonical=original.match(/<link rel="canonical" href="[^"]+">/)?.[0];
  const beforeCTA=original.match(new RegExp('href="/go/'+tool.slug+'"'))?.[0];
  if(!beforeCanonical||!beforeCTA||!section.test(original))throw Error('Profile invariants missing: '+tool.slug);
  const review=tool.editorialReview;
  const assessment=`<section class="editorialIntro"><div class="eyebrow">ToolScout view</div><p>${esc(review.summary)}</p><div class="editorialBuyerCheck"><strong>Before you choose:</strong> ${esc(review.buyerCheck)} <span class="small">Editorial assessment ${esc(review.reviewedAt)}. Catalog-based; vendor claims and plan limits not independently verified.</span>${tool.categoryReviewRequired?flag:''}</div></section>`;
  let updated=original.replace(section,assessment);
  if(!updated.includes('.editorialBuyerCheck{')){
    if(!updated.includes(introCSS))throw Error('Style anchor missing: '+tool.slug);
    updated=updated.replace(introCSS,introCSS+extraCSS);
  }
  if(updated.includes(oldEvidence))updated=updated.replace(oldEvidence,newEvidence);
  else if(!updated.includes(newEvidence))throw Error('Existing evidence footer missing: '+tool.slug);
  if(tool.categoryReviewRequired)
    updated=updated.replace('Independent '+tool.category+' software profile','Software profile, category review pending');
  if(updated.match(/<link rel="canonical" href="[^"]+">/)?.[0]!==beforeCanonical||
     updated.match(new RegExp('href="/go/'+tool.slug+'"'))?.[0]!==beforeCTA)throw Error('Canonical or commercial route drift: '+tool.slug);
  if(updated!==original){
    modified++;
    if(process.argv.includes('--write'))fs.writeFileSync(filepath,updated,'utf8');
  }
}
const expected=catalog.filter(t=>t.editorialReview?.verificationStatus==='catalog_only').length;
if(processed!==expected)throw Error('Expected '+expected+' inspected provisional profiles, got '+processed);
console.log(JSON.stringify({catalog:catalog.length,provisional:expected,changed:modified,mode:process.argv.includes('--write')?'write':'dry-run',unexpected}));
