const BASE=(process.env.TOOLSCOUT_BASE_URL||'https://trytoolscout.org').replace(/\/$/,'');
const errors=[];
let requestSeq=0;

function need(condition,code,detail){if(!condition)errors.push({code,detail});}
function cacheBusted(value){
  const u=new URL(value,BASE);
  u.searchParams.set('redesign2_live',Date.now()+'-'+(++requestSeq));
  return u.href;
}
async function get(value){
  const url=cacheBusted(value);
  try{
    const r=await fetch(url,{headers:{'User-Agent':'ToolScout-Redesign-2-Live-Acceptance/2.0','Cache-Control':'no-cache','Pragma':'no-cache'},redirect:'follow'});
    return{status:r.status,ok:r.ok,url:r.url,headers:r.headers,text:await r.text()};
  }catch(error){
    return{status:0,ok:false,url,text:'',headers:new Headers(),error:String(error?.message||error)};
  }
}
function labelFor(url){
  const p=new URL(url).pathname.replace(/^\/+|\/+$/g,'')||'home';
  return p.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,90)||'home';
}
async function pool(items,limit,fn){
  let cursor=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(cursor<items.length){
      const index=cursor++;
      await fn(items[index],index);
    }
  });
  await Promise.all(workers);
}

const home=await get('/');
need(home.ok,'home_unavailable',home.status);
need(/Find the(?:\s|<[^>]+>)*right software\./i.test(home.text),'home_redesign_headline_missing');
need(/id=["']softwarePulse["']/.test(home.text),'home_software_pulse_missing');
need(/href=["']\/["'][^>]*aria-label=["']ToolScout home["']|aria-label=["']ToolScout home["'][^>]*href=["']\/["']/.test(home.text),'home_brand_link_missing');
need(/src=["']\/favicon\.svg["']/.test(home.text),'home_real_mark_missing');
need(/Independent\. No sponsored rankings\./.test(home.text),'home_independence_proof_missing');
need(/data\/software-updates\.json/.test(home.text),'home_live_updates_feed_missing');

const sitemap=await get('/sitemap.xml');
need(sitemap.ok,'sitemap_unavailable',sitemap.status);
const urls=[...sitemap.text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
  .map(match=>match[1])
  .filter(Boolean)
  .filter(value=>{
    try{return new URL(value).origin===new URL(BASE).origin}catch{return false}
  });
need(urls.length>0,'sitemap_empty',urls.length);

const publicPages=[...new Set(urls)].filter(value=>new URL(value).pathname!=='/');
await pool(publicPages,12,async value=>{
  const label=labelFor(value);
  const r=await get(value);
  const contentType=String(r.headers.get('content-type')||'').toLowerCase();
  need(r.ok,label+'_unavailable',{status:r.status,url:value,error:r.error||null});
  if(!r.ok)return;
  need(contentType.includes('text/html'),label+'_not_html',{contentType,url:value,finalUrl:r.url});
  if(!contentType.includes('text/html'))return;
  need(/data-toolscout-public-redesign=["']2["']/.test(r.text),label+'_public_redesign_style_missing',value);
  need(/<html\b[^>]*data-toolscout-redesign=["']2["']/i.test(r.text),label+'_redesign_scope_missing',value);
  const sharedNavCount=(r.text.match(/class=["'][^"']*\bts2-global-nav\b[^"']*["']/g)||[]).length;
  need(sharedNavCount===1,label+'_global_nav_count',{url:value,count:sharedNavCount});
  need(/class=["'][^"']*ts2-brand/.test(r.text)&&/href=["']\/["']/.test(r.text),label+'_home_link_missing',value);
  need(!/class=["'][^"']*\bts-global-nav\b[^"']*["']/.test(r.text),label+'_legacy_global_nav_present',value);
  need(!/<nav\b[^>]*>[\s\S]*?<a\b[^>]*class=["']brand["'][^>]*>\s*ToolScout\s*<\/a>[\s\S]*?<\/nav>/i.test(r.text),label+'_legacy_branded_nav_present',value);
  need(!/<div\b[^>]*class=["'][^"']*\btop\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*class=["']brand["'][^>]*>\s*ToolScout\s*<\/a>/i.test(r.text),label+'_legacy_top_nav_present',value);
  if(/^\/tools\/[a-z0-9][a-z0-9-]*$/i.test(new URL(value).pathname)){
    need(!/<a\b[^>]*class=["'][^"']*\bbrand\b[^"']*["'][^>]*>\s*ToolScout\s*<\/a>/i.test(r.text),label+'_legacy_tool_profile_brand_present',value);
    need(/data-toolscout-surface=["']tool-profile["']/.test(r.text),label+'_tool_profile_surface_missing',value);
  }
});

const methodology=await get('/methodology');
need(methodology.ok,'methodology_unavailable',methodology.status);
need(/data-toolscout-surface=["']methodology["']/.test(methodology.text),'methodology_surface_missing');
need(/Recommendations start with the job\./i.test(methodology.text),'methodology_v2_content_missing');
need(!/class=["'][^"']*ts-global-nav(?:\s|["'])/.test(methodology.text),'methodology_legacy_nav_present');

const profile=await get('/tools/figma');
need(/AI interoperability/i.test(profile.text),'figma_ai_interoperability_missing');
need(/data-toolscout-surface=["']tool-profile["']/.test(profile.text),'figma_tool_profile_surface_missing');
need(!/<a\b[^>]*class=["'][^"']*\bbrand\b[^"']*["'][^>]*>\s*ToolScout\s*<\/a>/i.test(profile.text),'figma_legacy_tool_profile_brand_present');

const comparison=await get('/make-vs-zapier');
need(/AI interoperability/i.test(comparison.text),'comparison_ai_interoperability_missing');
need(/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/trytoolscout\.org\/make-vs-zapier["']/i.test(comparison.text)
  ||/<link[^>]+href=["']https:\/\/trytoolscout\.org\/make-vs-zapier["'][^>]+rel=["']canonical["']/i.test(comparison.text),'comparison_canonical_regressed');

const result={ok:errors.length===0,checkedAt:new Date().toISOString(),baseUrl:BASE,sitemapPages:urls.length,checkedPublicPages:publicPages.length+1,errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
