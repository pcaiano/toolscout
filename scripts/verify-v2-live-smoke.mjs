import fs from 'node:fs';

const BASE=(process.env.TOOLSCOUT_BASE_URL||'https://trytoolscout.org').replace(/\/$/,'');
const errors=[],warnings=[];
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
const canonical=html=>String(html||'').match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]||String(html||'').match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]||null;
const sitemapUrls=xml=>new Set([...String(xml||'').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim()).filter(Boolean));
const fileFor=pathname=>pathname==='/'?'index.html':pathname.replace(/^\//,'')+'.html';

async function fetchText(pathname){
  try{
    const response=await fetch(BASE+pathname,{redirect:'follow',headers:{'User-Agent':'ToolScout-2.0-PostDeploy-Smoke/1.0'}});
    const text=await response.text();
    return{ok:response.ok,status:response.status,text,url:response.url,headers:response.headers};
  }catch(error){
    return{ok:false,status:0,text:'',url:BASE+pathname,error:String(error?.message||error)};
  }
}

// Live sitemap must contain every URL in the deployed repository sitemap.
const repoSitemap=fs.readFileSync('sitemap.xml','utf8');
const expectedSitemap=sitemapUrls(repoSitemap);
const liveSitemapResponse=await fetchText('/sitemap.xml');
if(!liveSitemapResponse.ok)errors.push({code:'live_sitemap_unavailable',status:liveSitemapResponse.status});
else{
  const live=sitemapUrls(liveSitemapResponse.text);
  for(const url of expectedSitemap)if(!live.has(url))errors.push({code:'live_sitemap_missing_url',url});
}

// Check the highest-value demand pages plus core navigation surfaces.
const portfolio=readJson('reports/editorial-authority-portfolio.json',{portfolio:[]});
const paths=[...new Set([
  '/',
  '/tools',
  '/guides',
  '/compare',
  '/software-trends-index',
  ...(portfolio.portfolio||[]).slice(0,10).map(row=>row.page).filter(Boolean)
])];

for(const pathname of paths){
  const live=await fetchText(pathname);
  if(!live.ok){errors.push({code:'critical_page_unavailable',pathname,status:live.status});continue;}
  const file=fileFor(pathname);
  if(!fs.existsSync(file))continue;
  const expectedCanonical=canonical(fs.readFileSync(file,'utf8'));
  const liveCanonical=canonical(live.text);
  if(expectedCanonical&&liveCanonical!==expectedCanonical){
    errors.push({code:'live_canonical_mismatch',pathname,expected:expectedCanonical,actual:liveCanonical});
  }
}

// Architecture contracts must be live after the 2.0 Worker deploy.
for(const [pathname,kind] of [['/api/runtime/route-contract','route'],['/api/runtime/schedule-contract','schedule']]){
  const live=await fetchText(pathname);
  if(!live.ok){errors.push({code:'runtime_contract_unavailable',kind,status:live.status});continue;}
  try{
    const data=JSON.parse(live.text);
    if(data.architecture!=='toolscout-2.0')errors.push({code:'runtime_contract_wrong_architecture',kind,architecture:data.architecture||null});
  }catch{errors.push({code:'runtime_contract_invalid_json',kind});}
}

const health=await fetchText('/api/command-center-simplified-health');
if(!health.ok)errors.push({code:'command_center_health_unavailable',status:health.status});
else{
  try{
    const data=JSON.parse(health.text);
    if(!Array.isArray(data.cards)||!data.cards.includes('Editorial Authority'))errors.push({code:'editorial_authority_card_not_live'});
  }catch{errors.push({code:'command_center_health_invalid_json'});}
}

const result={ok:errors.length===0,checkedAt:new Date().toISOString(),baseUrl:BASE,sitemapUrls:expectedSitemap.size,criticalPages:paths.length,errors,warnings};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
