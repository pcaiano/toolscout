// Catalog Autonomy's manufacturer-documentation watch. This is a helper for the
// existing catalog runtime_quality mission, not a separate scheduler or engine.
// Source URLs, page fingerprints and editorial review evidence remain private.
const DOCUMENT_EVENT_TYPES=['catalog_docs_snapshot','catalog_docs_pending','catalog_docs_reset'];
function vendorHost(value){
  try{const u=new URL(value);return u.protocol==='https:'?u.hostname.toLowerCase().replace(/^www\./,''):''}catch{return''}
}
export function monitoredManufacturerDocuments(tool,{limit=2}={}){
  const home=vendorHost(tool?.sourceUrl),review=tool?.editorialReview||{},docs=[],seen=new Set();
  if(!home)return[];
  // Some original vendor brands use a different corporate documentation
  // hostname (for example ChatGPT and OpenAI). Trust only exact URLs already
  // recorded as first-party evidence by ToolScout's independent editorial review.
  const attested=new Set((Array.isArray(tool?.evidence)?tool.evidence:[])
    .filter(x=>x?.claimScope==='toolscout_editorial_review'&&/^\d{4}-\d{2}-\d{2}$/.test(String(x?.verifiedAt||''))&&x?.sourceUrl)
    .map(x=>x.sourceUrl));
  function add(url){
    if(typeof url!=='string'||seen.has(url))return;
    let u;try{u=new URL(url)}catch{return}
    const host=vendorHost(url);
    const atlassian=tool?.slug==='trello'&&(host==='atlassian.com'||host.endsWith('.atlassian.com'));
    if(!host||!(host===home||host.endsWith('.'+home)||atlassian||attested.has(url))||u.pathname==='/'||!u.pathname)return;
    seen.add(url);docs.push(url);
  }
  // Priority 1: direct pricing and plan entitlement evidence.
  add(tool?.pricingDetails?.sourceUrl);
  const claims=Array.isArray(tool?.decisionClaims)?tool.decisionClaims:[];
  for(const claim of claims.filter(x=>x?.status==='verified'&&['price_quote','plan_limit','price_eur_month'].includes(x?.type)))add(claim.sourceUrl);
  // Priority 2: other manufacturer-backed product and integration evidence.
  for(const url of Array.isArray(review.sourceUrls)?review.sourceUrls:[])add(url);
  for(const claim of claims.filter(x=>x?.status==='verified'))add(claim.sourceUrl);
  return docs.slice(0,Math.max(1,Math.min(2,Number(limit)||2)));
}
function eventData(row){try{return JSON.parse(row?.evidence_json||'{}')}catch{return{}}}
function previousEvidence(rows){
  const ix=rows.findIndex(x=>x.event_type==='catalog_docs_snapshot');
  const last=ix>=0?eventData(rows[ix]):null;
  const latest=rows[0]&&rows[0].event_type!=='catalog_docs_snapshot'?rows[0]:null;
  return{baseline:last,pending:latest?.event_type==='catalog_docs_pending'?eventData(latest):null};
}
export async function verifyManufacturerDocuments(env,tool,{fetchDocument,hash,writeEvent}){
  const sources=monitoredManufacturerDocuments(tool);
  if(!sources.length)return{status:'missing_first_party_documents',checked:0,changed:false};
  const observations=await Promise.all(sources.map(async url=>{
    let response;
    try{response=await fetchDocument(url)}catch{return{url,status:'network_warning'}}
    const final=vendorHost(response?.finalUrl||url),home=vendorHost(tool?.sourceUrl),documentHost=vendorHost(url);
    const redirectAllowed=final===documentHost||final.endsWith('.'+documentHost)||final===home||final.endsWith('.'+home)||(tool?.slug==='trello'&&(final==='atlassian.com'||final.endsWith('.atlassian.com')));
    return{url,status:response?.status==='ok'&&!redirectAllowed?'untrusted_redirect':response?.status||'network_warning',fingerprint:response?.fingerprint||null,documentText:response?.status==='ok'?String(response.documentText||'').slice(0,14000):''};
  }));
  if(observations.some(x=>x.status!=='ok'||!x.fingerprint))return{status:'documentation_warning',checked:observations.length,changed:false,
    warnings:observations.filter(x=>x.status!=='ok'||!x.fingerprint).map(x=>x.status)};
  const digest=await hash(observations.map(x=>x.url+'|'+x.fingerprint).join('\n'));
  const slug=String(tool.slug||'').toLowerCase();
  const rows=await env.DB.prepare("SELECT event_type,evidence_json FROM catalog_runtime_events WHERE tool_slug=? AND event_type IN ('catalog_docs_snapshot','catalog_docs_pending','catalog_docs_reset') ORDER BY created_at DESC,event_id DESC LIMIT 40").bind(slug).all();
  const prior=previousEvidence(rows.results||[]);
  const proof={fingerprint:digest,source_count:observations.length};
  // Full text stays only within this scheduled invocation. The durable ledger
  // receives fingerprints and derived claim changes, never scraped documents.
  const factualObservations=observations;
  if(!prior.baseline){
    await writeEvent(env,slug,'catalog_docs_snapshot','completed','Initial manufacturer-documentation fingerprint captured without modifying product claims.',proof);
    return{status:'baselined',checked:observations.length,changed:false,observations:factualObservations};
  }
  if(prior.baseline.fingerprint===digest){
    if(prior.pending)await writeEvent(env,slug,'catalog_docs_reset','completed','Provisional manufacturer-document change reverted on the next verification.',proof);
    return{status:'unchanged',checked:observations.length,changed:false,observations:factualObservations};
  }
  if(prior.pending?.fingerprint===digest){
    await writeEvent(env,slug,'catalog_docs_snapshot','completed','Two repeated manufacturer-document observations confirm a new fingerprint; this does not establish which facts changed.',proof);
    await writeEvent(env,slug,'catalog_docs_change_confirmed','completed','Manufacturer documentation changed twice; price, plan and feature claims require fresh first-party review before facts can be revised.',{...proof,review_required:true});
    return{status:'change_confirmed',checked:observations.length,changed:true,observations:factualObservations};
  }
  await writeEvent(env,slug,'catalog_docs_pending','deferred','A manufacturer document changed once; a second independent scheduled check is required.',proof);
  return{status:'pending_confirmation',checked:observations.length,changed:false,observations:factualObservations};
}
