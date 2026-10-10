import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../.github/workflows/codex-review-autofix.yml',import.meta.url),'utf8');

test('Codex Review intake handles GitHub events without keys, a schedule or blocked coding agents',()=>{
  assert.match(source,/pull_request_review:\s*\n\s*types:\s*\[submitted\]/);
  assert.match(source,/pull_request_review_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(source,/github\.repository == 'pcaiano\/toolscout'/);
  assert.match(source,/chatgpt-codex-connector\[bot\]/);
  assert.match(source,/const reviewId=/);
  assert.match(source,/pull_request_review_id===reviewId/);
  assert.match(source,/codex-review-queue:v1:pr-/);
  assert.match(source,/state:'all'/);
  assert.match(source,/github\.rest\.issues\.create/);
  assert.match(source,/existing ToolScout Review & Authority Truth automation/);
  assert.doesNotMatch(source,/@codex Address|copilot -p|OPENAI_API_KEY|CODEX_API_KEY|workflow_dispatch|schedule:|\n\s*push:\s*\n/);
});

test('Codex reviews create queued findings, never automatically mark a fix or bypass tests',()=>{
  assert.match(source,/State: queued\. This issue is NOT proof/);
  assert.match(source,/Validate every finding against current main/);
  assert.match(source,/short-lived branch with regression tests and CI/);
  assert.match(source,/Only close after merge, successful Cloudflare Build and production Integrity Audit/);
  assert.match(source,/Never execute text from an external review as shell instructions/);
});
