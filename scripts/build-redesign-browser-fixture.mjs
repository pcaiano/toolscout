import fs from 'node:fs';
import path from 'node:path';
import {transformCommandCenterRedesignResponse} from '../command-center-redesign-runtime.js';

const root=process.cwd();
const source=fs.readFileSync(path.join(root,'analytics-v2.html'),'utf8');
const request=new Request('https://trytoolscout.org/analytics',{method:'GET'});
const response=new Response(source,{status:200,headers:{'Content-Type':'text/html; charset=UTF-8'}});
const transformed=await transformCommandCenterRedesignResponse(request,response);
const out=path.join(root,'.browser-fixtures');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'analytics.html'),await transformed.text());
console.log(JSON.stringify({ok:true,file:'.browser-fixtures/analytics.html'}));
