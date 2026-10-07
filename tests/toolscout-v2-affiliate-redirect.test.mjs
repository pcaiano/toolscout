import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('affiliate redirects stay crawlable so Google can observe their noindex header',()=>{
  const robots=read('robots.txt');
  const outbound=read('outbound-integrity-worker.js');
  assert.doesNotMatch(robots,/^Disallow:\s*\/go\//mi);
  assert.match(outbound,/X-Robots-Tag','noindex, nofollow, noarchive'/);
});

test('affiliate redirect direct owner preserves the proven commercial stages',()=>{
  const runtime=read('affiliate-redirect-runtime.js');
  assert.match(runtime,/import commercialCore from '\.\/distribution-embed-worker\.js'/);
  assert.match(runtime,/applyAffiliateRedirectIntegrity/);
  assert.match(runtime,/linkVisitorAfterRequest/);
  assert.match(runtime,/X-ToolScout-Commercial-Core','bounded-compat-v1/);
  assert.match(runtime,/preserve_affiliate_destination_and_subid/);
  assert.match(runtime,/preserve_catalog_public_fallback/);
  assert.match(runtime,/preserve_go_embed_tracking/);
  assert.match(runtime,/known_automation_never_counts_as_monetized/);
  assert.match(runtime,/synthetic_health_checks_never_record_clicks/);
  assert.match(runtime,/outbound_proof_never_manufactures_page_confirmation/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);

  const social=runtime.indexOf("recordSocialAffiliateRedirect(request,env,url,response)");
  const outbound=runtime.indexOf("applyAffiliateRedirectIntegrity(request,env,url,response)");
  const visitor=runtime.indexOf("linkVisitorAfterRequest(request,env,url,response,null)");
  assert.ok(social>=0&&outbound>social&&visitor>outbound,'commercial response stages must keep social -> outbound integrity -> visitor linkage ordering');
});

test('direct owner reuses the existing integrity and visitor semantics instead of duplicating them',()=>{
  const outbound=read('outbound-integrity-worker.js');
  const visitor=read('visitor-integrity-worker.js');
  assert.match(outbound,/export async function applyAffiliateRedirectIntegrity/);
  assert.match(outbound,/bypassKnownAutomation/);
  assert.match(outbound,/recordVerifiedOutbound/);
  assert.match(outbound,/withRedirectRobots/);
  assert.match(outbound,/if\(url\.pathname\.startsWith\('\/go\/'\)\)response=await applyAffiliateRedirectIntegrity/);
  assert.match(visitor,/linkAfterRequest as linkVisitorAfterRequest/);
  assert.match(visitor,/source:'outbound-proof'/);
});

test('bounded commercial core still owns click-time affiliate truth and fallbacks',()=>{
  const dynamic=read('dynamic-worker.js');
  const embed=read('distribution-embed-worker.js');
  const workflow=read('affiliate-workflow-worker.js');

  assert.match(dynamic,/async function trackedRedirect/);
  assert.match(dynamic,/appendVerifiedSubId/);
  assert.match(dynamic,/affiliate_active_at_click/);
  assert.match(dynamic,/click_ref/);
  assert.match(dynamic,/X-ToolScout-Health-Check/);
  assert.match(dynamic,/SESSION_CLASSIFICATIONS\.SYNTHETIC\|\|healthCheck/);

  assert.match(embed,/u\.pathname==='\/go\/embed'/);
  assert.match(workflow,/async function catalogFallbackRedirect/);
  assert.match(workflow,/affiliate_active_at_click,affiliate_program,affiliate_route/);
});

test('social redirect attribution remains migration-owned',()=>{
  const runtime=read('affiliate-redirect-runtime.js');
  const migration=read('migrations/0079_content_social_affiliate_engine.sql');
  assert.match(runtime,/INSERT OR IGNORE INTO social_affiliate_redirects/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS social_affiliate_redirects/);
  assert.match(migration,/idx_social_affiliate_redirects_created/);
  assert.match(migration,/idx_social_affiliate_redirects_tool_created/);
});
