import assert from 'node:assert/strict';
import fs from 'node:fs';

const ledger=fs.readFileSync(new URL('../engine-run-ledger.js',import.meta.url),'utf8');

assert.match(ledger,/\['distribution:autonomous_cycle',\{minutes:60,anchorMinute:15\}\]/,'autonomous cycle must have one hourly owner window');
assert.match(ledger,/\['distribution:network_cycle',\{minutes:120,anchorMinute:15\}\]/,'network cycle must preserve the existing two-hour cadence');
assert.match(ledger,/\['growth:execution_contract',\{minutes:60,anchorMinute:15\}\]/,'execution contract must have one hourly owner window');
assert.match(ledger,/\['growth:opportunity_coordination',\{minutes:60,anchorMinute:15\}\]/,'opportunity coordination must have one hourly owner window');

assert.match(ledger,/PRIMARY KEY\(engine,mission,cycle_key\)/,'cycle claims must be unique per mission and cycle');
assert.match(ledger,/INSERT OR IGNORE INTO engine_cycle_claims/,'concurrent callers must race through a single atomic claim');
assert.match(ledger,/mission_cycle_completed/,'completed missions must suppress duplicate execution in the same cycle');
assert.match(ledger,/mission_cycle_owned/,'running missions must suppress concurrent duplicate execution');
assert.match(ledger,/status='failed' OR \(status='running' AND acquired_at<=datetime\('now', \?\)\)/,'failed or stale owners must remain recoverable');
assert.match(ledger,/CYCLE_STALE_TAKEOVER_MINUTES=30/,'stuck owners must be recoverable after a bounded grace period');

console.log('Mission cycle ownership: one execution per cycle with bounded recovery.');
