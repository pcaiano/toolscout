import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Growth Sprint 1 is grounded in current Google demand and has an explicit business allocation',()=>{
  const sprint=JSON.parse(read('reports/growth-sprint-1.json'));
  assert.equal(sprint.id,'growth-sprint-1-search-winners-2026-10-04');
  assert.equal(sprint.baseline.gsc28d.impressions,5950);
  assert.equal(sprint.baseline.gsc28d.clicks,7);
  assert.equal(sprint.allocationPct.existingDemandSearch,65);
  assert.equal(sprint.allocationPct.authorityVendorNetwork,30);
  assert.ok(sprint.targets.length>=10);
  assert.ok(sprint.targets.some(x=>x.path==='/best-seo-tools-for-agencies'&&x.impressions>=1800));
  assert.ok(sprint.targets.some(x=>x.path==='/best-project-management-tools'&&x.position<50));
});

test('Growth Brain consumes the sprint asset and materializes explicit sprint search opportunities',()=>{
  const runtime=read('distribution-orchestrator-worker.js');
  assert.match(runtime,/growthAssetJson\(env,'\/reports\/growth-sprint-1\.json'/);
  assert.match(runtime,/const sprintTargets=Array\.isArray\(growthSprint\?\.targets\)/);
  assert.match(runtime,/for\(const target of sprintTargets\)/);
  assert.match(runtime,/sprint_id:growthSprint\?\.id\|\|HUMAN_ACQUISITION_SPRINT\.id/);
  assert.match(runtime,/allocationPct:\{existingDemandSearch:65,authorityVendorNetwork:30,aiAeoDiscovery:5,growthRnd:0\}/);
  assert.equal((runtime.match(/HUMAN_ACQUISITION_GSC_TARGETS/g)||[]).length,0);
});

test('Authority truth keeps contradictory providers separate instead of inventing a merged authority score',()=>{
  const authority=JSON.parse(read('data/authority-truth.json'));
  assert.equal(authority.sources.ahrefsDirect.value,2.3);
  assert.equal(authority.sources.ahrefsDirect.canonicalForMetric,true);
  assert.equal(authority.sources.tinyStartups.value,31);
  assert.equal(authority.sources.tinyStartups.canonicalForMetric,false);
  assert.equal(authority.sources.seRanking.backlinks,95);
  assert.equal(authority.sources.seRanking.referringDomains,29);
  assert.equal(authority.reconciliation.status,'source_disagreement_explained_not_merged');
});

test('Command Center exposes Ahrefs direct, Tiny Startups and SE Ranking as separate authority observations',()=>{
  const truth=read('command-center-business-truth-runtime.js');
  const ui=read('command-center-simplified-view.js');
  assert.match(truth,/\/data\/authority-truth\.json/);
  assert.match(truth,/canonicalAhrefsDomainRating/);
  assert.match(truth,/tinyStartupsAhrefsSnapshot/);
  assert.match(ui,/Ahrefs direct DR/);
  assert.match(ui,/Tiny Startups Ahrefs snapshot/);
  assert.match(ui,/SE Ranking profile/);
  assert.match(ui,/Third-party/);
});


test('Growth Sprint runtime asset is included in the Worker static asset allowlist',()=>{
  const ignore=read('.assetsignore');
  assert.match(ignore,/^reports\/\*$/m);
  assert.match(ignore,/^!reports\/growth-sprint-1\.json$/m);
});
