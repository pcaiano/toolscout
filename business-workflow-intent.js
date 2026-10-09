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

// Industry is context, never proof that a generic catalog tool runs its specialist operations.
// New sectors can be admitted by extending this compact ontology, not by creating a new engine.
const SECTORS=[
  ['short_term_rentals','short-term rental business',/\b(airbnb|short.term rental|vacation rental|holiday rental|rental property|alojamento local|arrendamento turistico|holiday let)\b/,['crm','tasks','automation','forms'],['Vacation-rental PMS, booking-channel synchronisation and reservations']],
  ['restaurants','restaurant or café',/\b(restaurants?|restaurantes?|cafes?|cafetarias?|bistros?|bars?|takeaways?|food trucks?|pizzerias?|pastelarias?)\b/,['tasks','crm','marketing','automation'],['Restaurant POS, table booking, kitchen and stock management']],
  ['architecture','architecture or design practice',/\b(architects?|architecture|arquitetos?|arquitetura|interior design studio|engineering firm|engenharia)\b/,['tasks','crm','forms','automation'],['BIM/CAD, cost estimation and drawing approval']],
  ['marketing_agencies','marketing agency',/\b(marketing (?:agenc(?:y|ies)|company|business|firm)|agencia de marketing|agência de marketing|digital agenc(?:y|ies)|creative (?:agency|studio)|advertising (?:agency|firm))\b/,['tasks','social','seo','analytics'],['Media buying, cross-client billing and agency profitability']],
  ['healthcare','healthcare practice',/\b(clinics?|clinicas?|clínicas?|dentists?|dental practice|medical practice|healthcare practice|physiotherap(?:y|ist)|fisioterapia|veterinary|veterinaria)\b/,['tasks','crm','forms','automation'],['Clinical records, patient appointments, privacy and regional compliance']],
  ['legal','law firm',/\b(law firms?|lawyers?|legal practice|advogados?|advogadas?|escritorio de advocacia)\b/,['tasks','crm','forms','automation'],['Case management, legal billing and privilege']],
  ['accounting','accounting practice',/\b(account(?:ancy|ing|ants?) (?:business|firm|practice)|bookkeeping|contabilistas?|contabilidade)\b/,['tasks','crm','forms','automation'],['Certified accounting, payroll and local tax filings']],
  ['real_estate','real-estate business',/\b(real estate (?:agenc(?:y|ies)|business|brokerage|company)|imobiliarias?|imobiliárias?|mediacao imobiliaria|mediação imobiliária|property brokerage)\b/,['crm','tasks','forms','marketing'],['Listing portals, property feeds and transactional compliance']],
  ['retail','retail shop',/\b(retail (?:store|shop|business)|shops?|lojas?|boutiques?|supermarkets?|grocery stores?|pet shops?)\b/,['ecommerce','crm','marketing','automation'],['In-store POS, stocktaking and physical inventory']],
  ['ecommerce','online store',/\b(e.?commerce (?:store|business|company)|online (?:shop|store|business)|loja online|shopify store)\b/,['ecommerce','marketing','analytics','support'],['Warehousing, fulfilment and sales tax']],
  ['construction','construction or trades business',/\b(construction (?:company|business|firm)|construtoras?|construcao civil|construção civil|contractors?|plumb(?:er|ing)|electricians?|eletricistas?|landscaping|jardinagem)\b/,['tasks','crm','forms','automation'],['Field dispatch, job costing and site compliance']],
  ['education','education business',/\b(schools?|escolas?|academ(?:y|ies)|training (?:company|business|centre|center)|escola de formacao|education business|tutoring|explicacoes)\b/,['tasks','forms','marketing','automation'],['Learning management, enrolment and student privacy']],
  ['fitness','fitness studio',/\b(gyms?|ginasios?|ginásios?|pilates studio|yoga studio|fitness (?:studio|business|company)|personal training business)\b/,['crm','marketing','forms','tasks'],['Class scheduling, recurring billing and entry control']],
  ['beauty','beauty or personal-care studio',/\b(salons?|saloes?|salões?|hairdressers?|barbershops?|barbearias?|beauty (?:studio|business|clinic)|spas?|nail studio)\b/,['crm','forms','marketing','tasks'],['Appointment deposits, booking and point of sale']],
  ['hospitality','hotel or hospitality venue',/\b(hotels?|hoteis|hotéis|hostels?|guesthouses?|pousadas?|resorts?)\b/,['crm','tasks','marketing','forms'],['Hotel PMS, rates and booking-channel distribution']],
  ['logistics','logistics business',/\b(logistics|logistica|logística|transport (?:business|company)|transportadora|delivery (?:business|company)|couriers?|warehous(?:e|ing)|armazens?)\b/,['tasks','crm','analytics','automation'],['Fleet tracking, WMS and delivery evidence']],
  ['manufacturing','manufacturing business',/\b(manufactur(?:er|ing)|fabrica|fábrica|factory|industrial company|production plant)\b/,['tasks','analytics','automation','crm'],['ERP/MRP, quality assurance and materials traceability']],
  ['nonprofits','nonprofit organisation',/\b(nonprofits?|non.profits?|charit(?:y|ies)|associac(?:ao|oes)|associações?|ngos?|fundacoes?|fundações?)\b/,['crm','marketing','forms','tasks'],['Donor CRM, fundraising compliance and grants']],
  ['consulting','consultancy',/\b(consultanc(?:y|ies)|consulting (?:company|business|firm)|consultoria|consultores?|professional services? firm)\b/,['tasks','crm','forms','automation'],['Time billing, engagement profitability and client contracts']],
  ['technology','software or IT business',/\b(software (?:company|business|agency|studio)|it (?:business|company|services|consultancy)|startups?|tech (?:company|business)|saas (?:company|business))\b/,['tasks','developer','analytics','support'],['Security, software delivery and incident management']],
  ['events','events business',/\b(event (?:management|planning|company|agency|business)|organizadores? de eventos|wedding planner)\b/,['tasks','crm','forms','marketing'],['Ticketing, seating and vendor contracts']],
  ['travel','travel agency',/\b(travel (?:agency|business|company)|tour operators?|agencias? de viagens|agências? de viagens)\b/,['crm','tasks','marketing','forms'],['Travel booking systems, settlements and itinerary management']],
  ['agriculture','farming business',/\b(farms?|farming (?:business|company)|agriculture|agricultural business|quinta agricola|exploracao agricola)\b/,['tasks','analytics','crm','automation'],['Farm planning, crops, livestock and traceability']]
];
const JOBS={
  crm:['Customers and sales','CRM to manage customer enquiries, relationships and sales follow-ups','Customer records and pipelines; not specialist booking or regulated patient records'],
  tasks:['Projects and team operations','project management software for tasks, team coordination and delivery','Work coordination, not a sector-specific operational platform'],
  automation:['Business process automation','workflow automation software to connect apps and reduce manual admin','Named integrations and limits need vendor verification'],
  forms:['Forms and customer intake','form builder software to collect enquiries and onboarding data','Forms, not regulated records or specialist booking engines'],
  marketing:['Email marketing','email marketing software for customer campaigns and retention','Campaign workflows, not a universal business management suite'],
  social:['Social publishing','social media management and scheduling software','Channel scheduling; individual platform permissions need validation'],
  seo:['Search visibility','SEO software for keyword research and site performance','Search and content research, not a full advertising platform'],
  analytics:['Reporting and analytics','web and product analytics software for measuring digital performance','Digital measurement, not certified financial reports'],
  ecommerce:['Online sales','ecommerce platform for online storefronts and checkout','Online selling, not certified in-store POS or full inventory accounting'],
  developer:['Engineering tools','developer software for coding and deployment workflows','Software development, not managed hosting or IT compliance'],
  support:['Customer support','customer support helpdesk software for tickets and enquiries','Helpdesk cases, not a full order management system']
};
const GENERAL=['crm','tasks','marketing','automation'];
const clean=v=>normalize(v).replace(/[\u2013\u2014]/g,'-').trim();
export function interpretBusinessIndustry(query){
  const q=clean(query),hit=SECTORS.find(x=>x[2].test(q));
  if(hit)return{id:hit[0],label:hit[1],roles:hit[3],specialist:hit[4]};
  return /\b(business|businesses|company|companies|firm|enterprise|negocio|negocios|empresa|empresas|agency|agencia|agência|practice|studio)\b/.test(q)
    ?{id:'other_business',label:'business',roles:GENERAL,specialist:[]}:null;
}
function specificJob(query,profile){
  if(profile?.goal)return true;
  // "marketing agency" and "software company" describe sectors, not email
  // marketing or coding jobs. Explicit task phrases win over the sector.
  const q=clean(query).replace(/\b(?:marketing|advertising|software|digital)\s+(?:agenc(?:y|ies)|company|business|firm|studio)\b/g,'')
    .replace(/\b(?:agencia|agência|empresa)\s+de\s+marketing\b/g,'');
  return /\b(crm|seo|lead generation|lead capture|project management|task management|booking app|appointment scheduling|point of sale|pos software|inventory software|website builder|web analytics|analytics dashboard|email marketing|marketing automation|social media (?:management|scheduling)|newsletter|payment processing|form builder|survey software|customer support|helpdesk|ticketing|workflow automation|automation software|ecommerce platform|bim|cad|accounting software|payroll software)\b/.test(q);
}
function broadQuestion(query,industry){
  if(!industry)return false;
  const q=clean(query);
  const software=/\b(software|tools?|platforms?|apps?|applications?|systems?|solu[cç][aã]o|solucoes|programas?|best|melhor|which|what|qual|quais|recommend|recomenda|need|preciso)\b/.test(q);
  const purpose=/\b(manag(?:e|ing|ement)|run(?:ning)?|operat(?:e|ing|ions)|gerir|gestao|gestão|administrar|organizar|grow|melhor|best|which|what|qual|quais|recommend|recomenda|need|preciso)\b/.test(q);
  return software&&purpose;
}
export function businessWorkflowGuidance(query,profile={},tools=[]){
  const sector=interpretBusinessIndustry(query);
  if(!broadQuestion(query,sector)||specificJob(query,profile))return null;
  if(sector.id==='short_term_rentals'&&verifiedPmsCandidates(tools).length)return null;
  const eligible=(Array.isArray(tools)?tools:[]).filter(t=>t?.rankingEligible!==false&&t?.categoryReviewRequired!==true
    &&t?.editorialReview?.verificationStatus==='vendor_documented');
  const workflows=sector.roles.map(key=>{
    const [title,job,scope]=JOBS[key];
    const category=key==='tasks'?'business':key;
    const covered=eligible.filter(t=>t.category===category).length;
    return{title,job,scope,category,catalog_coverage:covered,availability:covered?'category_available':'catalog_gap',
      finder_url:'https://trytoolscout.org/?q='+encodeURIComponent(job)+'&source=ai-agent#finder',
      evidence_scope:'Category coverage, not documented suitability for this specific industry.'};
  });
  const rental=sector.id==='short_term_rentals';
  return {
    title:rental?'Managing a short-term rental business needs more than one software job.':'Choose what to improve in your '+sector.label+'.',
    explanation:rental
      ?'ToolScout does not currently have a manufacturer-verified end-to-end vacation-rental PMS in its catalog. It can help assess the workflows below, but cannot yet recommend a channel manager or property management suite.'
      :'A business has several different software jobs. Pick the operation to improve before comparing products. General software category coverage does not prove specialized operational fit.',
    industry:sector.id,industry_label:sector.label,specialist_requirements:sector.specialist,
    finder_url:'https://trytoolscout.org/?q='+encodeURIComponent(query)+'&source=ai-agent#finder',
    workflows,decision_status:'needs_workflow_selection',decision_scope:'industry_workflows_not_product_winners',
    next_step:'Choose a workflow and specify budget, team size, required integrations and must-have capabilities.',
    catalog_coverage:{covered_workflows:workflows.filter(w=>w.catalog_coverage>0).length,total_workflows:workflows.length},
    catalog_scale_note:'Catalog coverage is not exhaustive; unlisted products and capabilities may exist.'
  };
}
