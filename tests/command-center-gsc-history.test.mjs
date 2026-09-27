import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const cc=read('command-center-simplified-view.js');
assert.match(cc,/Average position - lower is better/);
assert.match(cc,/key:'position',label:'Average position'/);
assert.match(cc,/zeroBaseline:false,invert:true,axisDecimals:1/);
assert.match(cc,/g\.dailyGeneratedAt\|\|g\.runtimeGeneratedAt\|\|g\.generatedAt/);
assert.match(cc,/v===null\|\|v===undefined\|\|v===''\?null/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/\/data\/gsc-daily-trend\.json/);
assert.match(truth,/const assetDaily28=Array\.isArray\(gscDailyTrend\?\.daily\)\?gscDailyTrend\.daily:\[\]/);
assert.match(truth,/const rawDaily28=assetDaily28\.length>=2\?assetDaily28:realityDaily28/);
assert.match(truth,/const hasComparison=recentRows\.length===7&&previousRows\.length===7/);
assert.match(truth,/dailySource:assetDaily28\.length>=2\?'gsc-daily-trend-asset':'gsc-search-reality-cache'/);

console.log('Command Center uses canonical GSC daily history and renders average-position trend without treating missing history as zero.');
