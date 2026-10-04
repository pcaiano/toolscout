import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('SEO validator recognizes canonical extensionless ToolScout profile links',()=>{
  const validator=fs.readFileSync('scripts/validate-seo-pages.mjs','utf8');
  const generator=fs.readFileSync('scripts/generate-seo-pages.mjs','utf8');
  assert.match(validator,/\/tools\\\/\(\[a-z0-9-\]\+\)\(\?:\\\.html\)\?/);
  assert.match(generator,/replace\(\/\<a href=.*\/tools\/\$1/);
  assert.match(generator,/View tool profile/);
});
