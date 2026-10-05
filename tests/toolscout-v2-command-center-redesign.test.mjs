import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Command Center redesign exposes GA4 and GSC report explorers',()=>{
  const src=read('command-center-redesign-runtime.js');
  for(const label of ['Overview','Acquisition','Landing pages','Geography','Devices','Engagement'])assert.ok(src.includes(label),label+' missing from GA4 explorer');
  for(const label of ['Performance','Queries','Pages','Countries','Indexing','Opportunities'])assert.ok(src.includes(label),label+' missing from GSC explorer');
  for(const metric of ['Clicks','Impressions','CTR','Average position'])assert.ok(src.includes(metric),metric+' missing from GSC metrics');
  assert.match(src,/data-ts-gsc-metric/);
  assert.match(src,/prefers-reduced-motion/);
});

test('GA4 backend supplies the report dimensions used by the explorer',()=>{
  const src=read('command-center-ga4-worker.js');
  for(const dim of ['deviceCategory','landingPagePlusQueryString','sessionDefaultChannelGroup'])assert.ok(src.includes(dim),dim+' missing');
  for(const metric of ['newUsers','engagedSessions','engagementRate','averageSessionDuration'])assert.ok(src.includes(metric),metric+' missing');
  assert.match(src,/devices,landingPages,channels/);
});

test('GSC business truth supplies drill-down dimensions and opportunities',()=>{
  const src=read('command-center-business-truth-runtime.js');
  assert.match(src,/countries:gscEvidence/);
  assert.match(src,/devices:gscEvidence/);
  assert.match(src,/pages:gscEvidence/);
  assert.match(src,/opportunities:gscEvidence/);
  assert.match(src,/countries:gscEvidenceAvailable/);
  assert.match(src,/devices:gscEvidenceAvailable/);
});

test('Command Center direct owner applies redesign without changing canonical truth ownership',()=>{
  const direct=read('command-center-direct-runtime.js');
  assert.match(direct,/handleBaseCommandCenterDirectRoute/);
  assert.match(direct,/transformCommandCenterRedesignResponse/);
});
