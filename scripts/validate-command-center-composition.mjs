import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fail = message => { console.error('FAIL:', message); process.exitCode = 1; };

const wrangler = read('wrangler.toml');
const affiliateWrapper = read('command-center-affiliate-table-worker.js');
const growth = read('growth-command-center-v2-worker.js');
const analytics = read('analytics-v2.html');

if (!/main\s*=\s*["']command-center-light-theme-worker\.js["']/.test(wrangler)) {
  fail('Unexpected ToolScout Worker entrypoint.');
}
if (!/const canonical=await base\.fetch\(trustedRequest,env,ctx\)/.test(affiliateWrapper)) {
  fail('Affiliate Command Center wrapper is not delegating to canonical page composition.');
}
if (/env\.ASSETS\.fetch\(assetRequest\)|new URL\(['"]\/analytics-v2/.test(affiliateWrapper)) {
  fail('Outer Command Center wrapper rebuilds the raw analytics asset and can hide new widgets.');
}
if (!/data-widget="autonomous-growth"/.test(growth) || !/autonomousGrowth/.test(growth)) {
  fail('Autonomous Growth surface is missing from canonical Growth Command Center.');
}
if (/Distribution Engine 2\.1|Affiliate Coverage Engine 2\.0/.test(analytics)) {
  fail('Engine version is hardcoded in static Command Center markup.');
}
if (!/x\.version\?'v'\+x\.version/.test(analytics)) {
  fail('Runtime engine version rendering is missing.');
}

if (!process.exitCode) console.log('PASS: Command Center composition contract is intact.');
