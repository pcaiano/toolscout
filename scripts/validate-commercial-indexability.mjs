import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd(),BASE='https://trytoolscout.org';
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const intents=JSON.parse(fs.readFileSync(path.join(ROOT,'data','intents.json'),'utf8'));
const pairs=JSON.parse(fs.readFileSync(path.join(ROOT,'data','comparisons.json'),'utf8'));
const sitemap=fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8');
const errors=[];
const check=(ok,message)=>{if(!ok)errors.push(message)};
const intentSlugs=new Set(intents.map(intent=>intent?.slug).filter(Boolean));
const hasGuideLink=html=>[...html.matchAll(/href=["']\/([a-z0-9-]+)\.html["']/gi)].some(match=>intentSlugs.has(match[1]));

for(const tool of tools){
  const rel=`tools/${tool.slug}.html`,file=path.join(ROOT,rel);
  check(fs.existsSync(file),`${rel}: missing profile`);
  if(!fs.existsSync(file))continue;
  const html=fs.readFileSync(file,'utf8'),canonical=`${BASE}/${rel}`;
  check(html.includes(`<link rel="canonical" href="${canonical}">`),`${rel}: bad canonical`);
  check(html.includes('<h1>'),`${rel}: missing H1`);
  check(html.includes('BreadcrumbList'),`${rel}: missing breadcrumb schema`);
  check(html.includes('FAQPage'),`${rel}: missing FAQ schema`);
  check(html.includes(`/go/${tool.slug}`),`${rel}: missing tracked CTA`);
  check(hasGuideLink(html),`${rel}: missing guide links`);
  check(sitemap.includes(`<loc>${canonical}</loc>`),`${rel}: absent from sitemap`);
}
for(const intent of intents){const html=fs.readFileSync(path.join(ROOT,`${intent.slug}.html`),'utf8');check(html.includes('/tools/'),`${intent.slug}.html: no tool-profile link`);}
for(const [a,b] of pairs){const rel=`${a}-vs-${b}.html`,html=fs.readFileSync(path.join(ROOT,rel),'utf8');check(html.includes(`/tools/${a}.html`)&&html.includes(`/tools/${b}.html`),`${rel}: comparison/profile links incomplete`);}
for(const file of ['tools.html','compare.html']){const html=fs.readFileSync(path.join(ROOT,file),'utf8');check(!html.includes('tool.html?tool=${encodeURIComponent(t.slug)}'),`${file}: still emits query-string profiles`);}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`Commercial indexability passed: ${tools.length} profiles, ${intents.length} guides and ${pairs.length} comparisons.`);
