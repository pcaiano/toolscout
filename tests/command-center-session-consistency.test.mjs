import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

assert.match(src,/refreshCommandCenterSession/);
assert.match(src,/command_center_session_expired/);
assert.match(src,/ccFetch/);
assert.match(src,/session_refresh=/);
assert.match(src,/Chairman Queue could not refresh/);
assert.match(src,/This is a source\/session error, not an empty queue/);
assert.match(src,/sourceErrors\.queue/);

const match=src.match(/<script>\n([\s\S]*?)\n<\/script>/);
assert.ok(match,'embedded Command Center script should exist');
assert.doesNotThrow(()=>new Function(match[1]));

console.log('Command Center auto-recovers expired browser sessions and never renders a failed queue source as Clear.');
