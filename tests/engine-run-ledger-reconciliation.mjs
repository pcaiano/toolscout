import fs from 'node:fs';
const s=fs.readFileSync('engine-run-ledger.js','utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
check(s.includes('async function reconcileStaleRunOwnership(env)'), 'stale ownership reconciler exists');
check(s.includes("UPDATE engine_cycle_claims"), 'stale cycle claims are reconciled');
check(s.includes("r.status='failed'"), 'failed run state drives claim reconciliation');
check(s.includes("DELETE FROM engine_run_leases WHERE expires_at<=datetime('now')"), 'expired leases are globally reaped');
check((s.match(/await reconcileStaleRunOwnership\(env\)/g)||[]).length>=2, 'reconciliation runs after global and single-flight reap');
if(failures.length){for(const f of failures)console.error('FAIL '+f);process.exit(1)}
console.log('PASS engine-run ownership reconciliation guards');
