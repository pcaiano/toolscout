import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAffiliateState,nextActionFor,isDuplicateApplication,coverageMetrics,networkCoverage,opportunityScore,reconcileAffiliateReply} from '../affiliate-operations.js';

test('normalizes legacy states and provides exactly one action',()=>{
  assert.equal(normalizeAffiliateState('no_affiliate_program'),'no_program_found');
  assert.equal(nextActionFor({status:'approved_needs_link'}),'Retrieve approved affiliate link');
});
test('prevents duplicate applications',()=>{
  assert.equal(isDuplicateApplication({status:'ready_to_apply',submitted_at:'2026-09-01'}),true);
  assert.equal(isDuplicateApplication({status:'ready_to_apply'}),false);
});
test('coverage excludes owner, synthetic and unknown legacy traffic',()=>{
  const m=coverageMetrics([{status:'verified'},{status:'research_required'},{status:'no_program_found'}],[
    {clicks:5,affiliate_active_at_click:1,classification:'likely-human',source:'seo'},
    {clicks:9,affiliate_active_at_click:0,classification:'owner',source:'internal-test'},
    {clicks:2,affiliate_active_at_click:0,classification:'unknown/legacy',source:'seo'}]);
  assert.equal(m.monetization_coverage,0.5); assert.equal(m.weighted_monetization_coverage,1);
});
test('network view and operational priority remain affiliate-only',()=>{
  const rows=networkCoverage([{network:'Dub',status:'active'},{network:'Dub',status:'blocked'}],[{name:'Dub'}]);
  assert.deepEqual({matches:rows[0].catalog_matches,active:rows[0].active,blocked:rows[0].blocked},{matches:2,active:1,blocked:1});
  assert.ok(opportunityScore({status:'blocked',strategic_unlock:true})>opportunityScore({status:'blocked'}));
});
test('Gmail reconciliation is catalog-bound and never invents a link',()=>{
  const slugs=new Set(['n8n']);
  assert.equal(reconcileAffiliateReply({tool_slug:'outside',decision:'approved'},slugs).accepted,false);
  assert.equal(reconcileAffiliateReply({tool_slug:'n8n',decision:'approved'},slugs).status,'approved_needs_link');
  assert.equal(reconcileAffiliateReply({tool_slug:'n8n',decision:'approved',affiliate_url:'https://example.com/ref'},slugs).status,'link_acquired');
});
