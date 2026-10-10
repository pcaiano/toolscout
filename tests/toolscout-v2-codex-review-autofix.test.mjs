import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../.github/workflows/codex-review-autofix.yml',import.meta.url),'utf8');
test('Codex Review handoff is event-driven, authenticated and free of new AI API secrets',()=>{
  assert.match(source,/pull_request_review:\s*\n\s*types:\s*\[submitted\]/);
  assert.match(source,/pull_request_review_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(source,/github\.repository == 'pcaiano\/toolscout'/);
  assert.match(source,/chatgpt-codex-connector\[bot\]/);
  assert.match(source,/reviewId/);
  assert.match(source,/toolscout-codex-auto-fix:pr-/);
  assert.match(source,/pr\.merged_at\|\|pr\.state==='closed'/);
  assert.match(source,/if\(handoffs\.length>=5\)/);
  assert.match(source,/@codex Address these Codex Review findings automatically/);
  assert.doesNotMatch(source,/OPENAI_API_KEY|CODEX_API_KEY|workflow_dispatch|schedule:/);
});
