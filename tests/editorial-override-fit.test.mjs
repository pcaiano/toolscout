import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialOverrideFitsShortlist } from '../scripts/editorial-override-fit.mjs';

test('current shortlist leaders must appear as named products in editorial analysis',()=>{
  const crm='Freshsales prioritises lead workflow; Zoho CRM offers another approach. monday CRM is also a candidate.';
  assert.equal(editorialOverrideFitsShortlist(crm,[{name:'Freshsales'},{name:'Zoho CRM'},{name:'monday CRM'}]),true);
  assert.equal(editorialOverrideFitsShortlist(crm,[{name:'Pipedrive'},{name:'HubSpot'}]),false);
});
test('brand word boundaries prevent accidental matches in unrelated prose',()=>{
  assert.equal(editorialOverrideFitsShortlist('Making thoughtful choices about workflows can help Buffer users.',[{name:'Make'},{name:'Buffer'}]),false);
  assert.equal(editorialOverrideFitsShortlist('Make and Buffer approach different jobs.',[{name:'Make'},{name:'Buffer'}]),true);
});
test('empty or single-option shortlists never publish static vendor comparisons',()=>{
  assert.equal(editorialOverrideFitsShortlist('Semrush leads.',[{name:'Semrush'}]),false);
  assert.equal(editorialOverrideFitsShortlist('',[{name:'Semrush'},{name:'Ahrefs'}]),false);
});
