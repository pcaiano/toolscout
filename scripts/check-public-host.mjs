import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const legacy='toolscout.luxurybuyerintelligence.workers.dev';
const allowed=new Set(['worker.js']);
const ignored=new Set(['.git','.github','node_modules']);
const files=[];
function walk(dir){for(const name of fs.readdirSync(dir)){if(ignored.has(name))continue;const p=path.join(dir,name);const s=fs.statSync(p);if(s.isDirectory())walk(p);else if(/\.(html|js|mjs|json|xml|txt|md|yml|yaml)$/.test(name))files.push(p);}}
walk(ROOT);
const hits=[];
for(const file of files){const rel=path.relative(ROOT,file);if(allowed.has(path.basename(file)))continue;const text=fs.readFileSync(file,'utf8');if(text.includes(legacy))hits.push(rel);}
if(hits.length){console.error('Legacy public hostname found outside approved Worker fallback:',hits.join(', '));process.exit(1);}
console.log('Public hostname guard passed: no legacy hostname outside approved Worker code.');
