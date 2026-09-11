import { readFileSync } from 'node:fs';

const targets = [
  ['data/distribution-publishing-profile.json', readFileSync('data/distribution-publishing-profile.json', 'utf8')],
  ['distribution-submission-worker.js', readFileSync('distribution-submission-worker.js', 'utf8')]
];

const forbidden = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/u;

for (const [path, text] of targets) {
  if (forbidden.test(text)) {
    throw new Error(`${path} contains a forbidden Unicode dash in distribution-facing copy.`);
  }
}

console.log('Distribution-facing copy contains no forbidden Unicode dashes.');
