import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withGa4 } from '../ga4-html.js';
import { renderOpportunityPage } from '../seo-page.js';

const source = fs.readFileSync(new URL('../ga4-consent.js', import.meta.url), 'utf8');
const KEY = 'toolscout_analytics_consent_v1';
const ID = 'G-9VR80SYYH7';

function browser({saved, blockedStorage = false, url = 'https://trytoolscout.org/', cookie = ''} = {}) {
  const requests = [], hosts = [], cookieWrites = [], listeners = {};
  const storage = new Map(saved === undefined ? [] : [[KEY, JSON.stringify(saved)]]);
  const element = (dataset = {}) => ({dataset, hidden: false, handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; }, focus() { this.focused = true; },
    click() { this.handlers.click(); }});
  const panel = element(), settings = element();
  const accept = element({choice: 'granted'}), reject = element({choice: 'denied'});
  const shadow = {innerHTML: '', querySelector(selector) {
    return selector === '.panel' ? panel : selector === '.settings' ? settings : accept;
  }, querySelectorAll() { return [accept, reject]; }};
  const location = new URL(url);
  const document = {readyState: 'complete', referrer: 'https://example.org/article?email=private@example.org',
    get cookie() { return cookie; }, set cookie(value) { cookieWrites.push(value); },
    createElement(tag) { return tag === 'script' ? {} : {attachShadow() { return shadow; }}; },
    head: {appendChild(script) { requests.push(script.src); }},
    body: {appendChild(host) { hosts.push(host); }}
  };
  const window = {location, addEventListener(name, fn) { listeners[name] = fn; }};
  const localStorage = {getItem(key) { if (blockedStorage) throw Error('blocked'); return storage.get(key) || null; },
    setItem(key, value) { if (blockedStorage) throw Error('blocked'); storage.set(key, value); }};
  const context = vm.createContext({window, document, location, localStorage, URL, Date});
  const run = () => vm.runInContext(source, context);
  run();
  return {window, requests, hosts, panel, settings, accept, reject, storage, cookieWrites, run,
    commands: () => Array.from(window.dataLayer || [], args => Array.from(args)),
    withdrawElsewhere() { storage.set(KEY, JSON.stringify({value: 'denied', at: Date.now()})); listeners.storage({key: KEY}); }};
}

test('no Google script or measurement command before consent', () => {
  const b = browser();
  assert.equal(b.requests.length, 0);
  assert.equal(b.commands().some(x => x[0] === 'config'), false);
  assert.equal(b.window['ga-disable-' + ID], true);
  assert.equal(b.panel.hidden, false);
  assert.equal(b.commands()[0][2].ad_user_data, 'denied');
});

test('acceptance loads the correct tag once, after consent defaults and update', () => {
  const b = browser(); b.accept.click();
  assert.deepEqual(b.requests, ['https://www.googletagmanager.com/gtag/js?id=' + ID]);
  assert.deepEqual(b.commands().map(x => x.slice(0, 2)), [
    ['consent', 'default'], ['consent', 'update'], ['js', b.commands()[2][1]], ['config', ID]
  ]);
  assert.equal(b.commands()[3][2].allow_google_signals, false);
  assert.equal(JSON.parse(b.storage.get(KEY)).value, 'granted');
  b.accept.click(); b.run();
  assert.equal(b.requests.length, 1);
  assert.equal(b.commands().filter(x => x[0] === 'config').length, 1);
  assert.equal(b.hosts.length, 1);
});

test('rejection persists without loading the Google tag', () => {
  const b = browser(); b.reject.click();
  assert.equal(b.requests.length, 0);
  assert.equal(b.panel.hidden, true);
  assert.equal(b.settings.hidden, false);
  assert.equal(JSON.parse(b.storage.get(KEY)).value, 'denied');
});

test('saved acceptance loads automatically; saved refusal keeps it blocked', () => {
  for (const value of ['granted', 'denied']) {
    const b = browser({saved: {value, at: Date.now()}});
    assert.equal(b.requests.length, value === 'granted' ? 1 : 0);
    assert.equal(b.panel.hidden, true);
  }
});

test('expired, malformed and future consent requires a new choice', () => {
  for (const saved of [{value: 'granted', at: 0}, {value: 'yes', at: Date.now()},
    {value: 'granted', at: Date.now() + 60000}, {value: 'granted', at: 'yesterday'}]) {
    const b = browser({saved});
    assert.equal(b.requests.length, 0);
    assert.equal(b.panel.hidden, false);
  }
});

