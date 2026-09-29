import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

for(const label of ['Visitors - today','Sessions - 24h','Google clicks - 28d','Outbound clicks - 24h','Monetized outbound - 24h']) {
  assert.ok(html.includes(label), 'Missing core KPI label: '+label);
}

const businessStart=html.indexOf('function business(){');
const businessEnd=html.indexOf('function trafficProgress(){',businessStart);
assert.ok(businessStart>=0&&businessEnd>businessStart);
const business=html.slice(businessStart,businessEnd);

assert.equal(business.split("metric('").length-1,5,'Business State must expose exactly five primary KPIs');
assert.doesNotMatch(business,/Browser-qualified outbound/);
assert.ok(!business.includes('Strict / user-activated outbound'));
assert.doesNotMatch(business,/Strict attributed humans/);
assert.doesNotMatch(business,/PartnerStack network clicks/);
assert.ok(business.includes('a?.outbound'));
assert.match(business,/Google Search Console/);
assert.match(business,/GA4/);

const trafficStart=html.indexOf('function trafficProgress(){');
const trafficEnd=html.indexOf('function authorityProgress(){',trafficStart);
const traffic=html.slice(trafficStart,trafficEnd);
assert.match(traffic,/GA4 sessions/);
assert.match(traffic,/GA4 users/);
assert.doesNotMatch(traffic,/strictHuman|Strict verified humans/);

assert.ok(!business.includes('data.stats'));
assert.ok(html.includes("acquisition:'/analytics/api/google/acquisition'"));
assert.ok(!html.includes("stats:'/analytics/api/stats'"));
const ga4Worker=fs.readFileSync(new URL('../command-center-ga4-worker.js',import.meta.url),'utf8');
assert.match(ga4Worker,/vendor_outbound/);
assert.match(ga4Worker,/monetized_outbound/);
assert.match(ga4Worker,/Server \/go\/ requests are diagnostic only/);
const consent=fs.readFileSync(new URL('../analytics-consent.js',import.meta.url),'utf8');
assert.match(consent,/send\('vendor_outbound'/);
assert.match(consent,/send\('monetized_outbound'/);
assert.match(consent,/activeAffiliates/);
console.log('Command Center core KPI contract: five simple metrics with GA4 browser outbound events.');
