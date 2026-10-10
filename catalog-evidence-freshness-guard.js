// Existing Catalog Autonomy read-model guard for confirmed manufacturer changes.
// Never rewrite D1 originals, dated evidence or independent editorial text.
// A homepage or documented-source change says facts need reconfirmation, not
// that a vendor discontinued a feature, integration or plan.
export function holdUnreverifiedCatalogClaims(tool,state){
  if(!tool||state?.quality_status!=='change_detected'||!Number(state?.content_changed||0))return tool;
  const claims=Array.isArray(tool.decisionClaims)?
    tool.decisionClaims.map(claim=>claim?.status==='verified'?{...claim,status:'review_required'}:claim):tool.decisionClaims;
  const integrations=Array.isArray(tool.integrations)?
    tool.integrations.map(pair=>pair?.status==='verified'?{...pair,status:'review_required'}:pair):tool.integrations;
  const ai=tool.aiIntegration&&typeof tool.aiIntegration==='object'?{
    ...tool.aiIntegration,status:'unverified',tier:'unknown',mcp:'unknown',
    publicApi:null,assistants:[],
    summary:'Manufacturer documentation changed after the last factual review. ToolScout is re-verifying AI integration claims.',
  }:tool.aiIntegration;
  const pricingDetails=tool.pricingDetails&&typeof tool.pricingDetails==='object'?{
    ...tool.pricingDetails,freePlanStatus:'unverified'
  }:tool.pricingDetails;
  return {
    ...tool,
    decisionClaims:claims,
    integrations,
    aiIntegration:ai,
    pricingDetails,
    freePlanKnown:false,
    catalogFreshness:{
      status:'review_required',
      reason:'confirmed_manufacturer_document_change',
      decisive_claims_eligible:false,
      last_change_at:state.last_change_at||null
    }
  };
}
