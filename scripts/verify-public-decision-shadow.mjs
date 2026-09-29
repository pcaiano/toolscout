import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPublicDecisionCandidate} from '../public-decision-runtime.js';
import {comparePublicParity,publicPageFingerprint} from '../public-page-parity-contract.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='https://trytoolscout.org';
const PATHS=[
  '/best-seo-tools-for-agencies',
  '/tools/airtable',
  '/tools/semrush'
];

function contentType(file){
  if(file.endsWith('.json'))return'application/json; charset=UTF-8';
  if(file.endsWith('.xml'))return'application/xml; charset=UTF-8';
  if(file.endsWith('.html'))return'text/html; charset=UTF-8';
  return'text/plain; charset=UTF-8';
}
function assetPath(pathname){
  const clean=decodeURIComponent(String(pathname||'/')).replace(/^\//,'');
  const candidates=[];
  if(!clean)candidates.push('index.html');
  else{
    candidates.push(clean);
    if(!path.extname(clean))candidates.push(clean+'.html');
  }
  for(const rel of candidates){
    const full=path.join(ROOT,rel);
    if(full.startsWith(ROOT)&&fs.existsSync(full)&&fs.statSync(full).isFile())return full;
  }
  return null;
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
            if(text.includes("sqlite_master")&&text.includes("seo_execution_contract"))return{n:1};
            if(text.includes("sqlite_master"))return{n:bindings.length||7};
            return null;
          },
          async all(){return{results:[]}},
          async run(){throw new Error('shadow_parity_attempted_write')}
        };
      },
      async batch(){throw new Error('shadow_parity_attempted_batch_write')}
    },
    ASSETS:{
      async fetch(request){
        const u=new URL(request.url);
        const file=assetPath(u.pathname);
        if(!file)return new Response('not found',{status:404});
        return new Response(fs.readFileSync(file),{
          status:200,
          headers:{'Content-Type':contentType(file),'Cache-Control':'public, max-age=300'}
        });
      }
    }
  };
}

async function live(pathname){
  const response=await fetch(BASE+pathname,{
    redirect:'follow',
    headers:{
      'User-Agent':'ToolScout-2.0-Shadow-Parity/1.0',
      'Accept':'text/html,application/xhtml+xml'
    }
  });
  if(!response.ok)throw new Error(`live_fetch_failed:${pathname}:${response.status}`);
  return{response,html:await response.text()};
}

const report=[];
let failed=false;

for(const pathname of PATHS){
  const baseline=await live(pathname);
  const candidate=await renderPublicDecisionCandidate(new Request(BASE+pathname),env());
  if(!candidate?.ok){
    failed=true;
    report.push({pathname,ok:false,errors:['candidate_unavailable'],status:candidate?.status||0});
    continue;
  }
  const candidateHtml=await candidate.text();
  const parity=comparePublicParity(baseline.html,candidateHtml,{strictSearchMetadata:true});
  const baselineFp=publicPageFingerprint(baseline.html);
  const candidateFp=publicPageFingerprint(candidateHtml);
  if(parity.errors.length)failed=true;
  report.push({
    pathname,
    ok:parity.ok,
    errors:parity.errors,
    live:{
      status:baseline.response.status,
      canonical:baselineFp.canonical,
      title:baselineFp.title,
      description:baselineFp.description,
      h1:baselineFp.h1,
      jsonLdTypes:baselineFp.jsonLdTypes,
      internalLinks:baselineFp.internalLinks.length,
      monetizedLinks:baselineFp.monetizedLinks
    },
    candidate:{
      canonical:candidateFp.canonical,
      title:candidateFp.title,
      description:candidateFp.description,
      h1:candidateFp.h1,
      jsonLdTypes:candidateFp.jsonLdTypes,
      internalLinks:candidateFp.internalLinks.length,
      monetizedLinks:candidateFp.monetizedLinks,
      plane:candidate.headers.get('X-ToolScout-Public-Plane')
    }
  });
}

console.log(JSON.stringify({ok:!failed,checkedAt:new Date().toISOString(),paths:report},null,2));
if(failed)process.exitCode=1;
