import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://toolscout.luxurybuyerintelligence.workers.dev';
const EXCLUDE=/^(404|admin|analytics|click|google[0-9a-f]+|seo|tool|tools|compare)\.html$/i;
const intentSlugs=new Set(JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8')).map(x=>x?.slug).filter(Boolean));
const urls=[BASE+'/',`${BASE}/guides.html`,`${BASE}/blog/`,`${BASE}/feed.xml`,`${BASE}/llms.txt`];
const files=fs.readdirSync(ROOT).filter(name=>name.endsWith('.html')).filter(name=>!EXCLUDE.test(name)).filter(name=>name!=='index.html').filter(name=>intentSlugs.has(name.replace(/\.html$/i,''))).sort();
for(const file of files)urls.push(`${BASE}/${file}`);
const blogDir=path.join(ROOT,'blog');
if(fs.existsSync(blogDir)){
  for(const file of fs.readdirSync(blogDir).filter(name=>name.endsWith('.html')).sort()){
    urls.push(`${BASE}/blog/${file}`);
  }
}
const unique=[...new Set(urls)];
const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(u=>`  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT,'sitemap.xml'),xml,'utf8');
console.log(JSON.stringify({urls:unique.length,intentPages:files.length,blogPages:fs.existsSync(blogDir)?fs.readdirSync(blogDir).filter(x=>x.endsWith('.html')).length:0}));
