import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {injectNewsletterSignup} from '../newsletter-public-runtime.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('whats new exposes first-party newsletter signup before the story grid',()=>{
  const html=read('whats-new.html');
  assert.match(html,/data-newsletter-source="whats-new"/);
  assert.match(html,/Get the software changes worth knowing\./);
  assert.match(html,/newsletter-signup\.js/);
  assert.ok(html.indexOf('data-toolscout-newsletter="1"')<html.indexOf('class="grid"'));
});

test('news article runtime injects a compact newsletter signup',async()=>{
  const source='<!doctype html><html><head></head><body><main><article><h1>Story</h1></article></main></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await injectNewsletterSignup(response,{source:'news-article'});
  const html=await out.text();
  assert.match(html,/data-toolscout-newsletter="1"/);
  assert.match(html,/data-newsletter-source="news-article"/);
  assert.match(html,/newsletter-signup\.js/);
  assert.match(html,/Privacy policy/);
});

test('newsletter runtime persists explicit consent in a first-party ledger',()=>{
  const runtime=read('newsletter-runtime-worker.js');
  const migration=read('migrations/0116_newsletter_audience.sql');
  const router=read('compute-router-worker.js');
  assert.match(runtime,/consent_required/);
  assert.match(runtime,/toolscout-updates-v1/);
  assert.match(runtime,/hubspot_sync_status/);
  assert.match(runtime,/\/api\/newsletter\/subscribe/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS newsletter_subscribers/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS newsletter_events/);
  assert.match(router,/handleNewsletterRoute\(request,env,ctx\)/);
});

test('newsletter client records conversion only after confirmed subscription',()=>{
  const client=read('newsletter-signup.js');
  assert.match(client,/newsletter_signup/);
  assert.match(client,/data\.already_subscribed/);
  assert.match(client,/fetch\('\/api\/newsletter\/subscribe'/);
});


test('newsletter sync upserts contacts and applies the HubSpot subscription type',()=>{
  const runtime=read('newsletter-runtime-worker.js');
  const migration=read('migrations/0117_newsletter_hubspot_sync.sql');
  const router=read('compute-router-worker.js');
  assert.match(runtime,/resolveHubSpotSubscriptionType/);
  assert.match(runtime,/communication-preferences\/v4\/definitions/);
  assert.match(runtime,/HUBSPOT_SUBSCRIPTION_TYPE_ID\|\|''/);
  assert.match(runtime,/crm\/v3\/objects\/contacts\/batch\/upsert/);
  assert.match(runtime,/communication-preferences\/v4\/statuses\//);
  assert.match(runtime,/CONSENT_WITH_NOTICE/);
  assert.match(runtime,/runNewsletterHubSpotSync/);
  assert.match(runtime,/hubspot_access_token_missing/);
  assert.match(migration,/hubspot_sync_error/);
  assert.match(router,/newsletter_hubspot_sync_failed/);
});


test('portal-specific subscription IDs are not hardcoded into newsletter sync',()=>{
  const runtime=read('newsletter-runtime-worker.js');
  assert.doesNotMatch(runtime,/3781890361/);
  assert.match(runtime,/Marketing Information/);
  assert.match(runtime,/communication-preferences\/v4\/definitions/);
});
