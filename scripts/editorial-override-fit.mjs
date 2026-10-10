const normalized=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

/**
 * Editorial overrides name real products. If ranking changes, avoid publishing
 * stale commentary about products which no longer lead the actual shortlist.
 * The generator falls back to evidence-derived analysis until an override is
 * refreshed. Never change scoring or affiliate eligibility to fit old prose.
 */
export function editorialOverrideFitsShortlist(override,rankedTools=[]){
  if(typeof override!=='string'||!override.trim()||!Array.isArray(rankedTools)||rankedTools.length<2)return false;
  const prose=` ${normalized(override)} `;
  return rankedTools.slice(0,2).every(tool=>{
    const name=normalized(tool?.name);
    return name.length>0&&prose.includes(` ${name} `);
  });
}
