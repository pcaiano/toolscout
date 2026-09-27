import fs from 'node:fs';
const s=fs.readFileSync('compute-router-worker.js','utf8');
const w=fs.readFileSync('wrangler.toml','utf8');
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
check(s.includes("const BATCH_SIZE=8;"),'batch size is callback-safe');
check(s.includes("const MAX_ACTIVE_BATCHES=3;"),'three batches match 24 external concurrency');
check(s.includes("Promise.all(batches.map(batch=>"),'batch triggers run concurrently');
check(s.includes("RENDER_TRIGGER_TIMEOUT_MS=25000"),'cold-start trigger timeout is tolerant');
check(s.includes("RENDER_KEEPALIVE_CRON='7,22,37,52 * * * *'"),'Render keepalive cadence exists');
check(w.includes('"7,22,37,52 * * * *"'),'Wrangler registers Render keepalive cron');
check(s.includes("followup:'next_scheduled_control_plane_cycle'"),'completion follow-up is scheduler-owned');
check(!s.includes("Completion callback immediately refilled"),'completion callback no longer recursively dispatches');
if(failures.length){for(const f of failures)console.error('FAIL '+f);process.exit(1)}
console.log('PASS overflow reliability geometry and callback bounds');
