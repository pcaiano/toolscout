import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

for(const label of ['Visitors - today','Sessions - 24h','Google clicks - 28d','Outbound clicks - 24h']) {
  assert.ok(html.includes(label), 'Missing core KPI label: '+label);
}

const businessStart=html.indexOf('function business(){');
const businessEnd=html.indexOf('function trafficProgress(){',businessStart);
assert.ok(businessStart>=0&&businessEnd>businessStart);
const business=html.slice(businessStart,businessEnd);

assert.equal(business.split("metric('").length-1,4,'Business State must expose exactly four primary KPIs');
assert.doesNotMatch(business,/Browser-qualified outbound/);
assert.doesNotMatch(business,/Strict \\/ user-activated outbound/);
assert.doesNotMatch(business,/Strict attributed humans/);
assert.doesNotMatch(business,/PartnerStack network clicks/);
assert.match(business,/st\\.commerceTruth/);
assert.match(business,/Google Search Console/);
assert.match(business,/GA4/);

const trafficStart=html.indexOf('function trafficProgress(){');
const trafficEnd=html.indexOf('function authorityProgress(){',trafficStart);
const traffic=html.slice(trafficStart,trafficEnd);
assert.match(traffic,/GA4 sessions/);
assert.match(traffic,/GA4 users/);
assert.doesNotMatch(traffic,/strictHuman|Strict verified humans/);

console.log('Command Center core KPI contract: exactly four primary metrics with canonical sources.');
