import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=fs.readFileSync(new URL('../.codex/config.toml',import.meta.url),'utf8');
const agents=fs.readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');

test('Chrome DevTools MCP is mandatory for ToolScout Codex sessions',()=>{
  const block=config.match(/\[mcp_servers\.chrome-devtools\][\s\S]*?(?=\n\[|$)/)?.[0]||'';
  assert.match(block,/chrome-devtools-mcp@1\.10\.1/);
  assert.match(block,/--headless=true/);
  assert.match(block,/--isolated=true/);
  assert.match(block,/startup_timeout_ms\s*=\s*20_000/);
  assert.match(block,/tool_timeout_sec\s*=\s*120/);
  assert.match(block,/required\s*=\s*true/);
});

test('UI work cannot silently skip Chrome DevTools verification',()=>{
  assert.match(agents,/use the Chrome DevTools MCP server to verify the affected experience/i);
  assert.match(agents,/do not silently skip the check/i);
});
