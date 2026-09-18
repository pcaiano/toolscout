import fs from 'node:fs';

const url='https://trytoolscout.org/api/growth/search-directives';
const res=await fetch(url,{headers:{'User-Agent':'ToolScout-SEO-Brain-Sync/1.0'}});
if(!res.ok)throw new Error(`shared_growth_directives_http_${res.status}`);
const data=await res.json();
if(data?.brain!=='shared-growth-v3')throw new Error(`unexpected_growth_brain_${data?.brain||'unknown'}`);
const generated=Date.parse(data.generatedAt||'');
if(!Number.isFinite(generated)||Date.now()-generated>36*3600000)throw new Error('shared_growth_directives_stale');
if(!Array.isArray(data.directives))throw new Error('shared_growth_directives_missing');
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/runtime-growth-directives.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({brain:data.brain,directives:data.directives.length,generatedAt:data.generatedAt}));
