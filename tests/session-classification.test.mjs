import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySessionRequest, SESSION_CLASSIFICATIONS } from '../session-classification.js';

const request = (userAgent, cookie = '') => new Request('https://trytoolscout.org/api/events', {headers:{'User-Agent':userAgent, Cookie:cookie}});

test('owner cookie takes precedence', () => {
  assert.equal(classifySessionRequest(request('Googlebot/2.1', 'toolscout_owner=1')), SESSION_CLASSIFICATIONS.OWNER);
});

test('existing smoke and health user agents are synthetic', () => {
  assert.equal(classifySessionRequest(request('ToolScout production smoke/1.0')), SESSION_CLASSIFICATIONS.SYNTHETIC);
  assert.equal(classifySessionRequest(request('ToolScout healthcheck/1.0')), SESSION_CLASSIFICATIONS.SYNTHETIC);
  assert.equal(classifySessionRequest(request('curl/8.7.1')), SESSION_CLASSIFICATIONS.SYNTHETIC);
});

test('known crawlers are classified separately', () => {
  assert.equal(classifySessionRequest(request('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')), SESSION_CLASSIFICATIONS.KNOWN_BOT);
  assert.equal(classifySessionRequest(request('Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 AhrefsBot/7.0')), SESSION_CLASSIFICATIONS.KNOWN_BOT);
});

test('only plausible browser user agents are likely human', () => {
  assert.equal(classifySessionRequest(request('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36')), SESSION_CLASSIFICATIONS.LIKELY_HUMAN);
  assert.equal(classifySessionRequest(request('custom-client/1.0')), SESSION_CLASSIFICATIONS.UNKNOWN);
  assert.equal(classifySessionRequest(request('')), SESSION_CLASSIFICATIONS.UNKNOWN);
});
