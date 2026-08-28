import fs from 'node:fs';

const file = 'data/tools.json';
const tools = JSON.parse(fs.readFileSync(file, 'utf8'));
const required = ['slug','name','category','description','pricing','features','bestFor','sourceUrl','lastVerified'];
const slugs = new Set();
let errors = 0;

if (!Array.isArray(tools) || tools.length === 0) {
  console.error('Tool database is empty or invalid.');
  process.exit(1);
}

for (const [i, tool] of tools.entries()) {
  for (const key of required) {
    if (tool[key] === undefined || tool[key] === null || tool[key] === '') {
      console.error(`Tool ${i + 1}: missing ${key}`); errors++;
    }
  }
  if (slugs.has(tool.slug)) { console.error(`Duplicate slug: ${tool.slug}`); errors++; }
  slugs.add(tool.slug);
  if (!/^https?:\/\//.test(tool.sourceUrl)) { console.error(`${tool.slug}: invalid sourceUrl`); errors++; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tool.lastVerified)) { console.error(`${tool.slug}: invalid lastVerified`); errors++; }
  if (!Array.isArray(tool.features) || !tool.features.length) { console.error(`${tool.slug}: features must be a non-empty array`); errors++; }
  if (!Array.isArray(tool.bestFor) || !tool.bestFor.length) { console.error(`${tool.slug}: bestFor must be a non-empty array`); errors++; }
}

if (errors) process.exit(1);
console.log(`ToolScout data OK: ${tools.length} tools validated.`);
