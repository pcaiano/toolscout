import fs from 'node:fs';

const intents = JSON.parse(fs.readFileSync('data/intents.json','utf8'));
const profiles = JSON.parse(fs.readFileSync('data/intent-profiles.json','utf8'));
const tools = JSON.parse(fs.readFileSync('data/tools.json','utf8'));

const errors=[];
const warnings=[];
const categories=new Set(tools.map(t=>String(t.category||'').toLowerCase()));

for(const intent of intents){
  const slug=String(intent.slug||'');
  if(!slug){errors.push('Intent without slug');continue;}
  if(!profiles[slug]) errors.push(`${slug}: missing intent profile`);
  if(!intent.title) warnings.push(`${slug}: missing title`);
  if(!intent.description) warnings.push(`${slug}: missing description`);
  const category=String(intent.category||'').toLowerCase();
  if(category&&!categories.has(category)) warnings.push(`${slug}: category ${category} has no exact catalog tool category`);
  const keywordText=(intent.keywords||[]).join(' ').toLowerCase();
  const matches=tools.filter(t=>{
    const text=[t.name,t.category,t.description,...(t.features||[]),...(t.bestFor||[])].join(' ').toLowerCase();
    const keywordHit=(intent.keywords||[]).some(k=>text.includes(String(k).toLowerCase()));
    return keywordHit || (category && String(t.category||'').toLowerCase()===category);
  });
  if(matches.length===0) errors.push(`${slug}: no catalog matches; not enough coverage`);
  else if(matches.length<3) warnings.push(`${slug}: only ${matches.length} catalog matches`);
  if(!keywordText) warnings.push(`${slug}: no keywords`);
}

const duplicateSlugs=new Set();
const seen=new Set();
for(const i of intents){if(seen.has(i.slug))duplicateSlugs.add(i.slug);seen.add(i.slug)}
for(const slug of duplicateSlugs) errors.push(`${slug}: duplicate intent slug`);

console.log(JSON.stringify({ok:errors.length===0,intents:intents.length,tools:tools.length,errors,warnings},null,2));
if(errors.length) process.exit(1);
