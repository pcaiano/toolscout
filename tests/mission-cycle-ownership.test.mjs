import assert from 'node:assert/strict';
import fs from 'node:fs';

const ledger=fs.readFileSync(new URL('../engine-run-ledger.js',import.meta.url),'utf8');
const autonomous=fs.readFileSync(new URL('../distribution-autonomous-worker.js',import.meta.url),'utf8');
const network=fs.readFileSync(new URL('../distribution-network-worker.js',import.meta.url),'utf8');
const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const commandCenter=fs.readFileSync(new URL('../command-center-light-theme-worker.js',import.meta.url),'utf8');
const humanActions=fs.readFileSync(new URL('../human-action-entry-worker.js',import.meta.url),'utf8');

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
assert.match(ledger,/runWithLedger\(env,\{engine,mission,triggerName=null,singleFlightMinutes=0,cycleContext=null,cycleOwner=null\}/,'cycle ownership must be opt-in, so event-driven work is never throttled accidentally');

assert.match(autonomous,/missionCycleContextFromRequest\(request,'distribution','autonomous_cycle'\)/,'scheduled autonomous internal calls must join the shared cycle');
assert.match(network,/missionCycleContextFromRequest\(request,'distribution','network_cycle'\)/,'scheduled network internal calls must join the shared cycle');
assert.match(orchestrator,/missionCycleContextFromRequest\(request,'growth','execution_contract'\)/,'scheduled execution dispatch must join the shared cycle');
assert.match(orchestrator,/missionCycleContextFromRequest\(request,'growth','opportunity_coordination'\)/,'scheduled opportunity coordination must join the shared cycle');
assert.match(commandCenter,/cycleOwner:'command_center_scheduler'/,'direct scheduled distribution calls must claim an explicit owner');
assert.match(humanActions,/new URL\('\/api\/distribution\/autonomous\/refresh',request\.url\)/,'human-gate completion must still trigger immediate autonomous verification');
assert.doesNotMatch(humanActions,/missionCycleHeaders/,'human-gate auto-resume must remain outside scheduled cycle ownership');

console.log('Mission cycle ownership: one execution per cycle with bounded recovery.');
