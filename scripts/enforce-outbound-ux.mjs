import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const fix=process.argv.includes('--fix');
const htmlTargets=[];
for(const name of fs.readdirSync(ROOT)){
  if(!name.endsWith('.html'))continue;
  if(/^analytics(?:-|\.|$)/i.test(name))continue;
  htmlTargets.push(path.join(ROOT,name));
}
for(const directory of ['tools','blog','news']){
  const dir=path.join(ROOT,directory);
  if(!fs.existsSync(dir))continue;
  for(const name of fs.readdirSync(dir))if(name.endsWith('.html'))htmlTargets.push(path.join(dir,name));
}

function normalizeOutboundAnchor(full,attrs,body){
  let nextAttrs=attrs.replace(/\s+target=("[^"]*"|'[^']*')/gi,'');
  let rel=[];
  const relMatch=nextAttrs.match(/\s+rel=("([^"]*)"|'([^']*)')/i);
  if(relMatch){
    rel=String(relMatch[2]??relMatch[3]??'').split(/\s+/).filter(Boolean).filter(x=>x.toLowerCase()!=='noreferrer');
    nextAttrs=nextAttrs.replace(relMatch[0],'');
  }
  for(const token of ['nofollow','sponsored','noopener'])if(!rel.some(x=>x.toLowerCase()===token))rel.push(token);
  const hrefMatch=nextAttrs.match(/\bhref=(?:"([^"]*)"|'([^']*)')/i);
  const href=String(hrefMatch?.[1]??hrefMatch?.[2]??'');
  const isMake=/^\/go\/make(?:[?#]|$)/i.test(href);
  let nextBody=body.replace(/^([\s\S]*?)Explore\s+/i,(m,prefix)=>`${prefix}Visit `);
  if(isMake)nextBody=nextBody.replace(/\b(?:Visit|Explore)\s+Make\b/i,'Start with Make');
  return `<a${nextAttrs} target="_blank" rel="${rel.join(' ')}">${nextBody}</a>`;
}

function transformHtml(text){
  return text.replace(/<a\b([^>]*\bhref=(?:"\/go\/[^"#?]+(?:[?#][^"]*)?"|'\/go\/[^'#?]+(?:[?#][^']*)?')[^>]*)>([\s\S]*?)<\/a>/gi,normalizeOutboundAnchor);
}

let changed=0;
let checked=0;
const violations=[];
for(const file of htmlTargets){
  const before=fs.readFileSync(file,'utf8');
  const after=transformHtml(before);
  checked++;
  if(after!==before){
    if(fix){fs.writeFileSync(file,after);changed++;}
    else violations.push(path.relative(ROOT,file));
  }
}

const appPath=path.join(ROOT,'app.js');
if(fs.existsSync(appPath)){
  const before=fs.readFileSync(appPath,'utf8');
  const after=before
    .replace(/\s+noreferrer\b/g,'')
    .replace(/[\u2013\u2014]/g,'-')
    .replace(/Explore \$\{t\.name\}/g,'Visit ${t.name}')
    .replace(/Visit \$\{t\.name\}/g,"${t.slug==='make'?'Start with Make':'Visit '+t.name}");
  checked++;
  if(after!==before){
    if(fix){fs.writeFileSync(appPath,after);changed++;}
    else violations.push('app.js');
  }
}

if(!fix&&violations.length){
  console.error(JSON.stringify({ok:false,checked,violations},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,mode:fix?'fix':'check',checked,changed,commandCenterTouched:false}));
