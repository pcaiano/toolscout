import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const publicFiles = fs.readdirSync(ROOT, {withFileTypes:true})
  .filter(entry => entry.isFile() && (/\.html$/i.test(entry.name) || /\.js$/i.test(entry.name)))
  .map(entry => path.join(ROOT, entry.name));
const nested = [path.join(ROOT,'blog')];
for (const dir of nested) {
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      if (entry.isFile() && /\.html$/i.test(entry.name)) publicFiles.push(path.join(dir, entry.name));
    }
  }
}

for (const file of publicFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  if (/toolscout\.luxurybuyerintelligence\.workers\.dev/i.test(html)) {
    failures.push(`${rel}: exposes legacy workers.dev origin`);
  }
  if (/\.html$/i.test(file) && /best-[a-z0-9-]+\.html$/i.test(path.basename(file))) {
    if (!/affiliate disclosure|affiliate compensation|affiliate/i.test(html)) failures.push(`${rel}: missing affiliate disclosure text`);
    for (const match of html.matchAll(/href=["']([^"']+)["'][^>]*rel=["'][^"']*nofollow[^"']*["']/gi)) {
      const href = match[1];
      if (/^https?:\/\//i.test(href) && !/^https:\/\/trytoolscout\.org\//i.test(href)) {
        failures.push(`${rel}: affiliate link bypasses ToolScout redirect: ${href}`);
      }
    }
  }
}

const affiliatePath = path.join(ROOT,'data','affiliate.json');
if (fs.existsSync(affiliatePath)) {
  const affiliate = JSON.parse(fs.readFileSync(affiliatePath,'utf8'));
  for (const [slug, entry] of Object.entries(affiliate)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.enabled && !entry.url) failures.push(`data/affiliate.json: ${slug} enabled without private affiliate URL`);
    if (entry.enabled && /[?&](?:ref|referral|affiliate|partner|aff)=/i.test(String(entry.url||'')) === false) {
      failures.push(`data/affiliate.json: ${slug} enabled URL should contain a vendor tracking parameter`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Public-surface validation passed: ${publicFiles.length} assets checked.`);
