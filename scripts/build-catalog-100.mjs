import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const base=read('data/tools.json');
const sources=[
  'data/catalog-wave1-enrichment.json',
  'data/catalog-wave1-enrichment-final.json',
  'data/catalog-wave2-enrichment.json',
  'data/catalog-wave3-enrichment.json'
];
const staged=sources.flatMap(read);
const required=['slug','name','category','description','pricing','freePlan','features','bestFor','sourceUrl','scores'];
const scoreKeys=['price','ease','automation','integrations','sales','ai','marketing','seo','research','content','agency'];
const map=new Map(base.map(t=>[t.slug,t]));
for(const tool of staged){
  for(const key of required){
    if(tool[key]===undefined||tool[key]===null||tool[key]==='') throw new Error(`${tool.slug||'unknown'} missing ${key}`);
  }
  for(const key of scoreKeys){
    const v=tool.scores?.[key];
    if(!Number.isFinite(v)||v<0||v>10) throw new Error(`${tool.slug} invalid score ${key}`);
  }
  map.set(tool.slug,{affiliateUrl:'',...tool});
}
const output=[...map.values()];
const slugs=output.map(t=>t.slug);
if(new Set(slugs).size!==output.length) throw new Error('Duplicate slugs after merge');
if(output.length!==100) throw new Error(`Expected exactly 100 tools, got ${output.length}`);
fs.writeFileSync(path.join(root,'data/tools.json'),JSON.stringify(output,null,2)+'\n');
const byCategory=output.reduce((acc,t)=>(acc[t.category]=(acc[t.category]||0)+1,acc),{});
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/catalog-100.json'),JSON.stringify({generatedAt:new Date().toISOString(),count:output.length,baseCount:base.length,stagedCount:staged.length,categories:byCategory},null,2)+'\n');
console.log(`Catalog built: ${output.length} tools`);
