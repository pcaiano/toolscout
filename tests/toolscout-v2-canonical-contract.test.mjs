import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSeoPath,canonicalPublicUrl,canonicalizeOwnedMarkup,canonicalizePublicHtmlResponse} from '../public-canonical-contract.js';

test('ToolScout public canonicals are extensionless',()=>{
  assert.equal(canonicalSeoPath('/best-seo-tools-for-agencies.html'),'/best-seo-tools-for-agencies');
  assert.equal(canonicalSeoPath('/news/zapier-next-gen-zaps-mcp.html'),'/news/zapier-next-gen-zaps-mcp');
  assert.equal(canonicalSeoPath('/tools/airtable.html'),'/tools/airtable');
  assert.equal(canonicalSeoPath('/index.html'),'/');
  assert.equal(canonicalPublicUrl('/software-trends-index.html'),'https://trytoolscout.org/software-trends-index');
});

test('owned html links are normalized without touching external sources',()=>{
  const html='<link rel="canonical" href="https://trytoolscout.org/news/example.html"><a href="/tools/airtable.html">A</a><a href="https://vendor.example/docs.html">Vendor</a>';
  const out=canonicalizeOwnedMarkup(html);
  assert.match(out,/https:\/\/trytoolscout\.org\/news\/example"/);
  assert.match(out,/href="\/tools\/airtable"/);
  assert.match(out,/https:\/\/vendor\.example\/docs\.html/);
});

test('html response canonicalization marks the public contract',async()=>{
  const response=await canonicalizePublicHtmlResponse(
    new Response('<!doctype html><html><head><link rel="canonical" href="https://trytoolscout.org/software-trends-index.html"></head><body></body></html>',{headers:{'Content-Type':'text/html'}}),
    '/software-trends-index'
  );
  const body=await response.text();
  assert.match(body,/canonical" href="https:\/\/trytoolscout\.org\/software-trends-index"/);
  assert.equal(response.headers.get('X-ToolScout-SEO-Canonical'),'extensionless-v1');
  assert.equal(response.headers.get('X-ToolScout-Canonical-Path'),'/software-trends-index');
});
