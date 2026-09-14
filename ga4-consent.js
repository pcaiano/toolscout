/* ToolScout GA4: basic consent mode. No Google requests before acceptance. */
(function () {
  'use strict';
  var ID = 'G-9VR80SYYH7';
  var KEY = 'toolscout_analytics_consent_v1';
  var TTL = 180 * 24 * 60 * 60 * 1000;
  if (window.toolscoutAnalytics || window.location.hostname !== 'trytoolscout.org') return;
  if (/^\/(?:analytics[^/]*|admin|affiliate-workflow|distribution-workflow|click|api|go|embed|reports|data)(?:\/|\.html|$)/i.test(location.pathname)) return;
  // Keep owner visits out of the public acquisition reports.
  if (/(?:^|;\s*)toolscout_owner=1(?:;|$)/.test(document.cookie)) return;

  var choice = readChoice();
  var loaded = false;
  var panel, settings, root;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  window['ga-disable-' + ID] = true;
  gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied'
  });

  function readChoice() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && (saved.value === 'granted' || saved.value === 'denied') &&
          Number.isFinite(saved.at) && saved.at <= Date.now() && Date.now() - saved.at < TTL) return saved.value;
    } catch (_) {}
    return null;
  }

  function pageLocation() {
    var page = new URL(location.href);
    var clean = new URL(page.origin + page.pathname);
    // Preserve conventional campaign attribution, without arbitrary query text or fragments.
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term'].forEach(function (key) {
      var value = page.searchParams.get(key);
      if (value && /^[a-zA-Z0-9_. -]{1,100}$/.test(value)) clean.searchParams.set(key, value);
    });
    return clean.href;
  }

  function start() {
    window['ga-disable-' + ID] = false;
    gtag('consent', 'update', {analytics_storage: 'granted'});
    if (loaded) return;
    loaded = true;
    var referrer = '';
    try { var ref = new URL(document.referrer); referrer = ref.origin + ref.pathname; } catch (_) {}
    gtag('js', new Date());
    gtag('config', ID, {
      page_location: pageLocation(), page_referrer: referrer,
      allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_expires: 15552000
    });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(script);
  }

  function clearCookies() {
    document.cookie.split(';').forEach(function (entry) {
      var name = entry.split('=')[0].trim();
      if (name !== '_ga' && name.indexOf('_ga_') !== 0) return;
      ['', '; Domain=trytoolscout.org', '; Domain=.trytoolscout.org'].forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax; Secure' + domain;
      });
    });
  }

  function stop() {
    window['ga-disable-' + ID] = true;
    gtag('consent', 'update', {analytics_storage: 'denied'});
    clearCookies();
  }

  function choose(value) {
    choice = value;
    try { localStorage.setItem(KEY, JSON.stringify({value: value, at: Date.now()})); } catch (_) {}
    if (value === 'granted') start(); else stop();
    panel.hidden = true;
    settings.hidden = false;
    settings.focus();
  }

  function showSettings() {
    panel.hidden = false;
    settings.hidden = true;
    root.querySelector('[data-choice="granted"]').focus();
  }

  function mount() {
    var host = document.createElement('div');
    host.id = 'toolscout-analytics-settings';
    root = host.attachShadow({mode: 'open'});
    root.innerHTML = '<style>:host{all:initial;font-family:system-ui,sans-serif;color:#101828}*{box-sizing:border-box}[hidden]{display:none!important}.panel{position:fixed;z-index:2147483646;bottom:16px;left:16px;right:16px;max-width:520px;padding:22px;background:#fff;border:1px solid #d0d5dd;border-radius:16px;box-shadow:0 8px 32px #10182826;font-size:14px;line-height:1.5;max-height:80vh;overflow:auto}h2{font-size:18px;margin:0 0 8px}p{margin:0 0 16px}a{color:#344054;text-decoration:underline}.actions{display:flex;flex-wrap:wrap;gap:10px}button{font:600 14px system-ui,sans-serif;border:1px solid #344054;border-radius:8px;padding:11px 16px;cursor:pointer;background:#fff;color:#101828}button:hover{background:#f2f4f7}button:focus-visible,a:focus-visible{outline:3px solid #1570ef;outline-offset:3px}.actions button{flex:1}.settings{position:fixed;z-index:2147483645;bottom:12px;left:12px;font-size:12px;box-shadow:0 2px 8px #10182815}@media(max-width:400px){.panel{padding:16px;bottom:10px;left:10px;right:10px}}</style>' +
      '<section class="panel" role="region" aria-labelledby="analytics-heading"><h2 id="analytics-heading">Help us improve ToolScout</h2>' +
      '<p>May we use Google Analytics cookies to understand visits and how people use ToolScout? You can use the site either way and change your choice at any time. <a href="/privacy">Privacy policy</a></p>' +
      '<div class="actions"><button type="button" data-choice="granted">Accept analytics</button><button type="button" data-choice="denied">Reject analytics</button></div></section>' +
      '<button type="button" class="settings">Analytics settings</button>';
    panel = root.querySelector('.panel');
    settings = root.querySelector('.settings');
    panel.hidden = choice !== null;
    settings.hidden = choice === null;
    root.querySelectorAll('[data-choice]').forEach(function (button) {
      button.addEventListener('click', function () { choose(button.dataset.choice); });
    });
    settings.addEventListener('click', showSettings);
    document.body.appendChild(host);
    if (choice === 'granted') start(); else clearCookies();
  }

  window.toolscoutAnalytics = {openSettings: showSettings};
  // Respect withdrawal in another tab immediately.
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY && event.key !== null) return;
    choice = readChoice();
    if (choice === 'granted') start(); else stop();
    if (panel) { panel.hidden = choice !== null; settings.hidden = choice === null; }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
