import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const plane=read('auth-session-plane.js');
assert.match(plane,/AES-GCM/);
assert.match(plane,/toolscout-auth-vault-v1/);
assert.match(plane,/auth_session_vault/);
assert.match(plane,/completion_token_hash/);
assert.match(plane,/captchaPolicy:'human_only_no_bypass'/);
assert.match(plane,/credentialStorage:'no_passwords_session_state_aes_gcm'/);
assert.match(plane,/human_bootstrap_session/);
assert.match(plane,/reusable_session_candidate/);
assert.match(plane,/authenticatedResumeSweep/);
assert.doesNotMatch(plane,/password\s*[:=]/i);

const broker=read('auth-broker/server.mjs');
assert.match(broker,/captchaPolicy:'human_only_no_bypass'/);
assert.match(broker,/passwordStorage:false/);
assert.match(broker,/MAX_SESSIONS=2/);
assert.match(broker,/SESSION_TTL_MS=20\*60\*1000/);
assert.match(broker,/login_still_present/);
assert.match(broker,/Save session & resume automation/);
assert.match(broker,/ToolScout does not solve CAPTCHA/);
assert.match(broker,/input id="text" type="password"/);
assert.doesNotMatch(broker,/console\.log\([^\n]*(body|text|password|otp)/i);
assert.doesNotMatch(broker,/2captcha|anticaptcha|captcha[_-]?solver|captcha[_-]?bypass/i);

const human=read('human-action-entry-worker.js');
assert.match(human,/Open secure login session/);
assert.match(human,/\/analytics\/api\/human-actions\/auth-handoff/);

const router=read('compute-router-worker.js');
assert.match(router,/\/api\/auth-plane\/health/);
assert.match(router,/completeAuthHandoff/);
assert.match(router,/authenticatedResumeSweep/);

console.log('Auth Plane v1 trust boundary is intact.');
