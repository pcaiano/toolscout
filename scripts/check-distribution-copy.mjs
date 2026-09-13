import { readFileSync } from 'node:fs';

const targets = [
  'data/distribution-publishing-profile.json',
  'distribution-submission-worker.js',
  'distribution-autonomous-worker.js',
  'distribution-linkable-assets-worker.js',
  'scripts/generate-software-trends-index.mjs'
].map(path => [path, readFileSync(path, 'utf8')]);

const forbidden = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/u;

for (const [path, text] of targets) {
  if (forbidden.test(text)) {
    throw new Error(`${path} contains a forbidden Unicode dash in ToolScout-facing copy.`);
  }
}

console.log('ToolScout distribution and research copy contains no forbidden Unicode dashes.');
