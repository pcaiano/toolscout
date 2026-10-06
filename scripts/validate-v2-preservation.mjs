import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const BASE=process.env.TOOLSCOUT_V2_BASE_REF||'origin/main';
const readCurrent=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const readBase=file=>{try{return git('show',`${BASE}:${file}`)}catch{return null}};
const listBase=()=>git('ls-tree','-r','--name-only',BASE).split(/\r?\n/).filter(Boolean);
const canonical=html=>String(html||'').match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]||String(html||'').match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]||null;
const canonicalIdentity=value=>{try{const u=new URL(String(value||''));let p=u.pathname||'/';if(p==='/index.html')p='/';else if(/\.html$/i.test(p))p=p.replace(/\.html$/i,'');if(p.length>1)p=p.replace(/\/+$/,'');return u.origin+p}catch{return String(value||'').replace(/\.html$/i,'').replace(/\/+$/,'')}};
const sitemapUrls=xml=>new Set([...String(xml||'').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim()).filter(Boolean));

const errors=[],warnings=[];

// 1. Never remove existing sitemap URLs during the 2.0 migration.
const baseSitemap=sitemapUrls(readBase('sitemap.xml'));
const currentSitemap=sitemapUrls(readCurrent('sitemap.xml'));
for(const url of baseSitemap)if(!currentSitemap.has(url))errors.push({code:'sitemap_url_removed',url});

// 2. Never delete an existing public HTML page or silently change its canonical.
const baseFiles=listBase().filter(file=>file.endsWith('.html')&&!file.startsWith('node_modules/'));
for(const file of baseFiles){
  const before=readBase(file);
  if(before===null)continue;
  const after=readCurrent(file);
  if(after===null){errors.push({code:'public_html_removed',file});continue;}
  const beforeCanonical=canonical(before),afterCanonical=canonical(after);
  if(beforeCanonical&&canonicalIdentity(afterCanonical)!==canonicalIdentity(beforeCanonical))errors.push({code:'canonical_changed',file,before:beforeCanonical,after:afterCanonical});
}

// 3. Preserve active affiliate routes and destinations.
const parseJson=text=>{try{return JSON.parse(text||'{}')}catch{return{}}};
const beforeAffiliate=parseJson(readBase('data/affiliate.json'));
const afterAffiliate=parseJson(readCurrent('data/affiliate.json'));
for(const [slug,row] of Object.entries(beforeAffiliate||{})){
  if(!row?.enabled||!row?.url)continue;
  const next=afterAffiliate?.[slug];
  if(!next?.enabled||!next?.url)errors.push({code:'active_affiliate_route_removed',slug});
  else if(String(next.url)!==String(row.url))warnings.push({code:'affiliate_destination_changed',slug,before:row.url,after:next.url});
}

// 4. Existing sitemap/robots files must remain present.
for(const file of ['sitemap.xml','robots.txt']){
  if(readBase(file)!==null&&readCurrent(file)===null)errors.push({code:'public_discovery_file_removed',file});
}

const report={
  generatedAt:new Date().toISOString(),
  base:BASE,
  policy:'toolscout-2.0-preservation-v1',
  checked:{sitemapUrls:baseSitemap.size,publicHtmlFiles:baseFiles.length,activeAffiliateRoutes:Object.values(beforeAffiliate||{}).filter(x=>x?.enabled&&x?.url).length},
  errors,warnings
};
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/toolscout-v2-preservation-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:errors.length===0,...report.checked,errors:errors.slice(0,20),warnings:warnings.slice(0,20)},null,2));
if(errors.length)process.exitCode=1;
