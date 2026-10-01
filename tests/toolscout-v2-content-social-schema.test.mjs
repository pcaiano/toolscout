import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Content Engine social intelligence schema is migration-owned',()=>{
  const migration=read('migrations/0103_content_social_intelligence_schema.sql');
  for(const table of [
    'content_social_profiles',
    'affiliate_social_policy',
    'affiliate_social_evidence_registry',
    'social_affiliate_redirects',
    'content_engine_briefs',
    'growth_action_events',
    'distribution_contact_route_actions'
  ])assert.match(migration,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
  assert.match(migration,/bluesky_did TEXT/);
  assert.match(migration,/idx_social_affiliate_redirects_created/);
  assert.match(migration,/idx_content_briefs_created/);
});

test('Content Engine runtime no longer mutates schema',()=>{
  const runtime=read('content-engine-intelligence-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/async function ensureSchema\(_env\)\{return true;\}/);
});

test('affiliate social onboarding helper no longer mutates migration-owned schema',()=>{
  const runtime=read('affiliate-social-onboarding.js');
  const migration0080=read('migrations/0080_affiliate_social_onboarding.sql');
  assert.match(migration0080,/CREATE TABLE IF NOT EXISTS affiliate_social_policy_queue/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/ensureAffiliateSocialOnboardingSchema\(_env\)\{return true;\}/);
});
