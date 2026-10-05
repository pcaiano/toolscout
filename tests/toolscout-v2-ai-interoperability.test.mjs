import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=JSON.parse(read('data/tools.json'));

test('every catalog tool has an explicit AI interoperability state',()=>{
  assert.ok(catalog.length>=100);
  for(const tool of catalog){
    assert.ok(tool.aiIntegration&&typeof tool.aiIntegration==='object',tool.slug+' missing aiIntegration');
    assert.ok(['verified','unverified'].includes(tool.aiIntegration.status),tool.slug+' has invalid AI status');
    assert.ok(Array.isArray(tool.aiIntegration.assistants),tool.slug+' assistants must be an array');
    assert.ok(Array.isArray(tool.aiIntegration.sources),tool.slug+' sources must be an array');
    if(tool.aiIntegration.status==='verified'){
      assert.ok(['strong','moderate','limited'].includes(tool.aiIntegration.tier),tool.slug+' verified tier is invalid');
      assert.ok(tool.aiIntegration.sources.length>0,tool.slug+' verified AI claim needs first-party evidence');
      for(const source of tool.aiIntegration.sources)assert.match(source,/^https:\/\//,tool.slug+' AI evidence must use HTTPS');
    }else{
      assert.equal(tool.aiIntegration.tier,'unknown',tool.slug+' unknown evidence must not become a negative score');
    }
  }
});

test('tool profiles expose AI interoperability without turning unknown into no support',()=>{
  const src=read('scripts/generate-tool-pages.mjs');
  assert.match(src,/AI interoperability/);
  assert.match(src,/ChatGPT, Claude, Gemini or AI agents/);
  assert.match(src,/unknown status is not treated as no integration/i);
  assert.match(src,/featureList/);
  assert.match(src,/data-ai-interoperability/);
});

test('catalog cards and both comparison paths surface verified AI connectivity',()=>{
  const directory=read('tools.html');
  const dynamicCompare=read('compare.html');
  const staticCompare=read('scripts/generate-comparisons.mjs');
  const indexedCompare=read('comparison-ai-runtime.js');
  assert.match(directory,/AI connected/);
  assert.match(directory,/aiIntegration/);
  for(const src of [dynamicCompare,staticCompare,indexedCompare]){
    assert.match(src,/AI interoperability/);
    assert.match(src,/AI assistants/);
    assert.match(src,/Agent connectivity/);
    assert.match(src,/aiIntegration/);
  }
});

test('indexed comparison responses are enriched server-side without changing their canonical URL',()=>{
  const runtime=read('comparison-ai-runtime.js');
  const compute=read('compute-router-worker.js');
  assert.match(runtime,/data-ai-comparison/);
  assert.match(runtime,/data\/comparisons\.json/);
  assert.match(runtime,/unknown.*excluded from the recommendation|excluded from the recommendation/i);
  assert.match(compute,/transformComparisonAiResponse/);
});

test('buyer guides carry verified AI interoperability as evidence',()=>{
  const staticGuides=read('scripts/generate-seo-pages.mjs');
  const runtimeGuides=read('catalog-runtime-ranking.js');
  for(const src of [staticGuides,runtimeGuides]){
    assert.match(src,/AI connectivity/);
    assert.match(src,/aiIntegration/);
  }
});

test('autonomous catalog expansion researches AI interoperability from first-party pages',()=>{
  const gap=read('catalog-gap-runtime-worker.js');
  const config=JSON.parse(read('data/catalog-engine.json'));
  assert.match(gap,/aiEvidencePages/);
  assert.match(gap,/model context protocol/);
  assert.match(gap,/ChatGPT/);
  assert.match(gap,/Claude/);
  assert.match(gap,/Gemini/);
  assert.match(gap,/aiIntegration/);
  assert.equal(config.principles.aiIntegrationClaimsRequireFirstPartyEvidence,true);
  assert.equal(config.principles.unknownAiIntegrationMustNeverBePresentedAsNoIntegration,true);
  assert.ok(config.qualityControl.trackFields.includes('aiIntegration'));
});
