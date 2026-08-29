import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const intents = JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));

const clean = s => String(s || '').replace(/^best-/,'').replace(/-/g,' ').trim();
const titleCase = s => clean(s).replace(/\b\w/g,c=>c.toUpperCase());
const rows = intents.filter(x=>x?.slug).map(item=>({
  slug:item.slug,
  title:titleCase(item.slug),
  url:`https://toolscout.luxurybuyerintelligence.workers.dev/${item.slug}.html`,
  blogSlug:`${item.slug}-guide`,
  articleTitle:`${titleCase(item.slug)}: How to Choose the Right Tool`,
  metaDescription:`A practical ToolScout guide to choosing the right tool for ${clean(item.slug)}, with clear criteria, trade-offs and recommended options.`,
  angle:`What matters most when choosing software for ${clean(item.slug)} — and where common recommendations fall short.`,
  internalGuide:`/${item.slug}.html`
}));

const seen=new Set();
const unique=rows.filter(x=>{if(seen.has(x.slug))return false;seen.add(x.slug);return true;});
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','blog-topics.json'),JSON.stringify({generatedAt:new Date().toISOString(),count:unique.length,items:unique},null,2)+'\n');
console.log(JSON.stringify({topics:unique.length}));
