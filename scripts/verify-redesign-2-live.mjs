const BASE=(process.env.TOOLSCOUT_BASE_URL||'https://trytoolscout.org').replace(/\/$/,'');
const errors=[];
async function get(path){
  const join=path.includes('?')?'&':'?';
  const url=BASE+path+join+'redesign2_live='+Date.now();
  const r=await fetch(url,{headers:{'User-Agent':'ToolScout-Redesign-2-Live-Acceptance/1.0','Cache-Control':'no-cache','Pragma':'no-cache'},redirect:'follow'});
  return{status:r.status,ok:r.ok,url:r.url,headers:r.headers,text:await r.text()};
}
function need(condition,code,detail){if(!condition)errors.push({code,detail});}

const home=await get('/');
need(home.ok,'home_unavailable',home.status);
need(/Find the(?:\s|<[^>]+>)*right software\./i.test(home.text),'home_redesign_headline_missing');
need(/id=["']softwarePulse["']/.test(home.text),'home_software_pulse_missing');
need(/href=["']\/["'][^>]*aria-label=["']ToolScout home["']|aria-label=["']ToolScout home["'][^>]*href=["']\/["']/.test(home.text),'home_brand_link_missing');
need(/src=["']\/favicon\.svg["']/.test(home.text),'home_real_mark_missing');
need(/Independent\. No sponsored rankings\./.test(home.text),'home_independence_proof_missing');
need(/data\/software-updates\.json/.test(home.text),'home_live_updates_feed_missing');

for(const [path,label] of [['/tools/figma','figma_profile'],['/make-vs-zapier','comparison'],['/whats-new.html','whats_new'],['/tools','tools_hub'],['/guides','guides_hub']]){
  const r=await get(path);
  need(r.ok,label+'_unavailable',r.status);
  need(/data-toolscout-public-redesign=["']2["']/.test(r.text),label+'_public_redesign_style_missing');
  need(/<html\b[^>]*data-toolscout-redesign=["']2["']/i.test(r.text),label+'_redesign_scope_missing');
  need(/class=["'][^"']*ts2-global-nav/.test(r.text),label+'_global_nav_missing');
  need(/class=["'][^"']*ts2-brand/.test(r.text)&&/href=["']\/["']/.test(r.text),label+'_home_link_missing');
}

const profile=await get('/tools/figma');
need(/AI interoperability/i.test(profile.text),'figma_ai_interoperability_missing');

const comparison=await get('/make-vs-zapier');
need(/AI interoperability/i.test(comparison.text),'comparison_ai_interoperability_missing');
need(/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/trytoolscout\.org\/make-vs-zapier["']/i.test(comparison.text)
  ||/<link[^>]+href=["']https:\/\/trytoolscout\.org\/make-vs-zapier["'][^>]+rel=["']canonical["']/i.test(comparison.text),'comparison_canonical_regressed');

const result={ok:errors.length===0,checkedAt:new Date().toISOString(),baseUrl:BASE,errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
