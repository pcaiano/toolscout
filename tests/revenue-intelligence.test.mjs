import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommercialPriorities, gapScore, opportunityScore, summarizeCommercialClicks } from '../revenue-intelligence.js';

test('keeps temporal monetization, unknown history and assisted attribution separate', () => {
  const summary = summarizeCommercialClicks([
    {session_id:'s1',tool_slug:'make',page_slug:'make-vs-zapier',attributed_intent:'automation',affiliate_active_at_click:1,recommendation_assisted:1},
    {session_id:'s2',tool_slug:'zapier',page_slug:null,attributed_intent:null,affiliate_active_at_click:0,recommendation_assisted:0},
    {session_id:'s3',tool_slug:'zapier',page_slug:null,attributed_intent:'automation',affiliate_active_at_click:null,recommendation_assisted:1}
  ], {page:{'make-vs-zapier':4},intent:{automation:5}}, 10);
  assert.deepEqual(summary.totals,{outboundClicks:3,monetizedOutbound:1,unmonetizedOutbound:1,monetizationUnknown:1,recommendationAssisted:2,directOutbound:1});
  assert.equal(summary.rankings.page[0].outboundRate,25);
  assert.equal(summary.rankings.tool.find(x=>x.tool_slug==='zapier').humanSessions,10);
});

test('scores are deterministic, bounded and explainable', () => {
  assert.equal(opportunityScore({humanSessions:25,outboundRate:50,monetizedOutbound:5,outboundClicks:10}),85);
  assert.equal(gapScore({unmonetizedOutbound:2,humanSessions:5,outboundRate:20}),50);
  const priorities=buildCommercialPriorities(summarizeCommercialClicks([{session_id:'s1',tool_slug:'zapier',affiliate_active_at_click:0,recommendation_assisted:0}],{},4));
  assert.equal(priorities.revenueGaps[0].tool_slug,'zapier');
});
