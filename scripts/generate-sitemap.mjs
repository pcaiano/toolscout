import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://toolscout.luxurybuyerintelligence.workers.dev';
const IGNORE = new Set(['404.html']);

const files = fs.readdirSync(ROOT)
  .filter(name => name.endsWith('.html') && !IGNORE.has(name))
  .filter(name => !name.startsWith('admin') && !name.startsWith('analytics'))
  .sort();

const urls = [BASE + '/'];
for (const file of files) {
  if (file === 'index.html') continue;
  urls.push(`${BASE}/${file}`);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log(JSON.stringify({ urls: urls.length }));
