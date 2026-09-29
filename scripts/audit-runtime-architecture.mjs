import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const ENTRY='compute-router-worker.js';
const MAX_LEGACY_EDGES=72;

function baseImport(file){
  const full=path.join(ROOT,file);
  if(!fs.existsSync(full))return null;
  const text=fs.readFileSync(full,'utf8');
  const match=text.match(/import\s+base(?:,[^\n]*?)?\s+from\s+['"]\.\/([^'"]+)['"]/);
  return match?.[1]||null;
}

const chain=[];
const seen=new Set();
let current=ENTRY;
while(current){
  if(seen.has(current))throw new Error('runtime_base_chain_cycle:'+current);
  seen.add(current);chain.push(current);
  current=baseImport(current);
}
const edges=Math.max(0,chain.length-1);
const terminus=chain.at(-1)||null;
const directSource=fs.readFileSync(path.join(ROOT,ENTRY),'utf8');
const directOwners=[
  ['distribution_priority',/ownership\.owner==='distribution_priority'/],
  ['distribution_orchestrator',/ownership\.owner==='distribution_orchestrator'/],
  ['mission_integrity',/ownership\.owner==='mission_integrity'/]
].filter(([,pattern])=>pattern.test(directSource)).map(([owner])=>owner);

const report={
  generatedAt:new Date().toISOString(),
  architecture:'toolscout-2.0',
  entrypoint:ENTRY,
  legacyChain:{edges,files:chain.length,terminus,chain},
  earlyDispatchOwners:directOwners,
  policy:{maxLegacyEdges:MAX_LEGACY_EDGES,mustNotIncrease:true,target:'progressively replace decorator traversal with explicit owner dispatch'}
};

fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','runtime-architecture-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:edges<=MAX_LEGACY_EDGES,edges,files:chain.length,terminus,directOwners},null,2));
if(edges>MAX_LEGACY_EDGES){
  console.error('Legacy wrapper depth increased. New runtime behavior must use explicit ownership rather than adding another decorator.');
  process.exitCode=1;
}
if(terminus!=='worker.js'){
  console.error('Unexpected runtime chain terminus: '+terminus);
  process.exitCode=1;
}
