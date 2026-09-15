import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const BASE='https://trytoolscout.org';
const FEED_URL=`${BASE}/feed.xml`;
const WEBSUB_HUB='https://pubsubhubbub.appspot.com/';
const RSS_QUERY='utm_source=toolscout_rss&utm_medium=distribution&utm_campaign=syndication';
const IGNORE=new Set(['404.html','admin.html','analytics.html','index.html','click.html','tool.html','compare.html','seo.html','guides.html']);
const ACRONYMS=new Map([['ai','AI'],['crm','CRM'],['seo','SEO'],['api','API'],['url','URL'],['saas','SaaS'],['roi','ROI']]);
const cleanPublic=v=>String(v??'').replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/gu,'-').replace(/\s+/g,' ').trim();
const esc=s=>cleanPublic(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const humanize=slug=>String(slug||'').replace(/^best-/,'').replace(/-/g,' ').trim().split(/\s+/).map(w=>ACRONYMS.get(w.toLowerCase())||w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
const intentLike=slug=>/^best-[a-z0-9-]+$/i.test(slug);
const comparisonLike=slug=>/^[a-z0-9-]+-vs-[a-z0-9-]+$/i.test(slug);
const alternativeLike=slug=>/^[a-z0-9-]+-alternatives$/i.test(slug);
const isIndexable=file=>{if(!fs.existsSync(file))return false;const html=fs.readFileSync(file,'utf8');return !/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)&&!/<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html);};
const metaFromHtml=(file,fallbackTitle)=>{const html=fs.readFileSync(file,'utf8');const title=(html.match(/<h1[^>]*>(.*?)<\/h1>/is)?.[1]||html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]||fallbackTitle).replace(/<[^>]+>/g,'').replace(/\s*\|\s*ToolScout.*$/i,'').trim();const description=(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]||html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1]||`ToolScout guide for ${String(fallbackTitle).toLowerCase()}.`).trim();return{title:cleanPublic(title),description:cleanPublic(description)};};
const tracked=url=>`${url}${url.includes('?')?'&':'?'}${RSS_QUERY}`;
const kindFor=slug=>comparisonLike(slug)?'comparison':alternativeLike(slug)?'alternatives':intentLike(slug)?'guide':slug==='software-trends-index'?'original_research':'editorial';
const fileDate=file=>{try{return fs.statSync(file).mtime.toUTCString();}catch{return new Date(0).toUTCString();}};

const longtailPath=path.join(ROOT,'data','seo-longtail.json');
const longtail=fs.existsSync(longtailPath)?JSON.parse(fs.readFileSync(longtailPath,'utf8')).intents||[]:[];
const known=new Map(longtail.map(x=>[x.slug,x]));
const rootFiles=fs.readdirSync(ROOT).filter(name=>name.endsWith('.html')).filter(name=>!IGNORE.has(name)).filter(name=>!/^google[0-9a-f]+\.html$/i.test(name)).filter(name=>{const slug=name.replace(/\.html$/,'');return intentLike(slug)||comparisonLike(slug)||alternativeLike(slug)||slug==='software-trends-index';}).filter(name=>isIndexable(path.join(ROOT,name))).sort();
const guideFiles=rootFiles.filter(name=>intentLike(name.replace(/\.html$/,'')));
const guideItems=guideFiles.map(file=>{const slug=file.replace(/\.html$/,'');const meta=known.get(slug);return{slug,title:meta?.title||humanize(slug),url:`${BASE}/${file}`,category:meta?.category||null,parent:meta?.parent||null};});
const rssItems=rootFiles.map(file=>{const slug=file.replace(/\.html$/,'');const full=path.join(ROOT,file);const meta=metaFromHtml(full,known.get(slug)?.title||humanize(slug));return{slug,url:`${BASE}/${file}`,kind:kindFor(slug),published:fileDate(full),...meta};});
const blogDir=path.join(ROOT,'blog');
if(fs.existsSync(blogDir))for(const file of fs.readdirSync(blogDir).filter(name=>name.endsWith('.html')&&name!=='index.html').filter(name=>isIndexable(path.join(blogDir,name))).sort()){const slug=file.replace(/\.html$/,'');const full=path.join(blogDir,file);const meta=metaFromHtml(full,humanize(slug));rssItems.push({slug:`blog/${slug}`,url:`${BASE}/blog/${file}`,kind:'editorial',published:fileDate(full),...meta});}
rssItems.sort((a,b)=>Date.parse(b.published)-Date.parse(a.published)||a.title.localeCompare(b.title));
const lastBuild=rssItems[0]?.published||new Date().toUTCString();
const feed=`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n<title>ToolScout Guides</title>\n<link>${BASE}/</link>\n<atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"/>\n<atom:link href="${WEBSUB_HUB}" rel="hub"/>\n<description>Independent software and AI tool recommendations, comparisons and research built around real buying jobs and constraints.</description>\n<language>en</language>\n<lastBuildDate>${esc(lastBuild)}</lastBuildDate>\n<ttl>60</ttl>\n${rssItems.slice(0,100).map(x=>`<item><title>${esc(x.title)} | ToolScout</title><link>${esc(tracked(x.url))}</link><guid isPermaLink="true">${esc(x.url)}</guid><pubDate>${esc(x.published)}</pubDate><category>${esc(x.kind)}</category><description>${esc(x.description)}</description></item>`).join('\n')}\n</channel>\n</rss>\n`;
fs.writeFileSync(path.join(ROOT,'feed.xml'),feed,'utf8');

