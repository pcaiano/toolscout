import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {manufacturerFactProposals,reconcileManufacturerFacts} from '../catalog-manufacturer-fact-reconcile.js';
import {cleanPublicCatalogProfileCopy} from '../catalog-public-fact-copy.js';
import {monitoredManufacturerDocuments} from '../catalog-manufacturer-document-watch.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const sample=catalog.find(x=>x.slug==='systeme-io');
const capacity=sample.decisionClaims.find(x=>x.type==='plan_limit'&&x.unit==='contacts');
assert.ok(capacity);
function doc(text,url=capacity.sourceUrl){return [{url,status:'ok',documentText:text}]}
test('two independent first-party observations update exact plan allowances without inventing verification of other fields',()=>{
 const text='Free plan includes up to 2500 contacts.';
 const changes=manufacturerFactProposals(sample,doc(text));
 assert.equal(changes.length,1);
 assert.equal(changes[0].oldValue,2000);
 assert.equal(changes[0].newValue,2500);
 const first=reconcileManufacturerFacts(sample,changes,null,{today:'2026-10-10'});
 assert.equal(first.status,'needs_second_observation');
 const second=reconcileManufacturerFacts(sample,changes,first.proposal,{today:'2026-10-10'});
 assert.equal(second.status,'corrected');
 assert.equal(second.updatedTool.decisionClaims.find(x=>x.value===capacity.value).quantity,2500);
 assert.equal(second.updatedTool.decisionClaims.find(x=>x.value===capacity.value).verifiedAt,'2026-10-10');
 assert.ok(second.updatedTool.editorialReview.summary.includes('2,500 contacts'),'buyer-facing editorial fact must update with confirmed capacity');
 assert.ok(second.updatedTool.pricingDetails.freePlanSummary.includes('2,500 contacts'),'public plan summary must not contradict corrected D1 limit');
 assert.equal(sample.decisionClaims.find(x=>x.value===capacity.value).quantity,2000,'original must remain a recoverable snapshot');
 assert.equal(second.updatedTool.lastVerified,sample.lastVerified,'single numeric confirmation must not falsely refresh entire product');
 assert.equal(reconcileManufacturerFacts(sample,changes,{token:'other'}).status,'needs_second_observation');
});
test('no speculative updates from off-domain documents, missing plans, contradictory quotas or unchanged manufacturer quantities',()=>{
 const correct='Free plan includes up to 2000 contacts.';
 assert.deepEqual(manufacturerFactProposals(sample,doc(correct)),[]);
 assert.deepEqual(manufacturerFactProposals(sample,doc('Business plan includes up to 2500 contacts.')),[]);
 assert.deepEqual(manufacturerFactProposals(sample,doc('Free plan includes 2500 contacts. Free plan allows 3000 contacts.')),[]);
 assert.deepEqual(manufacturerFactProposals(sample,doc('Free plan includes 2500 contacts.', 'https://competitor.example/pricing')),[]);
 assert.deepEqual(manufacturerFactProposals(sample,doc('Promotional Free plan includes 2500 contacts.')),[]);
 assert.deepEqual(manufacturerFactProposals(sample,doc('Free plan includes 2500 automation contacts.')),[]);
});
test('monthly manufacturer plan quotes require exact currency, plan and monthly terms',()=>{
 const hubspot=catalog.find(x=>x.slug==='hubspot');
 const claim=hubspot.decisionClaims.find(x=>x.type==='price_quote'&&x.plan==='Starter'&&x.currency==='EUR');
 assert.ok(claim);
 const observations=[{url:claim.sourceUrl,status:'ok',documentText:'Starter plan costs €25 per seat per month.'}];
 const change=manufacturerFactProposals(hubspot,observations);
 assert.equal(change.find(x=>x.type==='price_quote')?.newValue,25);
 const first=reconcileManufacturerFacts(hubspot,change,null);
 const second=reconcileManufacturerFacts(hubspot,change,first.proposal,{today:'2026-10-10'});
 assert.equal(second.updatedTool.decisionClaims.find(x=>x.value===claim.value).amount,25);
 assert.equal(second.updatedTool.decisionClaims.find(x=>x.value===claim.value).chargeAmount,25);
 assert.deepEqual(manufacturerFactProposals(hubspot,[{url:claim.sourceUrl,status:'ok',documentText:'Starter plan costs €25 per seat per year.'}]),[]);
 assert.deepEqual(manufacturerFactProposals(hubspot,[{url:claim.sourceUrl,status:'ok',documentText:'Starter plan introductory offer costs €25 per seat per month.'}]),[]);
});
test('profile presentation never exposes generic pending-review banners or unsupported AI and free plan answers',()=>{
 const markup='<html><body><div data-catalog-runtime-warning="1">Pricing may be pending re-verification.</div><section class="section aiInterop" data-ai-interoperability="1">ToolScout has not yet verified this tool integration.</section><p>Paid plans; verify current pricing before publication</p><details><summary>Does Example work with ChatGPT?</summary><p>ToolScout has not yet verified this integration.</p></details><script type="application/ld+json">'+JSON.stringify([{'@type':'FAQPage',mainEntity:[{'@type':'Question',name:'Does Example work with ChatGPT?',acceptedAnswer:{text:'ToolScout has not yet verified this integration.'}}]}])+'</script></body></html>';
 const result=cleanPublicCatalogProfileCopy(markup);
 assert.doesNotMatch(result,/pending re-verification|not yet verified|verify current pricing before publication|data-catalog-runtime-warning/i);
 assert.ok(result.includes('Paid plans'));
 assert.ok(!result.includes('<section class="section aiInterop"'));
 const schema=JSON.parse(result.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]||'null');
 assert.equal(schema[0].mainEntity.length,0);
 const runtime=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/injectPendingReview/);
 assert.match(runtime,/manufacturerFactProposals\(tool,observations\)/);
 assert.match(runtime,/catalog_fact_corrected/);
});
test('manufacturer monitoring retains matching primary documentation URLs and original catalog membership',()=>{
 assert.ok(monitoredManufacturerDocuments(sample).includes(capacity.sourceUrl));
 assert.equal(catalog.length,127);
});
