import test from 'node:test';
import assert from 'node:assert/strict';
import { indexRecoveryPriority } from '../scripts/gsc-index-priority.mjs';

test('an observed page beats an unobserved page, without touching search rank',()=>{
  assert.ok(indexRecoveryPriority('/news/observed',{impressions:21})>indexRecoveryPriority('/best-affordable-crm'));
});
test('commercial guides and proprietary research outrank ancillary pages',()=>{
  assert.ok(indexRecoveryPriority('/best-affordable-crm')>indexRecoveryPriority('/terms'));
  assert.ok(indexRecoveryPriority('/software-trends-index')>indexRecoveryPriority('/support'));
  assert.ok(indexRecoveryPriority('/tools/semrush')>indexRecoveryPriority('/privacy'));
  assert.equal(indexRecoveryPriority('/methodology'),85);
});
test('querystrings, suffixes and trailing slashes do not change the index recovery class',()=>{
  assert.equal(indexRecoveryPriority('/best-affordable-crm.html?source=link'),indexRecoveryPriority('/best-affordable-crm'));
  assert.equal(indexRecoveryPriority('/software-trends-index/'),indexRecoveryPriority('/software-trends-index'));
});
