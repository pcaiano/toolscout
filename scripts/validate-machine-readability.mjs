import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const comparisons=JSON.parse(fs.readFileSync(path.join(ROOT,'data','comparisons.json'),'utf8'));
const failures=[],warnings=[]; let checked=0;
const test=(file,name,re)=>{if(!re.test(file)) failures.push(name)};
for(const tool of tools){const p=path.join(ROOT,'tools',`${tool.slug}.html`);if(!fs.existsSync(p)){failures.push(`missing tool profile: ${tool.slug}`);continue;}const h=fs.readFileSync(p,'utf8');checked++;test(h,`${tool.slug}: canonical`,/rel=["']canonical["']/i);test(h,`${tool.slug}: JSON-LD`,/application\/ld\+json/i);test(h,`${tool.slug}: SoftwareApplication`,/SoftwareApplication/i);test(h,`${tool.slug}: breadcrumbs`,/BreadcrumbList/i);test(h,`${tool.slug}: explicit best-for`,/>Best for</i);test(h,`${tool.slug}: freshness`,/last verified/i);}
for(const pair of comparisons){const slug=Array.isArray(pair)?pair.join('-vs-'):pair.slug;const p=path.join(ROOT,`${slug}.html`);if(!fs.existsSync(p)){warnings.push(`missing comparison: ${slug}`);continue;}const h=fs.readFileSync(p,'utf8');checked++;test(h,`${slug}: canonical`,/rel=["']canonical["']/i);test(h,`${slug}: JSON-LD`,/application\/ld\+json/i);test(h,`${slug}: entities`,/SoftwareApplication/i);test(h,`${slug}: decision answer`,/Choose .* if/i);test(h,`${slug}: methodology`,/How this comparison works/i);}
for(const required of ['robots.txt','sitemap.xml','llms.txt']) if(!fs.existsSync(path.join(ROOT,required))) failures.push(`missing ${required}`);
const robots=fs.readFileSync(path.join(ROOT,'robots.txt'),'utf8');if(!/Sitemap:\s*https:\/\/trytoolscout\.org\/sitemap\.xml/i.test(robots)) failures.push('robots: canonical sitemap missing');
const llms=fs.readFileSync(path.join(ROOT,'llms.txt'),'utf8');for(const term of ['recommendation engine','guides.html','tools.html','compare.html','sitemap.xml']) if(!llms.includes(term)) failures.push(`llms.txt: missing ${term}`);
const result={checked,failures:failures.length,warnings:warnings.length,methodology:'Machine-readability gate verifies crawlable canonical entities, explicit decision semantics, structured data, breadcrumbs, freshness/trust signals and discovery surfaces. It does not claim rankings or AI citations.',failureDetails:failures,warningDetails:warnings};fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/machine-readability.json',JSON.stringify({generatedAt:new Date().toISOString(),...result},null,2)+'\n');console.log(JSON.stringify(result,null,2));if(failures.length)process.exit(1);