test('analytics settings allow withdrawal and remove GA cookies only', () => {
  const b = browser({saved: {value: 'granted', at: Date.now()}, cookie: '_ga=a; _ga_9VR80SYYH7=b; toolscout_session=keep'});
  b.settings.click(); assert.equal(b.panel.hidden, false);
  b.reject.click();
  assert.equal(b.window['ga-disable-' + ID], true);
  assert.equal(b.commands().at(-1)[2].analytics_storage, 'denied');
  assert.equal(b.cookieWrites.length, 6);
  assert.equal(b.cookieWrites.some(x => x.startsWith('toolscout_session=')), false);
});

test('withdrawal in another tab disables measurement', () => {
  const b = browser({saved: {value: 'granted', at: Date.now()}});
  b.withdrawElsewhere();
  assert.equal(b.window['ga-disable-' + ID], true);
});

test('blocked local storage does not break the site or imply acceptance', () => {
  const b = browser({blockedStorage: true});
  assert.equal(b.requests.length, 0);
  b.accept.click(); assert.equal(b.requests.length, 1);
  b.reject.click(); assert.equal(b.window['ga-disable-' + ID], true);
});

test('private pages, embeds, preview hosts and owner visits do not load analytics', () => {
  const urls = ['/analytics', '/analytics.html', '/analytics-v2/', '/analytics/api/stats', '/admin.html',
    '/affiliate-workflow/', '/distribution-workflow.html', '/api/health', '/embed/finder', '/go/make', '/reports/test.html'];
  for (const url of [...urls.map(p => 'https://trytoolscout.org' + p), 'https://preview.workers.dev/', 'http://localhost:8787/']) {
    const b = browser({url, saved: {value: 'granted', at: Date.now()}});
    assert.equal(b.requests.length, 0, url); assert.equal(b.hosts.length, 0, url);
  }
  assert.equal(browser({cookie: 'toolscout_owner=1'}).hosts.length, 0);
});

test('page configuration strips arbitrary query data but keeps campaign attribution', () => {
  const b = browser({url: 'https://trytoolscout.org/tools/make?utm_source=newsletter&utm_medium=email&email=private@example.org&q=secret#secret'});
  b.accept.click();
  const config = b.commands().find(x => x[0] === 'config')[2];
  assert.equal(config.page_location, 'https://trytoolscout.org/tools/make?utm_source=newsletter&utm_medium=email');
  assert.equal(config.page_referrer, 'https://example.org/article');
});

test('HTML installation is idempotent and dynamic pages include the tag', () => {
  const html = '<html><head><title>Test</title></head><body></body></html>';
  assert.equal(withGa4(withGa4(html)), withGa4(html));
  assert.equal(withGa4(html).match(/src="\/ga4-consent.js"/g).length, 1);
  const dynamic = renderOpportunityPage({slug: 'best-crm', opportunity: {opportunity_score: 10}});
  assert.match(dynamic, /src="\/ga4-consent.js"/);
});

test('deployment preparation includes root, blog and tool pages while excluding private pages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolscout-ga4-'));
  try {
    const html = '<html><head><title>Test</title></head><body>Test</body></html>';
    for (const name of ['index.html', 'blog/post.html', 'tools/make.html', 'analytics-v2.html', 'admin.html', 'embed/finder.html']) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
      fs.writeFileSync(path.join(dir, name), html);
    }
    const script = fileURLToPath(new URL('../scripts/unify-public-nav.mjs', import.meta.url));
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(process.execPath, [script], {cwd: dir, encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
    }
    for (const name of ['index.html', 'blog/post.html', 'tools/make.html'])
      assert.equal(fs.readFileSync(path.join(dir, name), 'utf8').match(/src="\/ga4-consent.js"/g).length, 1);
    for (const name of ['analytics-v2.html', 'admin.html', 'embed/finder.html'])
      assert.equal(fs.readFileSync(path.join(dir, name), 'utf8').includes('/ga4-consent.js'), false);
  } finally {
    // Only remove the exact temporary fixture directory created by this test.
    if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('toolscout-ga4-'))
      fs.rmSync(dir, {recursive: true, force: true});
  }
});
