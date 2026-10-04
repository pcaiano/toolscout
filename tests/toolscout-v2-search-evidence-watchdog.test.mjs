import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const seo=fs.readFileSync(new URL('../.github/workflows/seo-engine-v2.yml',import.meta.url),'utf8');
const watchdog=fs.readFileSync(new URL('../.github/workflows/search-evidence-watchdog.yml',import.meta.url),'utf8');
const probe=fs.readFileSync(new URL('../scripts/check-search-evidence-freshness.mjs',import.meta.url),'utf8');

test('SEO engine uses a permanent daily cadence without self-modifying bootstrap logic',()=>{
  assert.match(seo,/cron: '17 5 \* \* \*'/);
  assert.doesNotMatch(seo,/cron: '17 5 \* 10 \*'/);
  assert.doesNotMatch(seo,/Restore daily cadence after conservation window/);
  assert.match(seo,/check-search-evidence-freshness\.mjs --require-fresh/);
});

test('search evidence watchdog is independent, bounded and serialized with the SEO engine',()=>{
  assert.match(watchdog,/cron: '47 6 \* \* \*'/);
  assert.match(watchdog,/group: seo-engine-v2/);
  assert.match(watchdog,/ToolScout Search Freshness - production recovery deploy/);
  assert.match(watchdog,/check-search-evidence-freshness\.mjs --github-output/);
  assert.match(watchdog,/sync-gsc-signals\.mjs/);
  assert.match(watchdog,/build-growth-priority\.mjs/);
  assert.match(watchdog,/build-organic-growth-opportunities-v6\.mjs/);
  assert.match(watchdog,/check-search-evidence-freshness\.mjs --require-fresh/);
});

test('watchdog commits only search evidence artifacts and does not mutate public pages',()=>{
  assert.match(watchdog,/git add -- reports\/gsc-signals\.json reports\/growth-priority\.json reports\/organic-growth-opportunities\.json/);
  assert.doesNotMatch(watchdog,/generate-seo-pages/);
  assert.doesNotMatch(watchdog,/generate-comparisons/);
  assert.doesNotMatch(watchdog,/wrangler deploy/);
});

test('freshness probe detects both absolute staleness and derived-report lag',()=>{
  assert.match(probe,/MAX_GSC_AGE_HOURS=30/);
  assert.match(probe,/MAX_ORGANIC_AGE_HOURS=36/);
  assert.match(probe,/MAX_ORGANIC_LAG_HOURS=6/);
  assert.match(probe,/organic_lags_gsc/);
  assert.match(probe,/--require-fresh/);
  assert.match(probe,/--github-output/);
});
