import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const tools=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tools.json'),'utf8'));
const profilesPath=path.join(ROOT,'data','competitive-gap-profiles.json');
const gapProfiles=fs.existsSync(profilesPath)?JSON.parse(fs.readFileSync(profilesPath,'utf8')):[];
const catalogSlugs=new Set(tools.map(tool=>String(tool?.slug||'').trim()).filter(Boolean));
const coverageSlugs=new Set(gapProfiles.map(profile=>String(profile?.slug||'').trim()).filter(Boolean));
const allowedSlugs=new Set([...catalogSlugs,...coverageSlugs]);
const dir=path.join(ROOT,'tools');
const removed=[];
if(fs.existsSync(dir)){
  for(const name of fs.readdirSync(dir)){
    if(!name.endsWith('.html'))continue;
    const slug=name.slice(0,-5);
    if(allowedSlugs.has(slug))continue;
    fs.rmSync(path.join(dir,name));
    removed.push(slug);
  }
}
fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','orphan-tool-profiles.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),
  catalogTools:catalogSlugs.size,
  competitiveGapProfiles:coverageSlugs.size,
  retainedProfiles:allowedSlugs.size,
  removedCount:removed.length,
  removed
},null,2)+'\n');
console.log(JSON.stringify({catalogTools:catalogSlugs.size,competitiveGapProfiles:coverageSlugs.size,retainedProfiles:allowedSlugs.size,removedCount:removed.length,removed}));
