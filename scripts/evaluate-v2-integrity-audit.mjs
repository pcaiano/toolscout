import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const MISSION_CADENCE_LIMITS=Object.freeze({
  'growth:execution_contract':45,
  'growth:opportunity_coordination':45,
  'growth:self_audit':90,
  'distribution:autonomous_cycle':45,
  'distribution:economic_learning':45,
  'distribution:network_cycle':150,
  'distribution:authority_execution_recovery':120,
  'seo_geo_aio:execution_batch_v2':45,
  'affiliate:coverage_cycle':780,
  'catalog:runtime_quality':480,
  'catalog:runtime_coverage':1560
});

const rows=(payload,index)=>(payload[index]&&Array.isArray(payload[index].results)?payload[index].results:[]);
const one=(payload,index)=>rows(payload,index)[0]||{};
const fail=(message,evidence)=>{throw new Error(message+': '+JSON.stringify(evidence))};
const nullableNumber=value=>value===null||value===undefined||value===''?null:Number(value);

export function evaluateIntegrityPayload(payload,{runningGraceMinutes=30}={}){
  if(!Array.isArray(payload))throw new Error('integrity payload must be an array');

  const coverage=one(payload,0);
  if(Number(coverage.missing_contracts||0)!==0)fail('active actions without execution contracts',coverage);
  if(Number(coverage.missing_executors||0)!==0)fail('execution executor mapping gap',coverage);

  const orphan=one(payload,1);
  if(Number(orphan.orphan_nonterminal_contracts||0)!==0)fail('orphan nonterminal contracts',orphan);

  const architecture=one(payload,2);
  if(Number(architecture.architecture_incidents_open||0)!==0)fail('open architecture incidents',architecture);

  const compute=one(payload,3);
  if(Number(compute.stale_compute_leases||0)!==0)fail('stale compute leases',compute);

  const gates=one(payload,4);
  if(Number(gates.invalid_human_gates||0)!==0)fail('human gates conflict with terminal surface truth',gates);

  const missionRows=rows(payload,5);
  const seen=new Set();
  for(const row of missionRows){
    const key=row.engine+':'+row.mission;
    const limit=MISSION_CADENCE_LIMITS[key];
    if(limit===undefined)continue;
    seen.add(key);

    const status=String(row.status||'');
    const age=nullableNumber(row.age_minutes);
    const completedAge=nullableNumber(row.completed_age_minutes);

    if(status==='running'){
      if(age===null||!Number.isFinite(age)||age>runningGraceMinutes)fail('critical mission appears stuck',row);
      if(completedAge===null||!Number.isFinite(completedAge))fail('critical mission has no completed baseline',row);
      if(completedAge>limit+runningGraceMinutes)fail('critical mission previous completion outside cadence',row);
      continue;
    }

    if(status!=='completed')fail('critical mission not completed',row);
    if(age===null||!Number.isFinite(age)||age>limit)fail('critical mission outside cadence',row);
  }

  for(const key of Object.keys(MISSION_CADENCE_LIMITS)){
    if(!seen.has(key))fail('critical mission missing',{key});
  }

  const supply=one(payload,6);
  if(Number(supply.diversified_sources||0)<=0)fail('Contact Supply diversified source pool missing',supply);

  return {
    ok:true,
    coverage,
    compute,
    contactSupply:supply,
    sourceSnapshot:one(payload,7),
    missions:missionRows.map(x=>({
      engine:x.engine,
      mission:x.mission,
      age_minutes:x.age_minutes,
      completed_age_minutes:x.completed_age_minutes,
      status:x.status
    }))
  };
}

const isMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
  const inputPath=process.argv[2]||'integrity.json';
  const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  console.log(JSON.stringify(evaluateIntegrityPayload(payload),null,2));
}
