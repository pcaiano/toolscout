import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  expectedHumanValue,
  shouldSpendExternalResearch,
  MIN_EXTERNAL_VALUE_FOR_RESEARCH
} from '../acquisition-value-model.js';

const commodity=expectedHumanValue({
  surface_type:'ai_directory',
  audience_fit:10,
  authority:5,
  traffic_potential:10,
  backlink_value:5,
  acceptance_probability:95,
  automation_potential:100,
  effort_cost:5
});
assert.ok(commodity.score<MIN_EXTERNAL_VALUE_FOR_RESEARCH,'Easy automation must not make a low-value directory worth researching.');
assert.equal(commodity.researchEligible,false);

const publisher=expectedHumanValue({
  surface_type:'editorial_publisher',
  audience_fit:85,
  authority:80,
  traffic_potential:80,
  backlink_value:75,
  acceptance_probability:50,
  automation_potential:0,
  effort_cost:20
});
assert.ok(publisher.score>=70,'High-authority audience surfaces should outrank easy low-value automation.');
assert.equal(publisher.researchEligible,true);

const proven=expectedHumanValue({
  surface_type:'directory',
  audience_fit:20,
  authority:15,
  traffic_potential:20,
  backlink_value:10,
  acceptance_probability:50,
  effort_cost:10,
  browser_confirmed_sessions_30d:3,
  outbound_clicks_30d:4,
  monetized_outbound_30d:3
});
assert.equal(proven.researchEligible,true,'Verified human/commercial proof must override weak heuristics.');

const protectedLow=shouldSpendExternalResearch({
  status:'live',
  live_url:'https://example.com/toolscout',
  surface_type:'directory',
  audience_fit:0,
  authority:0,
  traffic_potential:0,
  backlink_value:0,
  acceptance_probability:0,
  effort_cost:100
});
assert.equal(protectedLow.allowed,true,'ToolScout 2.0 must preserve already-live outcomes.');
assert.equal(protectedLow.preservationOverride,true);

const compute=fs.readFileSync(new URL('../compute-router-worker.js',import.meta.url),'utf8');
assert.match(compute,/COALESCE\(external_value_score,0\)>=\$\{MIN_EXTERNAL_VALUE_FOR_RESEARCH\}/);
assert.match(compute,/routeResearchValueEligible/);

const priority=fs.readFileSync(new URL('../distribution-priority-worker.js',import.meta.url),'utf8');
assert.match(priority,/expectedHumanValue/);
assert.match(priority,/below the \$\{MIN_EXTERNAL_VALUE_FOR_RESEARCH\} research floor/);
assert.match(priority,/external_value_tier/);

console.log('ToolScout 2.0 external-value-first acquisition policy is enforced.');
