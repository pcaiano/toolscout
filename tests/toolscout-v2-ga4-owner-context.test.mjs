import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_COOKIE,OWNER_SINCE_COOKIE,OWNER_SOURCE,OWNER_MEDIUM,
  markerState,withOwnerMarker,markOwnerAnalyticsHtml
} from '../ga4-owner-context.js';

test('Command Center owner marker sets durable owner cookies',()=>{
  const request=new Request('https://trytoolscout.org/analytics');
  const response=withOwnerMarker(new Response('<html></html>',{headers:{'Content-Type':'text/html'}}),request);
  const cookie=String(response.headers.get('set-cookie')||'');
  assert.match(cookie,new RegExp(OWNER_COOKIE+'=1'));
  assert.match(cookie,new RegExp(OWNER_SINCE_COOKIE+'='));
  assert.match(cookie,/Max-Age=31536000/);
  assert.match(cookie,/SameSite=Lax/);
  assert.match(cookie,/Secure/);
});

test('existing owner-since cookie is preserved rather than reset',()=>{
  const since=1700000000000;
  const request=new Request('https://trytoolscout.org/analytics',{headers:{Cookie:`${OWNER_COOKIE}=1; ${OWNER_SINCE_COOKIE}=${since}`}});
  const response=withOwnerMarker(new Response('ok'),request);
  const cookie=String(response.headers.get('set-cookie')||'');
  assert.match(cookie,new RegExp(OWNER_COOKIE+'=1'));
  assert.doesNotMatch(cookie,new RegExp(OWNER_SINCE_COOKIE+'='));
});

test('owner marker reaches ready only after a full 24h clean window',()=>{
  const since=1700000000000;
  const request=new Request('https://trytoolscout.org/',{headers:{Cookie:`${OWNER_COOKIE}=1; ${OWNER_SINCE_COOKIE}=${since}`}});
  const warm=markerState(request,since+23*3600000);
  const ready=markerState(request,since+24*3600000);
  assert.equal(warm.ready,false);
  assert.equal(warm.warmupRemainingHours,1);
  assert.equal(ready.ready,true);
  assert.equal(ready.coverageHours,24);
});

test('owner public analytics keeps the existing GA measurement id but changes campaign attribution',()=>{
  const html="<script>gtag('config','G-9VR80SYYH7');</script>";
  const marked=markOwnerAnalyticsHtml(html);
  assert.match(marked,/G-9VR80SYYH7/);
  assert.match(marked,new RegExp("campaign_source:'"+OWNER_SOURCE+"'"));
  assert.match(marked,new RegExp("campaign_medium:'"+OWNER_MEDIUM+"'"));
  assert.doesNotMatch(marked,/gtag\('config','G-9VR80SYYH7'\);/);
});
