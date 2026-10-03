import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const discovery=fs.readFileSync(new URL('../distribution-discovery-worker.js',import.meta.url),'utf8');
const config=JSON.parse(fs.readFileSync(new URL('../data/distribution-discovery-sources.json',import.meta.url),'utf8'));

test('discovery rotates one D1 frontier instead of reserving every cycle for static seeds',()=>{
  assert.match(discovery,/SOURCE_RESCAN_HOURS=6/);
  assert.match(discovery,/ensureConfiguredSources\(env,c\.sources\|\|\[\]\)/);
  assert.match(discovery,/last_scanned_at IS NULL OR s\.last_scanned_at<=datetime\('now','-\$\{SOURCE_RESCAN_HOURS\} hours'\)/);
  assert.match(discovery,/CASE WHEN s\.last_scanned_at IS NULL THEN 0 ELSE 1 END,COALESCE\(s\.last_scanned_at,'1970-01-01'\) ASC/);
  assert.doesNotMatch(discovery,/sources=\[\.\.\.staticSources,\.\.\.dynamic\]/);
});

test('all attempted frontier sources receive freshness state and duplicate truth is observable',()=>{
  assert.match(discovery,/if\(!item\?\.usable\)\{if\(item\?\.attempted\)await markScanned/);
  assert.match(discovery,/await markScanned\(env,s\.slug,allLinks\.length,relevantOnSource\)/);
  assert.match(discovery,/known_duplicates:knownDuplicates/);
  assert.match(discovery,/due_sources_before:dueBefore/);
  assert.match(discovery,/due_sources_after:dueAfter/);
});

test('Phase 251 broadens current discovery seed coverage',()=>{
  const slugs=new Set(config.sources.map(x=>x.slug));
  for(const slug of [
    'man0l-ai-directories-2026',
    'tiorai-awesome-ai-directories',
    'thestacc-saas-directories-2026',
    'position-digital-saas-directories-2026',
    'speartip-saas-submission-guide-2026',
    'vioscale-saas-directories-2026'
  ]) assert.equal(slugs.has(slug),true,slug+' missing');
});
