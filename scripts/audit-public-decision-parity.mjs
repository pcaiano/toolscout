import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderPublicDecisionCandidate} from '../public-decision-runtime.js';
import {comparePublicParity,publicPageFingerprint} from '../public-page-parity-contract.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

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
        let bindings=[];
        return{
          bind(...args){bindings=args;return this},
          async first(){
            if(String(sql).includes('sqlite_master'))return{n:bindings.length};
            return null;
          },
          async all(){return{results:[]}},
          async run(){throw new Error('global_public_parity_attempted_write')}
        };
      },
      async batch(){throw new Error('global_public_parity_attempted_batch_write')}
    },
    ASSETS:{
      async fetch(request){
        const file=assetPath(new URL(request.url).pathname);
        if(!file)return new Response('not found',{status:404});
        return new Response(fs.readFileSync(file),{status:200,headers:{'Content-Type':contentType(file),'Cache-Control':'public, max-age=300'}});
      }
    }
  };
}
function inventory(){
  const rows=[];
  const toolsDir=path.join(ROOT,'tools');
  for(const name of fs.readdirSync(toolsDir).filter(x=>x.endsWith('.html')).sort()){
    if(name==='index.html')continue;
    rows.push({kind:'tool',file:path.join('tools',name),pathname:'/tools/'+name.replace(/\.html$/,'')});
  }
  for(const name of fs.readdirSync(ROOT).filter(x=>/^best-[a-z0-9-]+\.html$/i.test(x)).sort()){
    rows.push({kind:'guide',file:name,pathname:'/'+name.replace(/\.html$/,'')});
  }
  return rows;
}

const results=[];
for(const row of inventory()){
  const before=fs.readFileSync(path.join(ROOT,row.file),'utf8');
  let response=null,error=null,after='';
  try{
    response=await renderPublicDecisionCandidate(new Request('https://trytoolscout.org'+row.pathname),env());
    after=response?await response.text():'';
  }catch(e){error=String(e?.message||e)}
  const parity=response?comparePublicParity(before,after):{ok:false,errors:['candidate_missing']};
  const fp=after?publicPageFingerprint(after):null;
  results.push({
    ...row,
    status:response?.status||0,
    parityOk:parity.ok&&!error,
    errors:[...(parity.errors||[]),...(error?[error]:[])],
    editorialEvidence:Boolean(fp?.hasEditorialEvidence),
    affiliateDisclosure:Boolean(fp?.hasAffiliateDisclosure),
    monetizedLinks:fp?.monetizedLinks?.length||0,
    jsonLdTypes:fp?.jsonLdTypes||[],
    canonical:fp?.canonical||null
  });
}

const structuralFailures=results.filter(x=>!x.parityOk);
const editorialGaps=results.filter(x=>!x.editorialEvidence);
const disclosureGaps=results.filter(x=>x.kind==='tool'&&!x.affiliateDisclosure);
const report={
  generatedAt:new Date().toISOString(),
  total:results.length,
  tools:results.filter(x=>x.kind==='tool').length,
  guides:results.filter(x=>x.kind==='guide').length,
  structuralParityPassed:results.length-structuralFailures.length,
  structuralFailures:structuralFailures.map(x=>({pathname:x.pathname,errors:x.errors})),
  editorialAuthorityReady:results.length-editorialGaps.length,
  editorialGaps:editorialGaps.map(x=>x.pathname),
  toolDisclosureGaps:disclosureGaps.map(x=>x.pathname),
  directMigrationReady:results.filter(x=>x.parityOk&&x.editorialEvidence&&(x.kind!=='tool'||x.affiliateDisclosure)).map(x=>x.pathname),
  results
};
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','public-decision-parity.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({
  total:report.total,
  tools:report.tools,
  guides:report.guides,
  structuralParityPassed:report.structuralParityPassed,
  structuralFailures:report.structuralFailures,
  editorialAuthorityReady:report.editorialAuthorityReady,
  editorialGapCount:report.editorialGaps.length,
  editorialGaps:report.editorialGaps,
  toolDisclosureGapCount:report.toolDisclosureGaps.length,
  migrationReadyCount:report.directMigrationReady.length
},null,2));
if(structuralFailures.length)process.exitCode=1;
