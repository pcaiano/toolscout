// Shared, read-only buyer-intent decomposition for the Finder and AI Decision Engine.
const normalize=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
// Vendor-level reviews alone do not prove a full short-term-rental PMS.
// A specialist candidate needs two distinct dated first-party documents and
// named, claim-scoped evidence of both channel and reservation management.
export function verifiedPmsCandidates(tools=[]){
  const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&&Number.isFinite(Date.parse(d+'T00:00:00Z'))
    &&Date.parse(d+'T00:00:00Z')<=Date.now()&&Date.now()-Date.parse(d+'T00:00:00Z')<=180*86400000;
  return (Array.isArray(tools)?tools:[]).filter(t=>{
    if(t?.category!=='vacation-rental'||t.rankingEligible===false||t.categoryReviewRequired===true||
       t.editorialReview?.verificationStatus!=='vendor_documented')return false;
    let host;try{host=new URL(t.sourceUrl).hostname.replace(/^www\./,'')}catch{return false}
    const sourceOk=u=>{try{const h=new URL(u).hostname.replace(/^www\./,'');return h===host||h.endsWith('.'+host)}catch{return false}};
    const datedDocs=new Set((t.evidence||[]).filter(e=>e?.claimScope==='toolscout_editorial_review'
      &&sourceOk(e.sourceUrl)&&validDate(e.verifiedAt)).map(e=>e.sourceUrl));
    if(datedDocs.size<2)return false;
    const claims=(t.decisionClaims||[]).filter(c=>c?.type==='capability'&&c.status==='verified'
      &&sourceOk(c.sourceUrl)&&validDate(c.verifiedAt)).map(c=>normalize(c.value));
    return claims.includes('channel management')&&claims.includes('reservation management');
  });
}
// Industry-only questions need workflow decomposition before any catalog ranking.
// The catalog contains no verified end-to-end vacation-rental PMS. Never imply
// a CRM, booking form or team task app is a property/channel manager.
export function businessWorkflowGuidance(query,profile={},tools=[]){
  const q=normalize(query),hasSpecificJob=Boolean(profile.goal)
    ||/\b(crm|seo|marketing|automation|automate|workflow|email|newsletter|design|website builder|analytics|reporting|customer support|ticketing|forms|lead generation|project management|social media)\b/.test(q);
  if(hasSpecificJob)return null;
  const rental=/\b(airbnb|short.term rental|vacation rental|holiday rental|rental property|alojamento local|arrendamento turistico|holiday let|hospitality)\b/.test(q);
  const generalBusiness=/\b(manag(?:e|ing|ement)|run(?:ning)?|operat(?:e|ing|ions)|gerir|gestao|administrar|organizar|software para|software for|tools? for)\b/.test(q)
    &&/\b(business|company|empresa|negocio|restaurant|restaurante|shop|store|loja|clinic|clinica|practice|hotel|salon|agency|agencia|team|equipa)\b/.test(q);
  if(!rental&&!generalBusiness)return null;
  if(rental&&verifiedPmsCandidates(tools).length)return null;
  const workflows=rental?[
    {title:'Guest enquiries and relationships',job:'CRM to track guest enquiries and follow-ups',category:'crm',scope:'Guest communication workflows, not booking-channel synchronisation'},
    {title:'Cleaning and turnovers',job:'project management for recurring cleaning tasks and team handoffs',category:'business',scope:'Task coordination, not live occupancy or reservations'},
    {title:'Guest follow-up automation',job:'workflow automation for guest follow-ups',category:'automation',scope:'General automation; property booking integrations must be verified'},
    {title:'Guest intake forms',job:'form builder for guest intake and requests',category:'forms',scope:'Forms, not a guest booking engine'}
  ]:[
    {title:'Customers and sales',job:'CRM for managing customers and sales pipeline',category:'crm',scope:'Customer relationship management'},
    {title:'Team tasks and operations',job:'project management and task coordination for teams',category:'business',scope:'Projects and team operations'},
    {title:'Marketing and customer retention',job:'email marketing and customer follow-up',category:'marketing',scope:'Marketing communication'},
    {title:'Repetitive admin',job:'workflow automation between business apps',category:'automation',scope:'Automation requires verified integrations'}
  ];
  return {
    title:rental?'Managing a short-term rental business needs more than one software job.':'Which part of the business are you trying to improve?',
    explanation:rental?'ToolScout does not currently have a manufacturer-verified end-to-end vacation-rental PMS in its catalog. It can help assess the workflows below, but cannot yet recommend a channel manager or property management suite.':'A business involves several distinct jobs. Choose the workflow that matters most so ToolScout compares relevant software rather than an arbitrary cross-category ranking.',
    industry:rental?'short_term_rentals':'general_business',
    workflows
  };
}
