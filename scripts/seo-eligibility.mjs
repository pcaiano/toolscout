const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set(['best','tool','tools','software','for','with','and','the','a','an','to','of','platform','platforms','small','business','team','teams','agency','agencies','consultant','consultants','real','estate','free','affordable']);

const CAPABILITY_RULES = {
  'best-email-marketing-tools': ['email marketing','newsletter','newsletters','email campaign','email campaigns'],
  'best-marketing-automation-tools': ['marketing automation','lead nurturing','campaign automation'],
  'best-funnel-builder': ['funnel','funnels'],
  'best-ai-ad-creative-tools': ['ad creative','ad creatives','advertising creative','advertising creatives','creative generation','ad generation'],
  'best-keyword-research-tools': ['keyword research','keyword','keywords','search volume'],
  'best-seo-tools-for-agencies': ['seo','keyword','keywords','backlink','backlinks','search visibility'],
  'best-competitor-seo-tools': ['competitor','competitors','competitive research','backlink','backlinks','seo'],
  'best-workflow-automation-tools': ['workflow automation','automation','integrations'],
  'best-no-code-automation-tools': ['no code','no-code','visual automation','workflow builder'],
  'best-lead-capture-forms': ['lead capture','form builder','forms','form'],
  'best-forms-for-small-business': ['form builder','forms','form'],
  'best-project-management-tools': ['project management','project planning','task management','projects','project'],
  'best-free-project-management-tools': ['project management','project planning','task management','projects','project'],
  'best-sales-prospecting-tools': ['sales prospecting','prospecting','lead database','b2b leads','sales intelligence'],
  'best-cold-email-tools': ['cold email','email outreach','sales engagement','outbound email','email sequences'],
  'best-customer-support-tools': ['customer support','helpdesk','ticketing','customer service'],
  'best-social-media-management-tools': ['social media','social scheduling','social analytics','social publishing'],
  'best-website-builders': ['website builder','site builder','web design','website','websites'],
  'best-product-analytics-tools': ['product analytics','funnels','funnel','retention','session replay','user behavior'],
  'best-ai-research-tools': ['research','web research','source synthesis','grounded answers'],
  'best-ai-assistants': ['ai assistant','ai assistants','chatbot','chatbots','assistant','assistants'],
  'best-ai-coding-tools': ['coding','code editor','code assistant','code assistants','developer ai','coding agent','coding agents'],
  'best-developer-tools': ['developer','development','deployment','devops','code'],
  'best-ecommerce-platforms': ['ecommerce','online store','commerce','checkout','shopping cart'],
  'best-design-tools': ['design','graphic design','ui design','prototype','prototyping'],
  'best-video-content-tools': ['video','videos','screen recording','video editing','podcast editing']
};

const COMPOUND_CAPABILITY_RULES = {
  'best-ai-marketing-tools': {
    groups: [['ai','artificial intelligence','machine learning']],
    minimumGroups: 1
  },
  'best-ai-ad-creative-tools': {
    groups: [['ai','artificial intelligence','generative ai']],
    minimumGroups: 1
  },
  'best-ai-research-tools': {
    groups: [['ai','artificial intelligence','llm','large language model']],
    minimumGroups: 1
  },
  'best-ai-coding-tools': {
    groups: [['ai','artificial intelligence','coding agent','code assistant']],
    minimumGroups: 1
  },
  'best-crm-with-automation': {
    groups: [['automation','workflow automation','sales automation']],
    minimumGroups: 1
  },
  'best-all-in-one-business-tools': {
    groups: [
      ['crm','customer relationship','customer platform'],
      ['marketing','email marketing','campaign','campaigns'],
      ['automation','workflow','workflows'],
      ['sales','sales pipeline','deal management','lead management'],
      ['funnel','funnels','forms','form','landing page','landing pages']
    ],
    minimumGroups: 5
  }
};

const ATTRIBUTE_RULES = {
  'best-free-crm': tool => tool?.freePlan === true,
  'best-free-project-management-tools': tool => tool?.freePlan === true
};

function ruleKey(intent, rules) {
  if (intent?.slug && Object.prototype.hasOwnProperty.call(rules, intent.slug)) return intent.slug;
  if (intent?.parent && Object.prototype.hasOwnProperty.call(rules, intent.parent)) return intent.parent;
  return null;
}

