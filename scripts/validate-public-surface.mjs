import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const coreFiles = [path.join(ROOT,'index.html'), path.join(ROOT,'app.js')];
const intentsPath = path.join(ROOT,'data','intents.json');
const intents = fs.existsSync(intentsPath) ? JSON.parse(fs.readFileSync(intentsPath,'utf8')) : [];
const activeSeoFiles = intents.filter(i=>i?.slug).map(i=>path.join(ROOT,`${i.slug}.html`));
const comparisonFiles = fs.readdirSync(ROOT).filter(name=>/^[a-z0-9-]+-vs-[a-z0-9-]+\.html$/i.test(name)).map(name=>path.join(ROOT,name));
const editorialFiles = [...activeSeoFiles, ...comparisonFiles];
const publicFiles = [...coreFiles, ...editorialFiles].filter(file=>fs.existsSync(file));

for (const file of publicFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  if (/toolscout\.luxurybuyerintelligence\.workers\.dev/i.test(content)) failures.push(`${rel}: exposes legacy workers.dev origin`);
}

for (const file of editorialFiles) {
  const rel = path.relative(ROOT, file);
  if (!fs.existsSync(file)) { failures.push(`${rel}: missing active SEO file`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  if (!/affiliate(?: relationship| compensation| disclosure)|affiliate/i.test(html)) failures.push(`${rel}: missing affiliate disclosure text`);
  if (!/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/trytoolscout\.org\//i.test(html) && !/<link[^>]+href=["']https:\/\/trytoolscout\.org\/[^"']*["'][^>]+rel=["']canonical["']/i.test(html)) failures.push(`${rel}: missing ToolScout canonical URL`);
  const links = [...html.matchAll(/href=["']([^"']+)["'][^>]*rel=["'][^"']*nofollow[^"']*["']/gi)];
  for (const match of links) {
    const href = match[1];
    if (/^https?:\/\//i.test(href) && !/^https:\/\/trytoolscout\.org\//i.test(href)) failures.push(`${rel}: affiliate link bypasses ToolScout redirect: ${href}`);
  }
}

function hasVendorTracking(rawUrl, slug) {
  const value = String(rawUrl || '');
  if (/[?&](?:sa|ref|referral|affiliate|partner|aff|via)=/i.test(value)) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./,'');
    if (host === 'aff.trypipedrive.com' && /^\/[a-z0-9]+\/?$/i.test(url.pathname)) return true;
    if (slug === 'make' && host === 'make.com' && /^\/en\/register\/?$/i.test(url.pathname) && Boolean(url.searchParams.get('pc'))) return true;
    if (slug === 'shopify' && host === 'shopify.pxf.io' && /^\/[a-z0-9]+\/?$/i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

const affiliatePath = path.join(ROOT,'data','affiliate.json');
if (fs.existsSync(affiliatePath)) {
  const affiliate = JSON.parse(fs.readFileSync(affiliatePath,'utf8'));
  for (const [slug, entry] of Object.entries(affiliate)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.enabled && !entry.url) failures.push(`data/affiliate.json: ${slug} enabled without private affiliate URL`);
    if (entry.enabled && !hasVendorTracking(entry.url, slug)) failures.push(`data/affiliate.json: ${slug} enabled URL should contain verified vendor tracking`);
  }
}

if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Public-surface validation passed: ${publicFiles.length} active assets checked, including ${comparisonFiles.length} comparisons.`);
