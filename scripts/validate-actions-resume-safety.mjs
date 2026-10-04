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
  funnel:fs.readFileSync('funnel-worker.js','utf8'),
  seoController:fs.readFileSync('scripts/run-organic-growth-controller-v4.mjs','utf8'),
  seoApply:fs.readFileSync('scripts/apply-organic-growth-actions.mjs','utf8'),
  seoWorkflow:fs.readFileSync('.github/workflows/seo-engine-v2.yml','utf8'),
  trafficGuard:fs.readFileSync('traffic-integrity-guard-worker.js','utf8'),
  trafficLive:fs.readFileSync('traffic-integrity-live-worker.js','utf8'),
  commandCenter:fs.readFileSync('command-center-integrity-worker.js','utf8')
};
const required=policy.required||{};
if(required.autonomousGrowthBrain&&!files.light.includes(`autonomousGrowthBrain = '${required.autonomousGrowthBrain}'`)&&!files.light.includes(`brain:'${required.autonomousGrowthBrain}'`))fail('shared growth brain contract mismatch');
if(required.commandCenterComposition&&!files.light.includes(`commandCenterComposition = '${required.commandCenterComposition}'`)&&!files.light.includes(`commandCenterComposition:'${required.commandCenterComposition}'`))fail('Command Center composition contract mismatch');
if(required.affiliateEngine&&!files.light.includes(`affiliateEngineVersion = '${required.affiliateEngine}'`)&&!files.light.includes(`affiliate:'${required.affiliateEngine}'`))fail('Affiliate Engine contract mismatch');
if(required.catalogGrowth&&!files.light.includes(`catalogGrowthVersion = '${required.catalogGrowth}'`)&&!files.light.includes(`catalog:'${required.catalogGrowth}'`))fail('Catalog Growth contract mismatch');
if(required.minimumBuildContract){
  const match=files.light.match(/buildContract:['"]([^'"]+)['"]/);
  const actual=match?.[1]||null;
  const parse=(value)=>{
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/);
    return m?[Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4])]:null;
  };
  const a=parse(actual);
  const min=parse(required.minimumBuildContract);
  const atLeast=(left,right)=>{
    if(!left||!right)return left===right;
    for(let i=0;i<left.length;i++){
      if(left[i]>right[i])return true;
      if(left[i]<right[i])return false;
    }
    return true;
  };
  if(!atLeast(a,min))fail('expected reviewed build contract floor is not present: actual='+actual+' required>='+required.minimumBuildContract);
}
if(!files.funnel.includes("import base from './catalog-autonomy-worker.js'"))fail('Catalog Runtime is no longer in the live Worker chain');
if(!files.growth.includes("'affiliate'")||!files.growth.includes("'catalog_tool'"))fail('Affiliate/Catalog are no longer first-class shared growth opportunities');
if(!files.affiliate.includes('affiliate_application_packs')||!files.affiliate.includes('affiliate_route_verification'))fail('Affiliate 2.1 autonomy contract is missing');
if(!files.catalog.includes('rankingEligible:false')||!files.catalog.includes('comparisonEligible:false'))fail('Catalog editorial-neutrality gate is missing');
if(!files.growth.includes('/api/growth/search-directives'))fail('Shared Search directive endpoint is missing');
if(!files.seoController.includes('shared_growth_directives_required')||!files.seoApply.includes('organic_growth_actions_not_authorized_by_shared_brain'))fail('SEO execution is not gated by the shared growth brain');
if(!files.seoWorkflow.includes('fetch-shared-growth-directives.mjs'))fail('SEO workflow does not fetch runtime shared-brain directives');
if(!files.trafficGuard.includes('traffic_human_evidence')||!files.trafficGuard.includes("'trusted_interaction'")||!files.trafficLive.includes("canonicalPopulation:'traffic_human_evidence'")||!files.commandCenter.includes("version:'strict-human-v1'"))fail('strict-human-v1 Traffic Truth contract is missing');

console.log('PASS: mutating GitHub Actions may run against the reviewed shared-growth-v3 contract.');
