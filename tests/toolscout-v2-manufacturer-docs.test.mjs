import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {vendorEvidenceIssues} from '../scripts/check-vendor-evidence.mjs';
import {transformPublicRedesignResponse} from '../public-redesign-runtime.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));

test('every future tool requires a dated first-party manufacturer source',()=>{
 const catalog=read('data/tools.json'), pending=read('data/vendor-evidence-backlog.json').pendingSlugs;
 assert.equal(catalog.length,127);
 assert.equal(pending.length,102);
 assert.deepEqual(vendorEvidenceIssues(catalog,pending),[]);
 const invented={...catalog[0],slug:'unsourced-new-software',editorialReview:{summary:'Unsupported',verificationStatus:'catalog_only',sourceUrl:null},evidence:[]};
 assert.match(vendorEvidenceIssues([...catalog,invented],pending).join(' '),/Manufacturer documentation required/);
 const copied={...catalog.find(x=>x.slug==='posthog'),slug:'new-tool-with-dated-sources'};
 assert.deepEqual(vendorEvidenceIssues([...catalog,copied],pending),[]);
});

test('generated profiles use the product name as the only H1',()=>{
 const generator=fs.readFileSync(new URL('../scripts/generate-tool-pages.mjs',import.meta.url),'utf8');
 assert.ok(generator.includes('<h1>${esc(tool.name)}</h1>'));
 assert.ok(!generator.includes('<h1>${esc(tool.name)} profile</h1>'));
});

test('existing live profile pages remove only redundant H1 profile suffix',async()=>{
 const html='<!doctype html><html><head></head><body><main class="hero"><h1>HubSpot profile</h1><p>Independent CRM profile</p><a href="/go/hubspot">Visit</a></main></body></html>';
 const input=new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
 const url='https://trytoolscout.org/tools/hubspot';
 const changed=await transformPublicRedesignResponse(new Request(url),input);
 const result=await changed.text();
 assert.match(result,/<h1>HubSpot<\/h1>/);
 assert.doesNotMatch(result,/<h1>HubSpot profile<\/h1>/);
 assert.match(result,/Independent CRM profile/);
 assert.match(result,/href="\/go\/hubspot"/);
});
