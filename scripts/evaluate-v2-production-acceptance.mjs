import fs from 'node:fs';
import {evaluateIntegrityPayload} from './evaluate-v2-integrity-audit.mjs';

const rows=(payload,index)=>(payload[index]&&Array.isArray(payload[index].results)?payload[index].results:[]);
const one=(payload,index)=>rows(payload,index)[0]||{};
const fail=(message,evidence)=>{throw new Error(message+': '+JSON.stringify(evidence))};

export function evaluateProductionAcceptance(payload){
  const integrity=evaluateIntegrityPayload(payload);
  const acceptance=one(payload,8);

  if(Number(acceptance.unsupported_search_contracts||0)!==0){
    fail('unsupported active search execution contracts',acceptance);
  }
  if(Number(acceptance.stale_stalled_contracts||0)!==0){
    fail('stalled execution contracts older than six hours',acceptance);
  }
  if(Number(acceptance.search_execution_state_without_evidence||0)!==0){
    fail('active search execution state missing source evidence timestamp',acceptance);
  }

  return {
    ok:true,
    release:'toolscout-2.0-final',
    releasePhase:260,
    integrity,
    acceptance
  };
}

const inputPath=process.argv[2]||'phase260-acceptance.json';
const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
console.log(JSON.stringify(evaluateProductionAcceptance(payload),null,2));
