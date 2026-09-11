import { readFileSync } from 'node:fs';

const submission = readFileSync('distribution-submission-worker.js', 'utf8');
const throughput = readFileSync('distribution-throughput-worker.js', 'utf8');

function requireText(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function rejectText(source, needle, message) {
  if (source.includes(needle)) throw new Error(message);
}

requireText(
  submission,
  "surface_slug<>'indexnow'",
  'Generic submission execution must exclude IndexNow.'
);
requireText(
  submission,
  "indexNowOwner:'adaptive_throughput'",
  'Generic submission execution must declare adaptive throughput as the IndexNow owner.'
);
requireText(
  throughput,
  'async function adaptiveIndexNow(env)',
  'Adaptive IndexNow delivery function is missing.'
);
requireText(
  throughput,
  "if(active){await prepackage(env,ctx);await adaptiveIndexNow(env);}",
  'Scheduled throughput cycle must invoke adaptive IndexNow delivery.'
);
requireText(
  throughput,
  "retry_after_at:retryAt",
  'IndexNow retry scheduling must persist retry_after_at in delivery state.'
);
requireText(
  throughput,
  ".bind(attemptedAt,is429?'retryable:indexnow_429'",
  'Retryable IndexNow failures must record the actual network attempt time.'
);
rejectText(
  throughput,
  ".bind(retryAt,is429?'retryable:indexnow_429'",
  'retryAt must never be written into last_attempt_at.'
);
rejectText(
  throughput,
  "retryable:indexnow_rate_limited',last_attempt_at",
  'A lock-only deferment must not fabricate a network attempt timestamp.'
);
requireText(
  throughput,
  '.bind(attemptedAt,res.url||adapter.endpoint,row.submission_id)',
  'Successful IndexNow delivery must record the actual network attempt time.'
);
requireText(
  throughput,
  '.bind(attemptedAt,`terminal:HTTP ${status}`,row.submission_id)',
  'Terminal IndexNow delivery must record the actual network attempt time.'
);

console.log('IndexNow ownership and timestamp invariants passed.');
