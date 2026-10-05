import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPublicNavigationCandidate} from '../public-navigation-runtime.js';
import {comparePublicParity,publicPageFingerprint} from '../public-page-parity-contract.js';
import {transformPublicRedesignResponse} from '../public-redesign-runtime.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='https://trytoolscout.org';
const CASES=[
  {pathname:'/tools'},
  {pathname:'/guides'},
  {pathname:'/compare',query:'?a=airtable&b=semrush&source=phase12-shadow'},
  {pathname:'/categories'},
  {pathname:'/crm-tools'},
  {pathname:'/seo-tools'},
  {pathname:'/blog/'}
];

function contentType(file){
  if(file.endsWith('.json'))return'application/json; charset=UTF-8';
  if(file.endsWith('.xml'))return'application/xml; charset=UTF-8';
  if(file.endsWith('.html'))return'text/html; charset=UTF-8';
  return'text/plain; charset=UTF-8';
}
function env(){
  return{
    DB:{
      prepare(sql){
        const text=String(sql);
        let bindings=[];
        return{
          bind(...args){bindings=args;return this},
          async first(){
            if(text.includes('sqlite_master')&&text.includes('seo_execution_contract'))return{n:1};
            if(text.includes('sqlite_master'))return{n:bindings.length};
            return null;
          },
          async all(){return{results:[]}},
          async run(){throw new Error('navigation_shadow_attempted_write')}
        };
      },
      async batch(){throw new Error('navigation_shadow_attempted_batch_write')}
    },
    ASSETS:{
      async fetch(request){
        const pathname=decodeURIComponent(new URL(request.url).pathname).replace(/^\//,'');
        const file=path.join(ROOT,pathname);
        if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('not found',{status:404});
        return new Response(fs.readFileSync(file),{status:200,headers:{'Content-Type':contentType(file),'Cache-Control':'public, max-age=300'}});
      }
    }
  };
}
async function live(url){
  const response=await fetch(url,{
    redirect:'follow',
    headers:{'User-Agent':'ToolScout-2.0-Navigation-Shadow/1.0','Accept':'text/html,application/xhtml+xml','Cache-Control':'no-cache'}
  });
  if(!response.ok)throw new Error('live_fetch_failed:'+new URL(url).pathname+':'+response.status);
  return{response,html:await response.text()};
}
function compareCapabilities(pathname,html){
  const errors=[];
  if(pathname==='/compare'){
    for(const [code,re] of [
      ['query_params_lost',/URLSearchParams\(location\.search\)/],
      ['event_tracking_lost',/\/api\/events/],
      ['tool_catalog_fetch_lost',/data\/tools\.json/],
      ['tool_assets_fetch_lost',/data\/tool-assets\.json/],
      ['commercial_cta_lost',/\/go\//],
      ['history_state_lost',/history\.replaceState/]
    ])if(!re.test(html))errors.push(code);
  }
  if(pathname==='/blog/'){
    if(!/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*follow/i.test(html))errors.push('blog_noindex_lost');
    if(!/Research before publication\./.test(html))errors.push('blog_editorial_control_copy_lost');
  }
  if(pathname==='/tools'){
    for(const [code,re] of [
      ['tool_catalog_fetch_lost',/\/data\/tools\.json/],
      ['pending_affiliate_fetch_lost',/\/data\/pending-affiliate-tools\.json/],
      ['tool_assets_fetch_lost',/\/data\/tool-assets\.json/]
    ])if(!re.test(html))errors.push(code);
  }
  return errors;
}

const report=[];
let failed=false;
for(const row of CASES){
  const target=BASE+row.pathname+(row.query||'');
  const baseline=await live(target);
  let candidate=await renderPublicNavigationCandidate(new Request(target),env());
  if(candidate?.ok)candidate=await transformPublicRedesignResponse(new Request(target),candidate);
  if(!candidate?.ok){
    failed=true;
    report.push({pathname:row.pathname,ok:false,errors:['candidate_unavailable'],status:candidate?.status||0});
    continue;
  }
  const html=await candidate.text();
  const parity=comparePublicParity(baseline.html,html,{strictSearchMetadata:true,strictInternalLinks:false});
  const capabilityErrors=compareCapabilities(row.pathname,html);
  if(!/href=["']\/privacy["']/.test(html))capabilityErrors.push('privacy_link_missing');
  if(!/href=["']\/analytics-consent\?choice=/.test(html))capabilityErrors.push('analytics_consent_link_missing');
  const errors=[...parity.errors,...capabilityErrors];
  if(errors.length)failed=true;
  const before=publicPageFingerprint(baseline.html),after=publicPageFingerprint(html);
  report.push({
    pathname:row.pathname,
    ok:errors.length===0,
    errors,
    live:{status:baseline.response.status,canonical:before.canonical,title:before.title,description:before.description,h1:before.h1,jsonLdTypes:before.jsonLdTypes,internalLinks:before.internalLinks.length},
    candidate:{canonical:after.canonical,title:after.title,description:after.description,h1:after.h1,jsonLdTypes:after.jsonLdTypes,internalLinks:after.internalLinks.length,plane:candidate.headers.get('X-ToolScout-Public-Plane')}
  });
}

console.log(JSON.stringify({ok:!failed,checkedAt:new Date().toISOString(),paths:report},null,2));
if(failed)process.exitCode=1;
