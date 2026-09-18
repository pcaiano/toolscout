import fs from 'node:fs';

const policyPath='data/github-actions-resume-policy.json';
const fail=(message)=>{console.error('ACTIONS_RESUME_BLOCKED:',message);process.exit(1)};
if(!fs.existsSync(policyPath))fail('resume policy is missing');
const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
if(policy?.enabled!==true)fail(policy?.reason||'mutating Actions are locked');

const files={
  light:fs.readFileSync('command-center-light-theme-worker.js','utf8'),
  growth:fs.readFileSync('distribution-orchestrator-worker.js','utf8'),
  affiliate:fs.readFileSync('affiliate-coverage-cycle-worker.js','utf8'),
  catalog:fs.readFileSync('catalog-autonomy-worker.js','utf8'),
  funnel:fs.readFileSync('funnel-worker.js','utf8')
};
const required=policy.required||{};
if(required.autonomousGrowthBrain&&!files.light.includes(`autonomousGrowthBrain = '${required.autonomousGrowthBrain}'`)&&!files.light.includes(`brain:'${required.autonomousGrowthBrain}'`))fail('shared growth brain contract mismatch');
if(required.commandCenterComposition&&!files.light.includes(`commandCenterComposition = '${required.commandCenterComposition}'`)&&!files.light.includes(`commandCenterComposition:'${required.commandCenterComposition}'`))fail('Command Center composition contract mismatch');
if(required.affiliateEngine&&!files.light.includes(`affiliateEngineVersion = '${required.affiliateEngine}'`)&&!files.light.includes(`affiliate:'${required.affiliateEngine}'`))fail('Affiliate Engine contract mismatch');
if(required.catalogGrowth&&!files.light.includes(`catalogGrowthVersion = '${required.catalogGrowth}'`)&&!files.light.includes(`catalog:'${required.catalogGrowth}'`))fail('Catalog Growth contract mismatch');
if(required.minimumBuildContract&&!files.light.includes(`buildContract:'${required.minimumBuildContract}'`))fail('expected reviewed build contract is not present');
if(!files.funnel.includes("import base from './catalog-autonomy-worker.js'"))fail('Catalog Runtime is no longer in the live Worker chain');
if(!files.growth.includes("'affiliate'")||!files.growth.includes("'catalog_tool'"))fail('Affiliate/Catalog are no longer first-class shared growth opportunities');
if(!files.affiliate.includes('affiliate_application_packs')||!files.affiliate.includes('affiliate_route_verification'))fail('Affiliate 2.1 autonomy contract is missing');
if(!files.catalog.includes('rankingEligible:false')||!files.catalog.includes('comparisonEligible:false'))fail('Catalog editorial-neutrality gate is missing');

console.log('PASS: mutating GitHub Actions may run against the reviewed shared-growth-v3 contract.');
