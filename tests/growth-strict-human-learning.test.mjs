import assert from 'node:assert/strict';
import fs from 'node:fs';

const supervisor=fs.readFileSync(new URL('../growth-supervisor.js',import.meta.url),'utf8');
assert.match(supervisor,/strictHumanLearning/);
assert.match(supervisor,/google_organic_news_humans_7d/);
assert.match(supervisor,/news_can_capture_existing_google_demand/);
assert.match(supervisor,/reinforce_news_search_demand_and_route_to_decision_assets/);
assert.match(supervisor,/compound_google_news_demand_and_commercial_paths/);
assert.match(supervisor,/do_not_overfit_small_samples:true/);
assert.doesNotMatch(supervisor,/visitor_id.*strict_human_learning/);

const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
assert.match(orchestrator,/strictSearchHumans/);
assert.match(orchestrator,/strict-search-human:/);
assert.match(orchestrator,/strict_human_search_proof/);
assert.match(orchestrator,/D1 strict-human acquisition evidence/);
assert.match(orchestrator,/news_can_capture_existing_google_demand/);
assert.match(orchestrator,/content_amplification/);
assert.match(orchestrator,/sample_caution:true/);
assert.match(orchestrator,/conversion_goal:'route_search_humans_to_relevant_decision_assets_without_reducing_editorial_quality'/);

console.log('Growth Brain strict-human acquisition learning policy is protected.');
