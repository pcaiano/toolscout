const BASE='https://trytoolscout.org';
const SCORE_KEYS=['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency'];
const IMAGE_TIMEOUT_MS=4500;
const PAGE_TIMEOUT_MS=5500;
let assetsCache={at:0,value:{}};

const clean=v=>String(v??'').replace(/[\u2013\u2014]/g,'-').replace(/\s+/g,' ').trim();
const uniq=xs=>[...new Set((xs||[]).filter(Boolean))];
const httpsUrl=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'?u:null}catch{return null}};
async function assetMap(env){
  if(Date.now()-assetsCache.at<60000)return assetsCache.value;
  try{
    const r=await env.ASSETS.fetch(new Request(BASE+'/data/tool-assets.json'));
    const j=r.ok?await r.json():{};
    assetsCache={at:Date.now(),value:j?.assets||{}};
  }catch{assetsCache={at:Date.now(),value:{}}}
  return assetsCache.value;
}
function resolveUrl(raw,base){try{return new URL(String(raw||''),base).toString()}catch{return null}}
function iconCandidates(html,pageUrl){
  const out=[];
  for(const match of String(html||'').matchAll(/<link\b([^>]+)>/gi)){
    const attrs=match[1]||'',rel=attrs.match(/\brel=["']([^"']+)["']/i)?.[1]||'';
    if(!/icon/i.test(rel))continue;
    const href=attrs.match(/\bhref=["']([^"']+)["']/i)?.[1]||'';
    const url=resolveUrl(href,pageUrl);if(!url)continue;
    const sizes=attrs.match(/\bsizes=["']([^"']+)["']/i)?.[1]||'';
    let score=/apple-touch-icon/i.test(rel)?80:60;
    if(/192|180|256|512/i.test(sizes))score+=30;
    else if(/128|96|64/i.test(sizes))score+=20;
    if(/svg/i.test(url))score+=10;
    out.push({url,provenance:/apple-touch-icon/i.test(rel)?'first-party-apple-touch-icon':'first-party-icon',score});
  }
  try{out.push({url:new URL('/favicon.ico',pageUrl).toString(),provenance:'first-party-root-favicon',score:30})}catch{}
  return [...new Map(out.sort((a,b)=>b.score-a.score).map(x=>[x.url,x])).values()];
}
async function fetchPage(url){
  const u=httpsUrl(url);if(!u)return{ok:false,status:'invalid_url',url:null,html:''};
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),PAGE_TIMEOUT_MS);
  try{
    const r=await fetch(u.href,{redirect:'follow',signal:ctl.signal,headers:{'User-Agent':'ToolScout Catalog Quality/2.0 (+https://trytoolscout.org/)','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.4'}});
    if(r.status===404||r.status===410)return{ok:false,status:'broken',httpStatus:r.status,url:r.url||u.href,html:''};
    if(!r.ok)return{ok:false,status:[401,403,429].includes(r.status)?'blocked_or_limited':'warning',httpStatus:r.status,url:r.url||u.href,html:''};
    const type=String(r.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html')&&!type.includes('text/plain')&&!type.includes('application/xhtml'))return{ok:true,status:'ok',httpStatus:r.status,url:r.url||u.href,html:''};
    return{ok:true,status:'ok',httpStatus:r.status,url:r.url||u.href,html:(await r.text()).slice(0,500000)};
  }catch(e){return{ok:false,status:e?.name==='AbortError'?'timeout':'network_warning',url:u.href,html:''}}
  finally{clearTimeout(timer)}
}
async function probeImage(candidate){
  if(!candidate?.url||!httpsUrl(candidate.url))return null;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),IMAGE_TIMEOUT_MS);
  try{
    let r=await fetch(candidate.url,{method:'HEAD',redirect:'follow',signal:ctl.signal,headers:{'User-Agent':'ToolScout Visual Quality/2.0 (+https://trytoolscout.org/)','Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.5'}});
    let type=String(r.headers.get('content-type')||'');
    if(!r.ok||(!/^image\//i.test(type)&&!/svg|icon/i.test(type))){
      r=await fetch(candidate.url,{method:'GET',redirect:'follow',signal:ctl.signal,headers:{'User-Agent':'ToolScout Visual Quality/2.0 (+https://trytoolscout.org/)','Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.5'}});
      type=String(r.headers.get('content-type')||'');
    }
    if(!r.ok||(!/^image\//i.test(type)&&!/svg|icon/i.test(type)))return null;
    return{url:r.url||candidate.url,provenance:candidate.provenance||'unknown',contentType:type||null,httpStatus:r.status};
  }catch{return null}finally{clearTimeout(timer)}
}
async function firstValid(candidates){
  for(const group of candidates){
    const rows=Array.isArray(group)?group:[group];
    const tried=await Promise.all(rows.filter(Boolean).slice(0,5).map(probeImage));
    const found=tried.find(Boolean);if(found)return found;
  }
  return null;
}
export async function resolveCatalogLogo(env,tool,{officialPage=null}={}){
  const assets=await assetMap(env);
  const curated=assets?.[tool?.slug]?.url?{url:assets[tool.slug].url,provenance:assets[tool.slug].provenance||'curated-asset'}:null;
  const explicit=tool?.logoUrl?{url:tool.logoUrl,provenance:tool.logoProvenance||'profile-logo'}:null;
  const page=officialPage?.html!==undefined?officialPage:await fetchPage(tool?.verificationUrl||tool?.sourceUrl);
  const firstParty=page?.url?iconCandidates(page.html,page.url):[];
  let google=null;
  try{
    const host=new URL(tool?.sourceUrl||page?.url).hostname;
    google={url:`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,provenance:'google-favicon-fallback'};
  }catch{}
  const resolved=await firstValid([[explicit,curated],firstParty.slice(0,4),google]);
  return{
    ok:Boolean(resolved),
    logo:resolved,
    sourcePage:{ok:Boolean(page?.ok),status:page?.status||'unknown',httpStatus:page?.httpStatus||null,url:page?.url||tool?.sourceUrl||null},
    page
  };
}
export function structuralCatalogIssues(tool){
  const issues=[];
  const required=['slug','name','category','description','pricing','features','bestFor','sourceUrl','scores'];
  for(const key of required)if(tool?.[key]===undefined||tool?.[key]===null||tool?.[key]==='')issues.push('missing_'+key);
  if(!httpsUrl(tool?.sourceUrl))issues.push('invalid_source_url');
  if(!Array.isArray(tool?.features)||tool.features.length<3)issues.push('features_too_thin');
  if(!Array.isArray(tool?.bestFor)||tool.bestFor.length<2)issues.push('best_for_too_thin');
  if(String(tool?.description||'').trim().length<60)issues.push('description_too_short');
  for(const key of SCORE_KEYS){
    const n=Number(tool?.scores?.[key]);
    if(!Number.isFinite(n)||n<1||n>10)issues.push('invalid_score_'+key);
  }
  if(tool?.rankingEligible===false)issues.push('ranking_ineligible');
  if(tool?.comparisonEligible===false)issues.push('comparison_ineligible');
  return issues;
}
export async function auditCatalogTool(env,tool,{officialPage=null}={}){
  const structural=structuralCatalogIssues(tool);
  const visual=await resolveCatalogLogo(env,tool,{officialPage});
  const issues=[...structural];
  if(!visual.logo)issues.push('visual_asset_unresolved');
  if(visual.sourcePage.status==='broken')issues.push('official_source_broken');
  const warnings=[];
  if(['blocked_or_limited','timeout','network_warning','warning'].includes(visual.sourcePage.status))warnings.push('official_source_'+visual.sourcePage.status);
  const publishable=!issues.length;
  const repaired=visual.logo?{
    ...tool,
    logoUrl:visual.logo.url,
    logoProvenance:visual.logo.provenance,
    logoVerifiedAt:new Date().toISOString()
  }:tool;
  return{
    slug:String(tool?.slug||''),
    publishable,
    status:publishable?(warnings.length?'warning':'pass'):'hold',
    issues,
    warnings,
    source:visual.sourcePage,
    logo:visual.logo,
    repairedTool:repaired
  };
}
export async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let cursor=0;
  async function worker(){while(true){const i=cursor++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length||1))},worker));
  return out;
}
export {SCORE_KEYS};
