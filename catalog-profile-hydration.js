// Opt-in D1 hydration of the existing audited ToolScout 2.0 profile shell.
// Pure presentation helper, not another catalog or editorial engine.
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
const paragraph=value=>escapeHtml(String(value??'').trim());
const safeItems=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.trim()).slice(0,30):[];
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&!Number.isNaN(Date.parse(value));
function freePlanAnswer(tool){
  if(tool.freePlanKnown===false||!tool.pricingDetails?.freePlanStatus||tool.pricingDetails.freePlanStatus==='unverified'||tool.pricingDetails.freePlanStatus==='unknown')
    return 'ToolScout has not verified the current free-plan position. Verify pricing and plan limits before committing.';
  if(tool.freePlan===true)return 'Manufacturer documentation records a free plan. Check the published usage limits and eligibility for your intended workflow.';
  return 'The verified ToolScout record does not include a free plan. Check the manufacturer for any revised offers.';
}
function updateStructuredData(script,tool,faq){
  let nodes;
  try{nodes=JSON.parse(script)}catch{return null}
  if(!Array.isArray(nodes))return null;
  const web=nodes.find(x=>x?.['@type']==='WebPage'),app=web?.about;
  if(app?.['@type']!=='SoftwareApplication')return null;
  app.description=tool.description;
  app.applicationCategory=tool.category;
  app.featureList=[...safeItems(tool.features)];
  const questions=nodes.find(x=>x?.['@type']==='FAQPage')?.mainEntity||[];
  for(const question of questions){
    if(!question?.acceptedAnswer)continue;
    if(question.name==='What is '+tool.name+' best for?')question.acceptedAnswer.text=faq.bestFor;
    if(question.name==='Does '+tool.name+' have a free plan?')question.acceptedAnswer.text=faq.free;
    if(question.name==='How current is this '+tool.name+' profile?')question.acceptedAnswer.text=faq.date;
  }
  return JSON.stringify(nodes).replace(/</g,'\\u003c');
}
export function hydrateLegacyCatalogProfile(html,tool){
  if(typeof html!=='string'||!tool||!tool.slug||!tool.name||!tool.description||!tool.category)return null;
  // A legacy product whose catalog category is still under review must retain
  // its existing visible warning and cannot be promoted into a confident profile.
  if(tool.categoryReviewRequired===true)return null;
  const review=tool.editorialReview;
  if(!review||typeof review!=='object'||!review.summary||!review.buyerCheck)return null;
  if(!validDate(review.reviewedAt)||!validDate(tool.lastVerified)||!safeItems(tool.bestFor).length||!safeItems(tool.features).length||!tool.pricing)return null;
  const faq={
    bestFor:tool.name+' is recorded in the ToolScout catalog for '+safeItems(tool.bestFor).join(', ')+'.',
    free:freePlanAnswer(tool),
    date:'The source data for this profile was last checked '+tool.lastVerified+'. Vendor pricing and capabilities can change.'
  };
  const replacements=[
    [/<p class="lead">[\s\S]*?<\/p>/,'<p class="lead">'+paragraph(tool.description)+'</p>'],
    [/<section class="editorialIntro"><div class="eyebrow">ToolScout view<\/div><p>[\s\S]*?<\/p>/,
      '<section class="editorialIntro"><div class="eyebrow">ToolScout view</div><p>'+paragraph(review.summary)+'</p>'],
    [/<div class="editorialBuyerCheck"><strong>Before you choose:<\/strong>[\s\S]*?<span class="small">Editorial assessment [\s\S]*?<\/span><\/div>/,
      '<div class="editorialBuyerCheck"><strong>Before you choose:</strong> '+paragraph(review.buyerCheck)+
      ' <span class="small">Editorial assessment '+paragraph(review.reviewedAt)+'. First-party documentation informed this editorial assessment.</span></div>'],
    [/<h2>Best for<\/h2><ul>[\s\S]*?<\/ul>/,
      '<h2>Best for</h2><ul>'+safeItems(tool.bestFor).map(x=>'<li>'+paragraph(x)+'</li>').join('')+'</ul>'],
    [/<h2>Key capabilities<\/h2><div class="chips">[\s\S]*?<\/div>/,
      '<h2>Key capabilities</h2><div class="chips">'+safeItems(tool.features).map(x=>'<span>'+paragraph(x)+'</span>').join('')+'</div>'],
    [/<h2>Pricing at a glance<\/h2><p>[\s\S]*?<\/p>/,
      '<h2>Pricing at a glance</h2><p>'+paragraph(tool.pricing)+'</p>'],
    [/<p><strong>Free plan recorded:<\/strong>[\s\S]*?<\/p>/,
      '<p><strong>Free plan recorded:</strong> '+(tool.freePlanKnown===false?'Unknown':tool.freePlan===true?'Yes':'No')+'</p>'],
    [/<p><strong>Category:<\/strong>[\s\S]*?<\/p>/,
      '<p><strong>Category:</strong> '+paragraph(tool.category)+'</p>'],
    [/<div class="eyebrow">Independent [^<]+ software profile<\/div>/,
      '<div class="eyebrow">Independent '+paragraph(tool.category)+' software profile</div>']
  ];
  // Fail closed: no hybrid half-updated document when markup drifts.
  if(!replacements.every(([pattern])=>pattern.test(html)))return null;
  let out=html;
  for(const [pattern,value] of replacements)out=out.replace(pattern,value);
  const faqRegex=/<details><summary>(What is |Does |How current is )[^<]+<\/summary><p>[\s\S]*?<\/p><\/details>/g;
  let faqCount=0;
  out=out.replace(faqRegex,match=>{
    const title=match.match(/<summary>([^<]+)<\/summary>/)?.[1]||'';
    let answer=null;
    if(title==='What is '+tool.name+' best for?')answer=faq.bestFor;
    else if(title==='Does '+tool.name+' have a free plan?')answer=faq.free;
    else if(title==='How current is this '+tool.name+' profile?')answer=faq.date;
    if(!answer)return match;
    faqCount++;
    return '<details><summary>'+title+'</summary><p>'+paragraph(answer)+'</p></details>';
  });
  if(faqCount!==3)return null;
  let schemaUpdated=false;
  out=out.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (match,serialized)=>{
    const updated=updateStructuredData(serialized,tool,faq);
    if(!updated)return match;
    schemaUpdated=true;
    return '<script type="application/ld+json">'+updated+'</script>';
  });
  if(!schemaUpdated)return null;
  // Preserve canonical, editorial shell, comparisons, /go/ routes and CSS.
  out=out.replace(/Source data last checked \d{4}-\d{2}-\d{2}/g,'Source data last checked '+paragraph(tool.lastVerified));
  return out;
}
