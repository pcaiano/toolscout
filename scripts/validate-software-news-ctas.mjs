import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const newsDir = path.join(ROOT, 'news');
const failures = [];

if (!fs.existsSync(newsDir)) {
  console.error('news/: software news directory is missing');
  process.exit(1);
}

const newsFiles = fs.readdirSync(newsDir)
  .filter(name => name.endsWith('.html'))
  .map(name => path.join(newsDir, name));

for (const file of newsFiles) {
  const rel = path.relative(ROOT, file).replaceAll('\\', '/');
  const html = fs.readFileSync(file, 'utf8');
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(match => match[1]);

  const profileLinks = hrefs
    .map(href => href.match(/^\/tools\/([a-z0-9-]+)\.html(?:[?#].*)?$/i))
    .filter(Boolean);

  const outboundLinks = hrefs
    .map(href => {
      const match = href.match(/^\/go\/([a-z0-9-]+)\?(.+)$/i);
      if (!match) return null;
      const params = new URLSearchParams(match[2]);
      return params.get('source') === 'software-news' ? match : null;
    })
    .filter(Boolean);

  if (profileLinks.length === 0) {
    failures.push(`${rel}: missing ToolScout tool profile CTA (/tools/<slug>.html)`);
  }

  if (outboundLinks.length === 0) {
    failures.push(`${rel}: missing vendor CTA (/go/<slug>?source=software-news)`);
  }

  if (profileLinks.length > 0 && outboundLinks.length > 0) {
    const profileSlugs = new Set(profileLinks.map(match => match[1].toLowerCase()));
    const matchingOutbound = outboundLinks.some(match => profileSlugs.has(match[1].toLowerCase()));
    if (!matchingOutbound) {
      failures.push(`${rel}: ToolScout profile CTA and vendor CTA point to different tools`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Software-news CTA validation passed: ${newsFiles.length} article(s) checked.`);
