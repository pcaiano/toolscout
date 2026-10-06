import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const failures=[];
const warnings=[];
const counts={guides:0,profiles:0,comparisons:0,news:0,machine:0};

const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const exists=file=>fs.existsSync(path.join(ROOT,file));
const isNoindex=html=>/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)||/<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html);
const has=(html,re)=>re.test(html);
const check=(ok,message)=>{if(!ok)failures.push(message);};
const common=(rel,html)=>{
  check(!isNoindex(html),`${rel}: unexpectedly noindex`);
  check(has(html,/<title>[^<]{8,}<\/title>/i),`${rel}: missing title`);
  check(has(html,/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{35,}["']/i)||has(html,/<meta[^>]+content=["'][^"']{35,}["'][^>]+name=["']description["']/i),`${rel}: missing useful meta description`);
  check(has(html,/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/trytoolscout\.org\//i)||has(html,/<link[^>]+href=["']https:\/\/trytoolscout\.org\//i),`${rel}: missing ToolScout canonical`);
  check(has(html,/<h1\b[^>]*>[\s\S]*?<\/h1>/i),`${rel}: missing H1`);
  check(has(html,/application\/ld\+json/i),`${rel}: missing structured data`);
};

const rootFiles=fs.readdirSync(ROOT).filter(x=>x.endsWith('.html'));
for(const file of rootFiles.filter(x=>/^best-[a-z0-9-]+\.html$/i.test(x)).sort()){
  const html=read(file);if(isNoindex(html))continue;counts.guides++;common(file,html);
  check(has(html,/<p class=["']lead["']>[^<]{40,}/i),`${file}: missing answer-first lead`);
  check(has(html,/data-toolscout-analysis=["']1["']/i),`${file}: missing ToolScout analysis`);
  check(has(html,/How does ToolScout choose these tools\?|methodology|Affiliate relationships do not change/i),`${file}: missing methodology or independence context`);
}

const toolDir=path.join(ROOT,'tools');
if(fs.existsSync(toolDir))for(const file of fs.readdirSync(toolDir).filter(x=>x.endsWith('.html')).sort()){
  const rel=`tools/${file}`,html=fs.readFileSync(path.join(toolDir,file),'utf8');if(isNoindex(html))continue;counts.profiles++;common(rel,html);
  check(has(html,/SoftwareApplication/i),`${rel}: missing SoftwareApplication schema`);
  check(has(html,/BreadcrumbList/i),`${rel}: missing breadcrumb schema`);
  check(has(html,/FAQPage/i),`${rel}: missing FAQ schema`);
  check(has(html,/ToolScout view/i),`${rel}: missing editorial point of view`);
  check(has(html,/Source data last (?:checked|verified)\s+20\d{2}-\d{2}-\d{2}/i),`${rel}: missing explicit freshness date`);
}

for(const file of rootFiles.filter(x=>/^[a-z0-9-]+-vs-[a-z0-9-]+\.html$/i.test(x)).sort()){
  const html=read(file);if(isNoindex(html))continue;counts.comparisons++;common(file,html);
  check(has(html,/SoftwareApplication/i),`${file}: missing compared entities in schema`);
  check(has(html,/ToolScout analysis/i),`${file}: missing analysis`);
  check(has(html,/Decision:/i),`${file}: missing direct decision guidance`);
  check(has(html,/How this comparison works/i),`${file}: missing comparison methodology`);
  check(has(html,/workflow fit|not a universal product claim/i),`${file}: missing decision caveat`);
}

const newsDir=path.join(ROOT,'news');
if(fs.existsSync(newsDir))for(const file of fs.readdirSync(newsDir).filter(x=>x.endsWith('.html')).sort()){
  const rel=`news/${file}`,html=fs.readFileSync(path.join(newsDir,file),'utf8');if(isNoindex(html))continue;counts.news++;common(rel,html);
  check(has(html,/NewsArticle/i),`${rel}: missing NewsArticle schema`);
  check(has(html,/<p class=["']lead["']>[^<]{40,}/i),`${rel}: missing news lead`);
  check(has(html,/<h2>What changed<\/h2>/i),`${rel}: missing What changed answer`);
  check(has(html,/<h2>Why it matters(?: for buyers)?<\/h2>/i),`${rel}: missing buyer relevance answer`);
  check(has(html,/<h2>Buyer takeaway<\/h2>/i),`${rel}: missing buyer takeaway`);
  check(has(html,/Primary source:/i),`${rel}: missing primary-source trust signal`);
  check(has(html,/Affiliate relationships do not determine coverage/i),`${rel}: missing editorial independence signal`);
}

for(const required of ['llms.txt','robots.txt','sitemap.xml']){
  counts.machine++;
  check(exists(required),`site surface: missing ${required}`);
}
if(exists('robots.txt'))check(/Sitemap:\s*https:\/\/trytoolscout\.org\/sitemap\.xml/i.test(read('robots.txt')),'robots.txt: missing canonical sitemap declaration');
if(exists('llms.txt')){
  const llms=read('llms.txt');
  for(const term of ['recommendation engine','guides.html','tools.html','compare.html','sitemap.xml'])check(llms.includes(term),`llms.txt: missing ${term}`);
}

const checked=counts.guides+counts.profiles+counts.comparisons+counts.news;
const result={
  checked,
  counts,
  failures:failures.length,
  warnings:warnings.length,
  methodology:'Site-wide SEO/AEO/GEO readiness gate for indexable ToolScout guides, tool profiles, comparisons and software news. It checks crawlability, canonical metadata, structured entities, answer-first decision content, explicit editorial analysis, freshness, primary-source or methodology signals and machine discovery surfaces. It does not claim or measure ranking, AI citations or inclusion in any specific answer engine.',
  failureDetails:failures,
  warningDetails:warnings
};
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','aeo-geo-readiness.json'),JSON.stringify({generatedAt:new Date().toISOString(),...result},null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exit(1);
