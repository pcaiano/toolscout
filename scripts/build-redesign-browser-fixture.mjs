import fs from 'node:fs';
import path from 'node:path';
import {commandCenterHtml} from '../command-center-simplified-view.js';
import {transformCommandCenterRedesignResponse} from '../command-center-redesign-runtime.js';
import {transformPublicRedesignResponse} from '../public-redesign-runtime.js';
import {candidatePage} from '../catalog-autonomy-worker.js';

const root=process.cwd();
const out=path.join(root,'.browser-fixtures');
fs.mkdirSync(out,{recursive:true});

async function writeTransformed(name,url,source,transform){
  const request=new Request(url,{method:'GET'});
  const response=new Response(source,{status:200,headers:{'Content-Type':'text/html; charset=UTF-8'}});
  const transformed=await transform(request,response);
  fs.writeFileSync(path.join(out,name),await transformed.text());
}

await writeTransformed(
  'analytics.html',
  'https://trytoolscout.org/analytics',
  commandCenterHtml(),
  transformCommandCenterRedesignResponse
);

for(const [name,pathname] of [['figma-public.html','tools/figma.html'],['comparison-public.html','make-vs-zapier.html'],['trends-public.html','software-trends-index.html']]){
  const file=path.join(root,pathname);
  if(!fs.existsSync(file))throw new Error('Missing browser fixture source: '+pathname);
  await writeTransformed(name,'https://trytoolscout.org/'+pathname,fs.readFileSync(file,'utf8'),transformPublicRedesignResponse);
}

// Runtime D1 catalog admissions must render with the same CSS and components
// as the existing indexed profiles, not merely match the nav marker.
const cohort=JSON.parse(fs.readFileSync(path.join(root,'data','catalog-wave4-decision-ready.json'),'utf8'));
for(const slug of ['fresha','bqe-core']){
  const tool=cohort.find(item=>item.slug===slug);
  if(!tool)throw new Error('Missing decision-grade runtime browser fixture: '+slug);
  await writeTransformed(slug+'-public.html','https://trytoolscout.org/tools/'+slug,
    candidatePage(tool,{monetized:false}),transformPublicRedesignResponse);
}

const publisherFile=path.join(root,'distribution','publisher-kit.html');
if(!fs.existsSync(publisherFile))throw new Error('Missing publisher kit fixture');
fs.writeFileSync(path.join(out,'publisher-kit.html'),fs.readFileSync(publisherFile,'utf8'));

console.log(JSON.stringify({ok:true,files:['.browser-fixtures/analytics.html','.browser-fixtures/figma-public.html','.browser-fixtures/fresha-public.html','.browser-fixtures/bqe-core-public.html','.browser-fixtures/comparison-public.html','.browser-fixtures/trends-public.html','.browser-fixtures/publisher-kit.html']}));
