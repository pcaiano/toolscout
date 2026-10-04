import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySearchPageAction,clickCaptureCtrFloorPct,SEARCH_ACTION_POLICY} from '../search-action-policy.js';

test('click capture requires a meaningful first-page sample and weak CTR for rank',()=>{
  const zeroClickTop3=classifySearchPageAction({impressions:31,clicks:0,ctr:0,position:3.16});
  assert.equal(zeroClickTop3.clickCaptureEligible,true);
  assert.deepEqual(zeroClickTop3.actions,['protect_current_ranking','improve_click_capture','search_measurement']);

  const healthyPositionSeven=classifySearchPageAction({impressions:30,clicks:2,ctr:6.6667,position:7.4});
  assert.equal(healthyPositionSeven.clickCaptureEligible,false);
  assert.deepEqual(healthyPositionSeven.actions,['protect_current_ranking','search_measurement']);

  const healthyHomepage=classifySearchPageAction({impressions:99,clicks:2,ctr:2.0202,position:7.5455});
  assert.equal(healthyHomepage.clickCaptureEligible,false);
  assert.deepEqual(healthyHomepage.actions,['protect_current_ranking','search_measurement']);
});

test('CTR floors get stricter near the top of the SERP',()=>{
  assert.equal(clickCaptureCtrFloorPct(2),5);
  assert.equal(clickCaptureCtrFloorPct(4),3);
  assert.equal(clickCaptureCtrFloorPct(8),1.5);
  assert.equal(clickCaptureCtrFloorPct(11),null);
});

test('small first-page samples are protected or observed without snippet mutation',()=>{
  const emerging=classifySearchPageAction({impressions:15,clicks:0,ctr:0,position:5});
  assert.equal(emerging.clickCaptureEligible,false);
  assert.deepEqual(emerging.actions,['protect_current_ranking','search_measurement']);

  const low=classifySearchPageAction({impressions:9,clicks:0,ctr:0,position:7});
  assert.equal(low.action,'measure_low_sample');
  assert.deepEqual(low.actions,['observe_low_sample_ranking','search_measurement']);
  assert.equal(SEARCH_ACTION_POLICY.clickCaptureMinImpressions,20);
});

test('existing striking-distance and authority-depth execution remains intact',()=>{
  assert.deepEqual(
    classifySearchPageAction({impressions:10,clicks:0,ctr:0,position:15}).actions,
    ['content_amplification','strengthen_internal_links','search_measurement']
  );
  assert.deepEqual(
    classifySearchPageAction({impressions:20,clicks:0,ctr:0,position:30}).actions,
    ['content_amplification','deepen_existing_search_asset','search_measurement']
  );
});
