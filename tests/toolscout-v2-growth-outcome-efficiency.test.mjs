import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router=fs.readFileSync(new URL('../compute-router-worker.js',import.meta.url),'utf8');
const supervisor=fs.readFileSync(new URL('../growth-supervisor.js',import.meta.url),'utf8');
const commandCenter=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

test('Contact Supply due truth counts only currently executable source work',()=>{
  assert.match(router,/JOIN contact_supply_domain cs ON cs\.domain=src\.domain/);
  assert.match(router,/cs\.contact_email IS NULL/);
  assert.match(router,/cs\.status IN \('queued','unresolved','provider_blocked','ready_route','researching'\)/);
  assert.match(router,/src\.source_id=\(\s*SELECT s2\.source_id FROM contact_supply_source s2/);
  assert.match(router,/distribution_vendor_amplification v[\s\S]*v\.status NOT IN \('sent','reputation_quarantine','suppressed_asset_mismatch'\)/);
  assert.match(router,/distribution_network_outreach n[\s\S]*n\.status NOT IN \('sent','adopted','reputation_quarantine','suppressed_competitor','suppressed_technical'\)/);
});

test('zero-yield external routes cool down for seven days while adapter recovery remains exempt',()=>{
  assert.match(router,/const ROUTE_ZERO_YIELD_COOLDOWN_HOURS=168/);
  assert.match(router,/noyield\.completed_at>=datetime\('now','-\$\{ROUTE_ZERO_YIELD_COOLDOWN_HOURS\} hours'\)/);
  assert.match(router,/EXISTS \(\s*SELECT 1 FROM distribution_auto_adapters recovery[\s\S]*recovery\.policy_state='revalidation_required'/);
  assert.match(router,/routeZeroYieldCooldownHours:ROUTE_ZERO_YIELD_COOLDOWN_HOURS/);
});

test('Growth Brain does not pretend exhausted vendor outreach supply is repeatable',()=>{
  assert.match(supervisor,/vendorOutreachHumans24/);
  assert.match(supervisor,/vendorOutreachHumans7/);
  assert.match(supervisor,/repeatableNonEmailHumans24=Math\.max\(0,h24-vendorHumans24\)/);
  assert.match(supervisor,/repeatableNonEmailHumans7=Math\.max\(0,h7-vendorHumans7\)/);
  const senderIndex=supervisor.indexOf("if(sender.exhausted)return{status:'active',directive:'reallocate_sender_capacity_to_self_service_authority_and_search'");
  const genericH7Index=supervisor.indexOf("if(h7>0)return{status:'emerging',directive:'repeat_human_generating_sources_and_measure_conversion'");
  assert.ok(senderIndex>0);
  assert.ok(genericH7Index>senderIndex);
  assert.match(supervisor,/preserve_vendor_outreach_evidence:vendorHumans7>0/);
});

test('Command Center labels source work and retry cadence as outcome-aware truth',()=>{
  assert.match(commandCenter,/eligible due/);
  assert.match(commandCenter,/zero-yield cooldown/);
  assert.match(commandCenter,/adapter revalidation remains immediate/);
});


test('Growth Brain stays focused on public consolidation, distributable assets and measurable audience growth',()=>{
  const playbook=JSON.parse(fs.readFileSync(new URL('../data/growth-acquisition-playbook.json',import.meta.url),'utf8'));
  assert.match(supervisor,/GROWTH_FOCUS=\['public_surface_completion','finder_publisher_editorial_distribution','audience_growth'\]/);
  assert.match(supervisor,/GROWTH_OUTCOMES=\['strict_verified_human_sessions','new_verified_referring_domains','newsletter_subscribers'\]/);
  assert.match(supervisor,/DISTRIBUTION_ASSETS=\['finder_embed','publisher_kit','editorial_content'\]/);
  assert.match(supervisor,/architecture_change_policy:\{mode:'freeze_by_default',allow_only:ARCHITECTURE_CHANGE_EXCEPTIONS\}/);
  assert.equal(playbook.rules.architectureFreezeByDefault,true);
  assert.deepEqual(playbook.rules.architectureChangeExceptions,['production_incident','integrity_failure','public_regression','growth_blocker']);
  assert.deepEqual(playbook.strategy.primaryAssets,['finder_embed','publisher_kit','editorial_content']);
  assert.deepEqual(playbook.strategy.primaryOutcomes,['strict_verified_human_sessions','new_verified_referring_domains','newsletter_subscribers']);
  assert.equal(playbook.strategy.publicSurfaceTarget,'100_percent_toolscout_2');
  assert.ok(playbook.strategy.successChain.includes('new_verified_referring_domains'));
  assert.ok(playbook.strategy.successChain.includes('newsletter_subscribers'));
});
