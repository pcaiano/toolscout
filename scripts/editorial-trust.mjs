const DAY=86400000;
const LEGACY_SYNTHETIC_MODES=new Set(['auto_generated_official_source','generic_category_profile','synthetic_category_profile']);

const asDate=value=>{const t=Date.parse(String(value||''));return Number.isFinite(t)?t:null;};
const ageDays=value=>{const t=asDate(value);return t===null?null:Math.max(0,Math.floor((Date.now()-t)/DAY));};
const isHttps=value=>{try{return new URL(String(value||'')).protocol==='https:';}catch{return false;}};

export function editorialTrust(tool,freshnessEntry=null,{maxFactualAgeDays=45,strictSource=false,maxSourceCheckAgeDays=10}={}){
  const reasons=[];
  const mode=String(tool?.provenance?.mode||'');
  if(!tool?.slug||!tool?.name)reasons.push('missing_identity');
  if(!isHttps(tool?.sourceUrl))reasons.push('missing_or_non_https_official_source');
  if(LEGACY_SYNTHETIC_MODES.has(mode))reasons.push('synthetic_editorial_profile');
  const factualAge=ageDays(tool?.lastVerified||tool?.sourceCheckedOn);
  if(factualAge===null)reasons.push('missing_factual_review_date');
  else if(factualAge>maxFactualAgeDays)reasons.push(`factual_review_stale_${factualAge}d`);
  if(freshnessEntry){
    const sourceStatus=String(freshnessEntry.sourceStatus||'');
    if(sourceStatus==='broken'||sourceStatus==='missing')reasons.push(`official_source_${sourceStatus}`);
    if(Number(freshnessEntry.brokenConsecutive||0)>0)reasons.push('official_source_recently_broken');
    if(strictSource){
      if(sourceStatus!=='ok')reasons.push(`strict_source_not_ok_${sourceStatus||'unknown'}`);
      const checkAge=ageDays(freshnessEntry.sourceCheckedAt);
      if(checkAge===null||checkAge>maxSourceCheckAgeDays)reasons.push('strict_source_check_stale');
    }
  }else if(strictSource){
    reasons.push('strict_source_state_missing');
  }
  return {trusted:reasons.length===0,reasons,factualAgeDays:factualAge,sourceStatus:freshnessEntry?.sourceStatus||null,sourceCheckedAt:freshnessEntry?.sourceCheckedAt||null};
}

export function trustedToolSet(tools,freshnessState,options={}){
  const state=freshnessState?.tools||{};
  return (tools||[]).filter(tool=>editorialTrust(tool,state[tool.slug]||null,options).trusted);
}

export {ageDays};