const byCategory=new Map();for(const x of guideItems){const key=x.category||'other';if(!byCategory.has(key))byCategory.set(key,[]);byCategory.get(key).push(x);}
const cards=guideItems.map(x=>`<a class="card" href="./${x.slug}.html"><strong>${esc(x.title)}</strong><span>${x.parent?`Related to ${esc(humanize(x.parent))}`:'ToolScout guide'} →</span></a>`).join('');
const guides=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout Guides | Software recommendations by job</title><meta name="description" content="Browse ToolScout guides for choosing software and AI tools by job, workflow, budget and team."><link rel="canonical" href="${BASE}/guides.html"><link rel="alternate" type="application/rss+xml" title="ToolScout Guides RSS" href="${FEED_URL}"><meta name="robots" content="index,follow"><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#111827}.wrap{max-width:1000px;margin:auto;padding:28px 22px 72px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}.hero{padding:64px 0 30px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}.hero h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:14px 0}.hero p{font-size:18px;line-height:1.6;color:#667085;max-width:700px}.nav{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}.nav a{background:#fff;border:1px solid #e4e7ec;padding:9px 12px;border-radius:999px;text-decoration:none;color:#344054;font-size:13px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{display:flex;justify-content:space-between;gap:16px;align-items:center;background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:18px;text-decoration:none;color:#111827}.card strong{font-size:16px}.card span{font-size:12px;color:#667085;white-space:nowrap}@media(max-width:700px){.grid{grid-template-columns:1fr}.card{align-items:flex-start;flex-direction:column}}</style></head><body><div class="wrap"><a class="brand" href="./">ToolScout</a><main class="hero"><div class="eyebrow">Browse the library</div><h1>Guides built around the job.</h1><p>Explore software and AI recommendations based on practical needs, not generic rankings.</p></main><nav class="nav"><a href="/categories.html">All categories</a>${[...byCategory.keys()].filter(k=>k!=='other').map(k=>`<a href="/${esc(k)}-tools.html">${esc(k)}</a>`).join('')}</nav><section class="grid">${cards||'<p>No guides yet.</p>'}</section></div></body></html>\n`;
fs.writeFileSync(path.join(ROOT,'guides.html'),guides,'utf8');
console.log(JSON.stringify({guides:guideItems.length,rssItems:rssItems.length,categories:byCategory.size,feed:FEED_URL,websubHub:WEBSUB_HUB,tracking:{utm_source:'toolscout_rss',utm_medium:'distribution',utm_campaign:'syndication'}}));
