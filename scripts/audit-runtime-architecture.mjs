import fs from 'node:fs';
import path from 'node:path';
import {ROUTE_GROUPS,EARLY_DISPATCH_OWNERS} from '../runtime-route-contract.js';

const ROOT=process.cwd();
const ENTRY='compute-router-worker.js';
const MAX_LEGACY_EDGES=46;
const MIN_DIRECT_ROUTE_COVERAGE_PCT=100;
const ALLOWED_LEGACY_GROUPS=new Set([]);

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
const directOwners=EARLY_DISPATCH_OWNERS.filter(owner=>
  directSource.includes(`ownership.owner==='${owner}'`)||
  directSource.includes(`ownership.owner==="${owner}"`)
);

const rootJs=fs.readdirSync(ROOT).filter(file=>file.endsWith('.js')&&fs.statSync(path.join(ROOT,file)).isFile());
const runtimeDdlFiles=rootJs.filter(file=>/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i.test(fs.readFileSync(path.join(ROOT,file),'utf8')));
const directOwnerFiles={
  distribution_priority:'distribution-priority-worker.js',
  distribution_orchestrator:'distribution-orchestrator-worker.js',
  seo_runtime:'seo-cloudflare-runtime-worker.js',
  authority_acquisition:'authority-acquisition-worker.js',
  mission_integrity:'mission-integrity-v2-worker.js',
  growth_runtime_closed_loop:'growth-runtime-closed-loop-worker.js',
  authority_health:'authority-health-runtime.js',
  public_editorial_site:'public-editorial-runtime.js',
  command_center_direct:'command-center-business-truth-runtime.js',
  command_center_resilient_health:'command-center-resilient-health-runtime.js',
  command_center_schema_control:'command-center-schema-control-runtime.js',
  traffic_integrity_health:'traffic-integrity-health-runtime.js',
  admin_stats:'admin-stats-runtime.js',
  agent_protocol_core:'agent-protocol-core-worker.js',
  machine_discovery_catalog:'machine-discovery-catalog-runtime.js',
  analytics_chairman:'analytics-chairman-runtime.js',
  analytics_stats:'command-center-resilient-worker.js',
  analytics_owner_exclusion:'ga4-owner-exclusion-runtime.js',
  analytics_attribution_24h:'ga4-attribution-24h-worker.js',
  d1_read_budget:'d1-read-budget-worker.js',
  google_analytics_callback:'command-center-ga4-worker.js',
  gsc_trend_surface:'gsc-command-center-visible-worker.js',
  public_canonical_surface:'command-center-light-theme-worker.js',
  visitor_integrity:'visitor-integrity-worker.js',
  traffic_integrity_live:'traffic-integrity-live-worker.js',
  traffic_integrity_guard:'traffic-integrity-guard-worker.js',
  owner_exclusion:'owner-exclusion-worker.js',
  traffic_integrity_core:'traffic-integrity-worker.js',
  analytics_human_actions:'analytics-human-actions-runtime.js',
  analytics_human_actions_mutation:'human-action-entry-worker.js',
  public_decision:'public-decision-runtime.js',
  public_navigation:'public-navigation-runtime.js',
  affiliate_redirect:'affiliate-redirect-runtime.js'
};
const directOwnerDdlFiles=[...new Set(EARLY_DISPATCH_OWNERS.map(owner=>directOwnerFiles[owner]).filter(Boolean).filter(file=>runtimeDdlFiles.includes(file)))];
const directGroups=ROUTE_GROUPS.filter(group=>group.owner==='compute_router'||EARLY_DISPATCH_OWNERS.includes(group.owner));
const legacyDeclaredGroups=ROUTE_GROUPS.filter(group=>!directGroups.includes(group));
const routeCoveragePct=ROUTE_GROUPS.length?Number((directGroups.length/ROUTE_GROUPS.length*100).toFixed(1)):0;
const unexpectedLegacyGroups=legacyDeclaredGroups.map(x=>x.id).filter(id=>!ALLOWED_LEGACY_GROUPS.has(id));

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
  policy:{maxLegacyEdges:MAX_LEGACY_EDGES,minDirectRouteCoveragePct:MIN_DIRECT_ROUTE_COVERAGE_PCT,allowedLegacyGroups:[...ALLOWED_LEGACY_GROUPS],mustNotIncrease:true,target:'progressively replace decorator traversal with explicit owner dispatch',directOwnersMustBeMigrationOnly:true}
};

fs.mkdirSync(path.join(ROOT,'reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'reports','runtime-architecture-audit.json'),JSON.stringify(report,null,2)+'\n');
const ok=edges<=MAX_LEGACY_EDGES&&directOwnerDdlFiles.length===0&&routeCoveragePct>=MIN_DIRECT_ROUTE_COVERAGE_PCT&&unexpectedLegacyGroups.length===0;
console.log(JSON.stringify({ok,edges,files:chain.length,terminus,directOwners,routeCoveragePct,directGroups:directGroups.length,declaredGroups:ROUTE_GROUPS.length,legacyGroups:legacyDeclaredGroups.map(x=>x.id),unexpectedLegacyGroups,runtimeDdlFiles:runtimeDdlFiles.length,directOwnerDdlFiles},null,2));
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


if(routeCoveragePct<MIN_DIRECT_ROUTE_COVERAGE_PCT){
  console.error('Direct route coverage fell below the ToolScout 2.0 Phase 2 floor: '+routeCoveragePct+' < '+MIN_DIRECT_ROUTE_COVERAGE_PCT);
  process.exitCode=1;
}
if(unexpectedLegacyGroups.length){
  console.error('Unexpected legacy route groups: '+unexpectedLegacyGroups.join(', '));
  process.exitCode=1;
}
