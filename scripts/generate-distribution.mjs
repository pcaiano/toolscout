import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://toolscout.luxurybuyerintelligence.workers.dev';
const files=fs.readdirSync(ROOT)
  .filter(name=>name.endsWith('.html'))
  .filter(name=>!['404.html','admin.html','analytics.html','index.html'].includes(name))
  .filter(name=>!name.startsWith('tools'))
  .sort();

const items=files.map(file=>{
  const slug=file.replace(/\.html$/,'');
  const title=slug.replace(/^best-/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return {slug,title,url:`${BASE}/${file}`};
});

const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');

const feed=`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>ToolScout Guides</title><link>${BASE}/</link><description>Software and AI tool recommendations built around real jobs and needs.</description>${items.slice(0,100).map(x=>`<item><title>${esc(x.title)} — ToolScout</title><link>${x.url}</link><guid>${x.url}</guid><description>ToolScout guide for ${esc(x.title.toLowerCase())}.</description></item>`).join('')}</channel></rss>\n`;
fs.writeFileSync(path.join(ROOT,'feed.xml'),feed,'utf8');

const cards=items.map(x=>`<a class="card" href="./${x.slug}.html"><strong>${esc(x.title)}</strong><span>ToolScout guide →</span></a>`).join('');
const guides=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout Guides — Software recommendations by job</title><meta name="description" content="Browse ToolScout guides for choosing software and AI tools by job, workflow, budget and team."><link rel="canonical" href="${BASE}/guides.html"><meta name="robots" content="index,follow"><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#111827}.wrap{max-width:1000px;margin:auto;padding:28px 22px 72px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}.hero{padding:64px 0 30px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}.hero h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:14px 0}.hero p{font-size:18px;line-height:1.6;color:#667085;max-width:700px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{display:flex;justify-content:space-between;gap:16px;align-items:center;background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:18px;text-decoration:none;color:#111827}.card strong{font-size:16px}.card span{font-size:12px;color:#667085;white-space:nowrap}@media(max-width:700px){.grid{grid-template-columns:1fr}.card{align-items:flex-start;flex-direction:column}}</style></head><body><div class="wrap"><a class="brand" href="./">ToolScout</a><main class="hero"><div class="eyebrow">Browse the library</div><h1>Guides built around the job.</h1><p>Explore software and AI recommendations based on practical needs, not generic rankings.</p></main><section class="grid">${cards||'<p>No guides yet.</p>'}</section></div></body></html>\n`;
fs.writeFileSync(path.join(ROOT,'guides.html'),guides,'utf8');
console.log(JSON.stringify({guides:items.length}));
