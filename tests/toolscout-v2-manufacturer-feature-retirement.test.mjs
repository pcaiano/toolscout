import test from 'node:test';
import assert from 'node:assert/strict';
import {manufacturerFactProposals,reconcileManufacturerFacts} from '../catalog-manufacturer-fact-reconcile.js';

const sourceUrl='https://vendor.example/help/shared-inbox-automation';
const tool={
 slug:'vendor',name:'Vendor',sourceUrl:'https://vendor.example/',
 description:'Support platform with shared inbox automation. Team workflows remain centralized.',
 features:['shared inbox automation','team inbox','routing','reports'],
 bestFor:['support teams','small businesses'],
 pricing:'Paid plans',
 editorialReview:{summary:'Shared inbox automation helped teams route requests. The platform also has team inboxes, reports and reusable routing. These features help small support teams coordinate daily customer operations without forcing all decisions into email.',buyerCheck:'Test shared inbox automation before deciding.'},
 decisionClaims:[
  {type:'capability',value:'shared inbox automation',sourceUrl,status:'verified',verifiedAt:'2026-10-08'},
  {type:'capability',value:'team inbox',sourceUrl,status:'verified',verifiedAt:'2026-10-08'}
 ]
};
const evidence=t=>[{url:sourceUrl,status:'ok',documentText:t}];
test('explicit worldwide manufacturer feature retirement is applied after two identical source observations',()=>{
 const proposals=manufacturerFactProposals(tool,evidence('Shared inbox automation has been discontinued.'));
 assert.deepEqual(proposals.map(x=>x.type),['capability_retired']);
 const first=reconcileManufacturerFacts(tool,proposals,null,{today:'2026-10-10'});
 assert.equal(first.status,'needs_second_observation');
 const confirmed=reconcileManufacturerFacts(tool,proposals,first.proposal,{today:'2026-10-10'});
 assert.equal(confirmed.status,'corrected');
 assert.equal(confirmed.count,1);
 assert.ok(!confirmed.updatedTool.features.includes('shared inbox automation'));
 assert.equal(confirmed.updatedTool.decisionClaims[0].status,'retired');
 assert.equal(confirmed.updatedTool.decisionClaims[0].verifiedAt,'2026-10-10');
 assert.ok(confirmed.updatedTool.decisionClaims[1].status==='verified');
 assert.match(confirmed.updatedTool.editorialReview.summary,/manufacturer has discontinued shared inbox automation/);
 assert.doesNotMatch(confirmed.updatedTool.editorialReview.summary,/Shared inbox automation helped teams route requests/);
 assert.ok(confirmed.updatedTool.features.includes('routing'));
 assert.equal(tool.features.length,4,'immutable original archived profile');
});
test('only exact first-party global deprecations qualify; vague removals or a single tier do not',()=>{
 const cases=[
  'Some competitors no longer support shared inbox automation.',
  'Shared inbox automation is not available on the Free plan.',
  'Starter plan no longer includes shared inbox automation.',
  'We may retire shared inbox automation.',
  'We no longer support shared inbox automation on our Basic tier.',
  'Shared inbox automation is now supported.',
  'Read more about shared inbox automation being removed from your shortlist.'
 ];
 for(const text of cases)assert.deepEqual(manufacturerFactProposals(tool,evidence(text)),[],text);
 assert.deepEqual(manufacturerFactProposals(tool,[{url:'https://other.example/help',status:'ok',documentText:'Shared inbox automation is discontinued.'}]),[]);
 const scoped=structuredClone(tool);
 scoped.decisionClaims[0].plan='Starter';
 assert.deepEqual(manufacturerFactProposals(scoped,evidence('Shared inbox automation has been discontinued.')),[]);
 const supported=manufacturerFactProposals(tool,evidence('Our platform no longer supports shared inbox automation.'));
 assert.equal(supported.length,1);
});
test('feature retirement never makes a previously full catalog profile a thin listing',()=>{
 const thin={...structuredClone(tool),features:['shared inbox automation','team inbox','routing']};
 const proposals=manufacturerFactProposals(thin,evidence('Shared inbox automation has been discontinued.'));
 const first=reconcileManufacturerFacts(thin,proposals,null);
 assert.equal(reconcileManufacturerFacts(thin,proposals,first.proposal).status,'not_applied');
});
