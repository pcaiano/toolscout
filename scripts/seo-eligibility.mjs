const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['best','tool','tools','software','for','with','and','the','a','an','to','of','platform','platforms','small','business','team','teams','agency','agencies','consultant','consultants','real','estate','free','affordable']);

const CAPABILITY_RULES = {
  'best-email-marketing-tools': ['email marketing','newsletter','email campaign'],
  'best-marketing-automation-tools': ['marketing automation','lead nurturing','campaign automation','automation'],
  'best-funnel-builder': ['funnel'],
  'best-ai-ad-creative-tools': ['ad creative','advertising creative','creative generation','ad generation'],
  'best-keyword-research-tools': ['keyword research','keyword','search volume'],
  'best-seo-tools-for-agencies': ['seo','keyword','backlink','search visibility'],
  'best-competitor-seo-tools': ['competitor','competitive research','backlink','seo'],
  'best-workflow-automation-tools': ['workflow automation','automation','integrations'],
  'best-no-code-automation-tools': ['no code automation','workflow automation','automation','workflow builder'],
  'best-lead-capture-forms': ['lead capture','form builder','forms','form'],
  'best-forms-for-small-business': ['form builder','forms','form'],
  'best-project-management-tools': ['project management','project planning','task management','projects'],
  'best-free-project-management-tools': ['project management','project planning','task management','projects'],
  'best-sales-prospecting-tools': ['sales prospecting','prospecting','lead database','b2b leads','sales intelligence'],
  'best-cold-email-tools': ['cold email','email outreach','sales engagement','outbound email','email sequences'],
  'best-customer-support-tools': ['customer support','helpdesk','ticketing','customer service'],
  'best-social-media-management-tools': ['social media','social scheduling','social analytics','social publishing'],
  'best-website-builders': ['website builder','site builder','web design','website'],
  'best-product-analytics-tools': ['product analytics','funnels','retention','session replay','user behavior'],
  'best-ai-research-tools': ['research','web research','source synthesis','grounded answers'],
  'best-ai-assistants': ['ai assistant','chatbot','assistant'],
  'best-ai-coding-tools': ['coding','code editor','code assistant','developer ai','coding agent'],
  'best-developer-tools': ['developer','development','deployment','devops','code'],
  'best-ecommerce-platforms': ['ecommerce','online store','commerce','checkout','shopping cart'],
  'best-design-tools': ['design','graphic design','ui design','prototype'],
  'best-video-content-tools': ['video','screen recording','video editing','podcast editing']
};

export function toolText(tool) {
  return normalize([tool?.name, tool?.category, tool?.description, ...(tool?.features || []), ...(tool?.bestFor || [])].join(' '));
}

export function lexicalRelevance(tool, intent) {
  const text = toolText(tool);
  const slugWords = String(intent?.slug || '').replace(/^best-/, '').replace(/-/g, ' ');
  const phrases = [...(intent?.keywords || []), slugWords, intent?.title || ''].map(normalize).filter(Boolean);
  let score = 0;
  for (const phrase of phrases) if (phrase.includes(' ') && text.includes(phrase)) score += 3;
  const tokens = new Set(phrases.flatMap(x => x.split(' ')).filter(x => x.length >= 3 && !STOP.has(x)));
  const words = new Set(text.split(' '));
  for (const token of tokens) if (words.has(token)) score += 0.75;
  return score;
}

export function capabilityTerms(intent) {
  const key = intent?.parent && CAPABILITY_RULES[intent.parent] ? intent.parent : intent?.slug;
  return CAPABILITY_RULES[key] || [];
}

export function capabilityMatch(tool, intent) {
  const terms = capabilityTerms(intent);
  if (!terms.length) return true;
  const text = toolText(tool);
  return terms.some(term => text.includes(normalize(term)));
}

export function editorialEligibility(tool, intent, minimumRelevance = 0.75) {
  const categoryMatch = normalize(tool?.category) === normalize(intent?.category);
  const relevance = lexicalRelevance(tool, intent);
  const capability = capabilityMatch(tool, intent);
  return {
    eligible: categoryMatch && capability && relevance >= Number(minimumRelevance || 0),
    categoryMatch,
    capabilityMatch: capability,
    relevance,
    requiredCapabilities: capabilityTerms(intent)
  };
}

export function eligibleTools(tools, intent, minimumRelevance = 0.75) {
  return (tools || []).filter(tool => editorialEligibility(tool, intent, minimumRelevance).eligible);
}

export { normalize };