function termMatch(normalizedText, rawTerm) {
  const term = normalize(rawTerm);
  if (!term) return false;
  return ` ${normalizedText} `.includes(` ${term} `);
}

export function toolText(tool) {
  return normalize([tool?.name, tool?.category, tool?.description, ...(tool?.features || []), ...(tool?.bestFor || [])].join(' '));
}

export function lexicalRelevance(tool, intent) {
  const text = toolText(tool);
  const slugWords = String(intent?.slug || '').replace(/^best-/, '').replace(/-/g, ' ');
  const phrases = [...(intent?.keywords || []), slugWords, intent?.title || ''].map(normalize).filter(Boolean);
  let score = 0;
  for (const phrase of phrases) if (phrase.includes(' ') && termMatch(text, phrase)) score += 3;
  const tokens = new Set(phrases.flatMap(x => x.split(' ')).filter(x => x.length >= 3 && !STOP.has(x)));
  const words = new Set(text.split(' '));
  for (const token of tokens) if (words.has(token)) score += 0.75;
  return score;
}

export function allowedCategories(intent) {
  const raw = Array.isArray(intent?.allowedCategories) && intent.allowedCategories.length
    ? intent.allowedCategories
    : [intent?.category];
  return [...new Set(raw.map(normalize).filter(Boolean))];
}

export function categoryMatch(tool, intent) {
  return allowedCategories(intent).includes(normalize(tool?.category));
}

export function capabilityTerms(intent) {
  const simpleKey = ruleKey(intent, CAPABILITY_RULES);
  const compoundKey = ruleKey(intent, COMPOUND_CAPABILITY_RULES);
  const simple = simpleKey ? CAPABILITY_RULES[simpleKey] : [];
  const compound = compoundKey ? COMPOUND_CAPABILITY_RULES[compoundKey].groups.flat() : [];
  return [...new Set([...simple, ...compound])];
}

export function capabilityAssessment(tool, intent) {
  const text = toolText(tool);
  const simpleKey = ruleKey(intent, CAPABILITY_RULES);
  const simpleTerms = simpleKey ? CAPABILITY_RULES[simpleKey] : [];
  const simpleMatch = !simpleTerms.length || simpleTerms.some(term => termMatch(text, term));

  const compoundKey = ruleKey(intent, COMPOUND_CAPABILITY_RULES);
  const compoundRule = compoundKey ? COMPOUND_CAPABILITY_RULES[compoundKey] : null;
  const groupMatches = compoundRule
    ? compoundRule.groups.map(group => group.some(term => termMatch(text, term)))
    : [];
  const matchedGroups = groupMatches.filter(Boolean).length;
  const compoundMatch = !compoundRule || matchedGroups >= Number(compoundRule.minimumGroups || compoundRule.groups.length);

  return {
    match: simpleMatch && compoundMatch,
    simpleMatch,
    compoundMatch,
    matchedGroups,
    minimumGroups: compoundRule ? Number(compoundRule.minimumGroups || compoundRule.groups.length) : 0,
    groupMatches,
    requiredCapabilities: capabilityTerms(intent)
  };
}

export function capabilityMatch(tool, intent) {
  return capabilityAssessment(tool, intent).match;
}

export function attributeMatch(tool, intent) {
  const key = ruleKey(intent, ATTRIBUTE_RULES);
  return key ? Boolean(ATTRIBUTE_RULES[key](tool)) : true;
}

export function editorialEligibility(tool, intent, minimumRelevance = 0.75) {
  const category = categoryMatch(tool, intent);
  const relevance = lexicalRelevance(tool, intent);
  const capability = capabilityAssessment(tool, intent);
  const attributes = attributeMatch(tool, intent);
  return {
    eligible: category && capability.match && attributes && relevance >= Number(minimumRelevance || 0),
    categoryMatch: category,
    capabilityMatch: capability.match,
    attributeMatch: attributes,
    relevance,
    allowedCategories: allowedCategories(intent),
    capabilityAssessment: capability,
    requiredCapabilities: capability.requiredCapabilities
  };
}

export function eligibleTools(tools, intent, minimumRelevance = 0.75) {
  return (tools || []).filter(tool => editorialEligibility(tool, intent, minimumRelevance).eligible);
}

export { normalize, termMatch };
