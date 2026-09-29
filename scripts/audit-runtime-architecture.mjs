import fs from 'node:fs';
import path from 'node:path';
import {ROUTE_GROUPS,EARLY_DISPATCH_OWNERS} from '../runtime-route-contract.js';

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
  ['seo_runtime',/ownership\.owner==='seo_runtime'/],
  ['authority_acquisition',/ownership\.owner==='authority_acquisition'/],
  ['mission_integrity',/ownership\.owner==='mission_integrity'/]
].filter(([,pattern])=>pattern.test(directSource)).map(([owner])=>owner);

const rootJs=fs.readdirSync(ROOT).filter(file=>file.endsWith('.js')&&fs.statSync(path.join(ROOT,file)).isFile());
const runtimeDdlFiles=rootJs.filter(file=>/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i.test(fs.readFileSync(path.join(ROOT,file),'utf8')));
const directOwnerFiles={
  distribution_priority:'distribution-priority-worker.js',
  distribution_orchestrator:'distribution-orchestrator-worker.js',
  seo_runtime:'seo-cloudflare-runtime-worker.js',
  authority_acquisition:'authority-acquisition-worker.js',
  mission_integrity:'mission-integrity-v2-worker.js',
  growth_runtime_closed_loop:'growth-runtime-closed-loop-worker.js',
  public_editorial_site:'public-editorial-runtime.js'
};
const directOwnerDdlFiles=[...new Set(EARLY_DISPATCH_OWNERS.map(owner=>directOwnerFiles[owner]).filter(Boolean).filter(file=>runtimeDdlFiles.includes(file)))];
const directGroups=ROUTE_GROUPS.filter(group=>group.owner==='compute_router'||EARLY_DISPATCH_OWNERS.includes(group.owner));
const legacyDeclaredGroups=ROUTE_GROUPS.filter(group=>!directGroups.includes(group));
const routeCoveragePct=ROUTE_GROUPS.length?Number((directGroups.length/ROUTE_GROUPS.length*100).toFixed(1)):0;

const report={
  generatedAt:new Date().toISOString(),
  architecture:'toolscout-2.0',
  entrypoint:ENTRY,
  legacyChain:{edges,files:chain.length,terminus,chain},
  earlyDispatchOwners:directOwners,
  routeOwnership:{
    declaredGroups:ROUTE_GROUPS.length,
    directGroups:directGroups.length,
    legacyDeclaredGroups:legacyDeclaredGroups.length,
    directCoveragePct:routeCoveragePct,
    directGroupIds:directGroups.map(x=>x.id),
    legacyGroupIds:legacyDeclaredGroups.map(x=>x.id)
  },
  runtimeDdl:{
    files:runtimeDdlFiles,
    count:runtimeDdlFiles.length,
    directOwnerFiles:directOwnerDdlFiles
  },
  policy:{maxLegacyEdges:MAX_LEGACY_EDGES,mustNotIncrease:true,target:'progressively replace decorator traversal with explicit owner dispatch',directOwnersMustBeMigrationOnly:true}
};

fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','runtime-architecture-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:edges<=MAX_LEGACY_EDGES&&directOwnerDdlFiles.length===0,edges,files:chain.length,terminus,directOwners,routeCoveragePct,directGroups:directGroups.length,declaredGroups:ROUTE_GROUPS.length,runtimeDdlFiles:runtimeDdlFiles.length,directOwnerDdlFiles},null,2));
if(edges>MAX_LEGACY_EDGES){
  console.error('Legacy wrapper depth increased. New runtime behavior must use explicit ownership rather than adding another decorator.');
  process.exitCode=1;
}
if(terminus!=='worker.js'){
  console.error('Unexpected runtime chain terminus: '+terminus);
  process.exitCode=1;
}

if(directOwnerDdlFiles.length){
  console.error('Direct ToolScout 2.0 route owners must not create or alter schema at runtime: '+directOwnerDdlFiles.join(', '));
  process.exitCode=1;
}
