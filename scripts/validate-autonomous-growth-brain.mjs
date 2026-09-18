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
const seoController=read('scripts/run-organic-growth-controller-v4.mjs');
const seoApply=read('scripts/apply-organic-growth-actions.mjs');
const seoWorkflow=read('.github/workflows/seo-engine-v2.yml');
const seoFetch=read('scripts/fetch-shared-growth-directives.mjs');
const content=read('content-engine-intelligence-worker.js');
const rndPolicy=read('data/growth-rnd-policy.json');

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
if(!orchestrator.includes("'news_update'")||!orchestrator.includes('/api/growth/search-directives'))fail("What's New or shared SEO directives are missing from the growth brain.");
if(!catalog.includes('software_news_candidates')||!catalog.includes('software_news_sources'))fail("What's New official-source watcher is missing.");
if(!content.includes("subject_type IN ('tool','news_update')"))fail("Content Engine is not consuming What's New growth opportunities.");
if(!seoFetch.includes('/api/growth/search-directives')||!seoController.includes('shared_growth_directives_required')||!seoApply.includes('organic_growth_actions_not_authorized_by_shared_brain'))fail('SEO execution is not gated by shared-growth-v3 directives.');
if(!seoWorkflow.includes('fetch-shared-growth-directives.mjs'))fail('SEO workflow does not fetch runtime growth directives.');
if(!orchestrator.includes('growth_rnd_experiments')||!orchestrator.includes("mission:'rnd_audit'"))fail('Autonomous Growth R&D audit is missing.');
const rnd=JSON.parse(rndPolicy);if(rnd.mode!=='bounded_autonomy'||!Array.isArray(rnd.hardGates)||!rnd.hardGates.includes('new_paid_spend'))fail('Growth R&D bounded-autonomy guardrails are missing.');

if(!process.exitCode)console.log('PASS: shared autonomous growth brain contract is intact.');
