import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE = 'https://toolscout.luxurybuyerintelligence.workers.dev';
const intents = JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));
const pages = [];
for (const item of intents) {
  if (!item?.slug) continue;
  const title = item.title || String(item.slug).replace(/^best-/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const description = item.description || `Tool recommendations for ${title.toLowerCase()}.`;
  const url = `${BASE}/${encodeURIComponent(item.slug)}.html`;
  const short = description.length > 180 ? `${description.slice(0,177)}...` : description;
  pages.push({
    slug: item.slug,
    title,
    url,
    category: item.category || 'software',
    searchSnippet: `${title} — ${short}`,
    socialHook: `Need the right tool for ${title.toLowerCase()}? ToolScout compares options around the job, not generic rankings.`,
    redditStyle: `I put together a practical guide for ${title.toLowerCase()}, focused on fit rather than a generic top-ten list.`,
    newsletterSubject: `${title}: a practical shortlist`,
    newsletterIntro: `${short} See the shortlist and compare the options.`,
    hashtags: ['#software','#AITools','#productivity','#ToolScout']
  });
}
pages.sort((a,b)=>a.title.localeCompare(b.title));
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','distribution-queue.json'),JSON.stringify({generatedAt:new Date().toISOString(),count:pages.length,items:pages},null,2)+'\n');
console.log(JSON.stringify({queued:pages.length}));
