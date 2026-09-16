import fs from 'node:fs';
import path from 'node:path';
import { loadSeoIntents } from './seo-intent-loader.mjs';

const ROOT=process.cwd(),failures=[];
const intents=loadSeoIntents(ROOT);
const holdsPath=path.join(ROOT,'reports','seo-publication-holds.json'),holds=fs.existsSync(holdsPath)?JSON.parse(fs.readFileSync(holdsPath,'utf8')):{items:[]},heldSlugs=new Set((holds.items||[]).map(x=>x.intent));
const toolHoldsPath=path.join(ROOT,'reports','tool-profile-holds.json'),toolHolds=fs.existsSync(toolHoldsPath)?JSON.parse(fs.readFileSync(toolHoldsPath,'utf8')):{items:[]},heldTools=new Set((toolHolds.items||[]).map(x=>x.slug).filter(Boolean));
const guideFiles=intents.filter(i=>i?.slug&&!heldSlugs.has(i.slug)).map(i=>path.join(ROOT,`${i.slug}.html`));
const comparisonFiles=fs.readdirSync(ROOT).filter(name=>/^[a-z0-9-]+-vs-[a-z0-9-]+\.html$/i.test(name)).map(name=>path.join(ROOT,name));
const toolDir=path.join(ROOT,'tools'),toolFiles=fs.existsSync(toolDir)?fs.readdirSync(toolDir).filter(name=>name.endsWith('.html')).map(name=>path.join(toolDir,name)):[];
const blogDir=path.join(ROOT,'blog'),blogFiles=fs.existsSync(blogDir)?fs.readdirSync(blogDir).filter(name=>name.endsWith('.html')).map(name=>path.join(blogDir,name)):[];
const editorialFiles=[...guideFiles,...comparisonFiles,...toolFiles,...blogFiles];
const isNoindex=html=>/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)||/<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html);
const canonicalOf=html=>html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]||html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]||null;
const sitemap=fs.existsSync(path.join(ROOT,'sitemap.xml'))?fs.readFileSync(path.join(ROOT,'sitemap.xml'),'utf8'):'';

for(const slug of heldSlugs)if(fs.existsSync(path.join(ROOT,`${slug}.html`)))failures.push(`${slug}.html: held intent is still public`);
for(const slug of heldTools)if(fs.existsSync(path.join(toolDir,`${slug}.html`)))failures.push(`tools/${slug}.html: held tool profile is still public`);

function localHtmlTarget(file, href) {
  const raw=String(href||'').trim();
  if(!raw||raw.startsWith('#')||/^https?:\/\//i.test(raw)||raw.startsWith('mailto:')||raw.startsWith('tel:')||raw.startsWith('//'))return null;
  const clean=raw.split('#')[0].split('?')[0];
  if(!clean.toLowerCase().endsWith('.html'))return null;
  if(clean.startsWith('/'))return path.join(ROOT,clean.replace(/^\/+/,''));
  return path.resolve(path.dirname(file),clean);
}

for(const file of editorialFiles){
  const rel=path.relative(ROOT,file).replaceAll('\\','/');
  if(!fs.existsSync(file)){failures.push(`${rel}: expected public editorial file is missing`);continue;}
  const html=fs.readFileSync(file,'utf8'),noindex=isNoindex(html),canonical=canonicalOf(html);
  if(/[—–]/.test(html))failures.push(`${rel}: forbidden long dash character in public content`);
  if(/verify (?:current )?pricing before publication|verify before publication|pending verification/i.test(html))failures.push(`${rel}: exposes internal verification language`);
  if(/toolscout\.luxurybuyerintelligence\.workers\.dev/i.test(html))failures.push(`${rel}: exposes legacy workers.dev origin`);
  if(!canonical||!canonical.startsWith('https://trytoolscout.org/'))failures.push(`${rel}: missing valid ToolScout canonical URL`);
  if(noindex&&canonical&&sitemap.includes(`<loc>${canonical}</loc>`))failures.push(`${rel}: noindex URL is present in sitemap`);
  if(!noindex&&canonical&&!sitemap.includes(`<loc>${canonical}</loc>`))failures.push(`${rel}: indexable canonical is missing from sitemap`);
  if((guideFiles.includes(file)||comparisonFiles.includes(file)||toolFiles.includes(file))&&!/affiliate/i.test(html))failures.push(`${rel}: missing affiliate disclosure context`);
  const externalNofollow=[...html.matchAll(/href=["']([^"']+)["'][^>]*rel=["'][^"']*nofollow[^"']*["']/gi)];
  for(const match of externalNofollow){const href=match[1];if(/^https?:\/\//i.test(href)&&!/^https:\/\/trytoolscout\.org\//i.test(href))failures.push(`${rel}: monetized/external nofollow link bypasses ToolScout redirect: ${href}`);}
  const hrefs=[...html.matchAll(/href=["']([^"']+)["']/gi)].map(match=>match[1]);
  for(const href of hrefs){
    const target=localHtmlTarget(file,href);
    if(target&&!fs.existsSync(target))failures.push(`${rel}: broken internal HTML link ${href}`);
  }
}

function hasVendorTracking(rawUrl,slug){
  const value=String(rawUrl||'');if(/[?&](?:sa|ref|referral|affiliate|partner|aff|via)=/i.test(value))return true;
  try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,'');
    if(host==='aff.trypipedrive.com'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='make'&&host==='make.com'&&/^\/en\/register\/?$/i.test(url.pathname)&&Boolean(url.searchParams.get('pc')))return true;
    if(slug==='shopify'&&host==='shopify.pxf.io'&&/^\/[a-z0-9_-]+\/?$/i.test(url.pathname))return true;
    if(slug==='adcreative-ai'&&host==='free-trial.adcreative.ai'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='typeform'&&host==='typeform.cello.so'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='kit'&&host==='partners.kit.com'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='gorgias'&&host==='partner.gorgias.com'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='lemlist'&&host==='get.lemlist.com'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='instantly'&&host==='refer.instantly.ai'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='zoho-crm'&&host==='go.zoho.com'&&/^\/[a-z0-9]+\/?$/i.test(url.pathname))return true;
    if(slug==='mailerlite'&&host==='mailerlite.com'&&Boolean(url.searchParams.get('linkId'))&&Boolean(url.searchParams.get('sourceId'))&&Boolean(url.searchParams.get('tenantId')))return true;
    if(slug==='se-ranking'&&host==='seranking.com'&&Boolean(url.searchParams.get('ga')))return true;
    return false;
  }catch{return false;}
}
const affiliatePath=path.join(ROOT,'data','affiliate.json');
if(fs.existsSync(affiliatePath)){const affiliate=JSON.parse(fs.readFileSync(affiliatePath,'utf8'));for(const[slug,entry]of Object.entries(affiliate)){if(!entry||typeof entry!=='object')continue;if(entry.enabled&&!entry.url)failures.push(`data/affiliate.json: ${slug} enabled without private affiliate URL`);if(entry.enabled&&!hasVendorTracking(entry.url,slug))failures.push(`data/affiliate.json: ${slug} enabled URL should contain verified vendor tracking`);}}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Public-surface validation passed: ${guideFiles.length} guides, ${comparisonFiles.length} comparisons, ${toolFiles.length} tool profiles and ${blogFiles.length} blog files checked, including internal HTML link integrity.`);
