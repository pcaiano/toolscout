import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('catalog research prioritizes affiliate-ready AI and MCP candidates without changing editorial neutrality',()=>{
  const config=JSON.parse(read('data/catalog-engine.json'));
  assert.equal(config.version,8);
  assert.equal(config.discovery.useAffiliatePipelineAsResearchPrioritySignal,true);
  assert.equal(config.discovery.affiliateProgramMayIncreaseResearchQueuePriority,true);
  assert.equal(config.discovery.affiliateCommissionRateCannotAffectResearchPriority,true);
  assert.equal(config.discovery.affiliateStatusCannotAffectAdmissionOrRanking,true);
  assert.ok(config.discovery.researchPriority.activeAffiliateProgram>config.discovery.researchPriority.knownAffiliateProgram);
  assert.ok(config.discovery.researchPriority.verifiedMcp>config.discovery.researchPriority.aiOrAgentResearchHint);

  const catalog=read('catalog-autonomy-worker.js');
  assert.match(catalog,/catalogCandidateResearchPriority/);
  assert.match(catalog,/affiliateResearchRegistry/);
  assert.match(catalog,/pool\.sort\(\(a,b\)=>b\.priority\.score-a\.priority\.score/);
  assert.match(catalog,/Admission, rankings and fit remain affiliate-neutral/);

  const execution=read('growth-execution-contract.js');
  assert.match(execution,/affiliate_network_program_evidence/);
  assert.match(execution,/affiliate_program_discovery/);
  assert.match(execution,/lower\(subject_key\) LIKE '%mcp%'/);
  assert.match(execution,/lower\(subject_key\) LIKE '%claude%'/);
});
