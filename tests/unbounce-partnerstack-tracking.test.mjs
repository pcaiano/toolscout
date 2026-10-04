import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public surface recognizes the verified Unbounce PartnerStack link shape',()=>{
  const validator=fs.readFileSync('scripts/validate-public-surface.mjs','utf8');
  const affiliate=JSON.parse(fs.readFileSync('data/affiliate.json','utf8'));
  assert.equal(affiliate.unbounce?.enabled,true);
  assert.match(String(affiliate.unbounce?.url||''),/^https:\/\/unbounce\.partnerlinks\.io\/[a-z0-9]+\/?$/i);
  assert.match(validator,/slug==='unbounce'&&host==='unbounce\.partnerlinks\.io'/);
});
