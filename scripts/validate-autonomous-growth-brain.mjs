import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fail=m=>{console.error('FAIL:',m);process.exitCode=1};

const funnel=read('funnel-worker.js');
const catalog=read('catalog-autonomy-worker.js');
const orchestrator=read('distribution-orchestrator-worker.js');
const affiliate=read('affiliate-coverage-cycle-worker.js');
const affiliateEntry=read('affiliate-coverage-entry-worker.js');
const dynamic=read('dynamic-worker.js');
const command=read('growth-command-center-v2-worker.js');
const analytics=read('analytics-v2.html');
const wrangler=read('wrangler.toml');

if(!funnel.includes("import base from './catalog-autonomy-worker.js'"))fail('Catalog Autonomy is not in the live Worker chain.');
if(!orchestrator.includes("'affiliate'")||!orchestrator.includes("'catalog_tool'")||!orchestrator.includes("'catalog_category'"))fail('Shared growth brain is missing Affiliate or Catalog opportunity types.');
if(!affiliate.includes('affiliate_application_packs')||!affiliate.includes('affiliate_route_verification'))fail('Affiliate 2.1 autonomous application/route state is missing.');
if(!dynamic.includes('d1AffiliateRoute')||!dynamic.includes("X-ToolScout-Health-Check"))fail('D1-backed production affiliate route is missing.');
if(!affiliateEntry.includes('/api/affiliate-replies/ingest')||!affiliateEntry.includes('AFFILIATE_REPLY_INGEST_TOKEN_SHA256'))fail('Secure affiliate email reconciliation is missing.');
if(!catalog.includes('catalog_runtime_state')||!catalog.includes('catalog_runtime_candidates')||!catalog.includes('confirmed_broken'))fail('Runtime Catalog Growth/Quality state is missing.');
if(!catalog.includes('rankingEligible:false')||!catalog.includes('comparisonEligible:false'))fail('Runtime catalog admission is not isolated from editorial ranking.');
if(!command.includes('data-widget="catalog-growth"')||!command.includes("version:'2.1'"))fail('Command Center does not expose Catalog Growth and Affiliate 2.1.');
if(!analytics.includes('Application packs')||!analytics.includes('Production verified routes'))fail('Affiliate autonomy metrics are not rendered in the Command Center.');
for(const route of ['/api/growth/*','/api/affiliate-coverage*','/api/affiliate-replies*','/api/catalog-autonomy*'])if(!wrangler.includes(route))fail('Worker routing missing '+route);

if(!process.exitCode)console.log('PASS: shared autonomous growth brain contract is intact.');
