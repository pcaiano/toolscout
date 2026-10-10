// Conservative manufacturer-only numeric fact correction.
// Facts never change merely because source HTML changed. All proposed values
// must appear in the same explicit plan/allowance sentence, twice in a row.
function host(url){try{let u=new URL(url);return u.protocol==='https:'?u.hostname.replace(/^www\./,'').toLowerCase():''}catch{return''}}
const escRe=s=>String(s).replace(/[.*+?^$()|[\]{}]/g,'\\$&');
const validAmount=s=>{let n=Number(String(s).replace(/[, ](?=\d{3}\b)/g,''));return Number.isFinite(n)&&n>=0&&n<=1e9?n:null};
function vendorOwned(url,tool){
  const h=host(url),vendor=host(tool?.sourceUrl);
  const attested=(tool?.evidence||[]).some(x=>x.claimScope==='toolscout_editorial_review'&&x.sourceUrl===url);
  return Boolean(h&&vendor&&(h===vendor||h.endsWith('.'+vendor)||attested));
}
function eligibleSentence(s,plan,period,scope){
  if(!new RegExp('\\b'+escRe(plan)+'\\b(?:\\s+(?:plan|tier))?','i').test(s))return false;
  if(!/\b(includes?|offers?|supports?|allows?|provides?|costs?|priced at|up to|limited to|comes with)\b|:\s/i.test(s))return false;
  // Limits are not interchangeable across base, workspace, automation or
  // stored-contact scopes, even when they share a plan and unit.
  if(scope){
    const normalized=String(scope).toLowerCase().replace(/[^a-z0-9]+/g,'_');
    if(normalized==='per_base'&&!/\b(?:per|each)\s+base\b/i.test(s))return false;
    else if(normalized==='per_workspace'&&!/\b(?:per|each)\s+workspace\b/i.test(s))return false;
    else if(normalized==='automation'&&!/\bautomations?\b/i.test(s))return false;
    else if(normalized==='stored'&&(/\bautomations?\b/i.test(s)||/\b(?:per|each)\s+(?:workspace|base)\b/i.test(s)))return false;
    else if(!['per_base','per_workspace','automation','stored'].includes(normalized)&&
      !new RegExp('\\b'+escRe(normalized.replace(/_/g,' '))+'\\b','i').test(s))return false;
    if(normalized==='per_base'&&/\b(?:per|each)\s+workspace\b/i.test(s))return false;
    if(normalized==='per_workspace'&&/\b(?:per|each)\s+base\b/i.test(s))return false;
  }
  if(period==='month'&&!/\b(monthly|per month|each month)\b/i.test(s))return false;
  if(period==='day'&&!/\b(daily|per day|each day)\b/i.test(s))return false;
  if(period==='total'&&/\b(per month|monthly|per day|daily)\b/i.test(s))return false;
  if(/\b(save|discounts?|was|previously|promotions?|promotional|promos?|introductory|starting at|as low as|compared to|limited[ -]?time|temporary|temporarily|sale|coupon|trial)\b|\bspecial\s+offer\b/i.test(s))return false;
  return true;
}
function verifiedQuoteScope(sentence,claim){
  if(claim.market&&!['unspecified','global'].includes(claim.market))return false; // No inferred regional eligibility.
  const unit=String(claim.unit||'').toLowerCase();
  if(unit==='seat'){
    if(!/\bper\s+(?:(?:paid|core|billable)\s+)?(?:seat|user|collaborator)\b/i.test(sentence))return false;
  }else if(unit==='channel'){
    // Channel-priced subscriptions such as Buffer must not inherit seat or
    // entire-account prices; the vendor sentence must say "per channel".
    if(!/\bper\s+channel\b/i.test(sentence))return false;
  }else if(unit==='subscription'){
    if(/\bper\s+(?:(?:paid|core|billable)\s+)?(?:seat|user|collaborator|channel)\b/i.test(sentence))return false;
  }else return false; // Unknown quote units need editorial proof, not auto edits.
  if(claim.unitQuantity!==undefined&&claim.unitQuantity!==1)return false;
  if(claim.usageTier){
    const tier=claim.usageTier;
    if(!Number.isFinite(tier.quantity)||!tier.unit)return false;
    const singular=String(tier.unit).replace(/s$/i,'');
    const pat=new RegExp('\\b(\\d{1,3}(?:[, ]\\d{3})*|\\d+)\\s+'+escRe(singular)+'s?\\b','gi');
    const matches=[...sentence.matchAll(pat)];
    // An unqualified or differently sized package may not replace a priced tier.
    if(matches.length!==1||validAmount(matches[0][1])!==tier.quantity)return false;
    if(tier.period==='day'&&!/\b(?:per|each)\s+day\b|\bdaily\b/i.test(sentence))return false;
    if(tier.period==='year'&&!/\b(?:per|each)\s+year\b|\byearly\b/i.test(sentence))return false;
  }
  return true;
}
function explicitGlobalRetirement(text,feature){
  const needle=escRe(feature.trim());
  if(!needle||feature.trim().length<5||feature.trim().length>85)return false;
  // A colon, semicolon or comma can introduce "on Free" or "for one tier".
  // Accept only an unqualified, complete product-wide statement.
  const ending='\\s*$';
  const expression=new RegExp('^(?:we|our (?:product|platform|service)|the (?:product|platform|service))\\s+no longer (?:supports?|offers?|provides?|includes?)\\s+'+needle+ending+
    '|^'+needle+'\\s+(?:has been|is)\\s+(?:discontinued|retired|removed|no longer (?:available|supported))'+ending,'i');
  return String(text||'').replace(/\s+/g,' ').trim().split(/[.!?]/).some(sentence=>expression.test(sentence.trim()));
}
function claimKey(claim){
  return [claim.type,claim.value,claim.plan,claim.type==='plan_limit'?claim.unit:claim.currency,
    claim.type==='plan_limit'?claim.period:claim.billingCycle,claim.type==='plan_limit'?claim.scope:''].join('|');
}
export function manufacturerFactProposals(tool,observations=[]){
  const changes=[];
  for(const claim of tool?.decisionClaims||[]){
    if(claim?.status!=='verified'||!claim.sourceUrl||!vendorOwned(claim.sourceUrl,tool))continue;
    const doc=observations.find(x=>x.url===claim.sourceUrl&&x.status==='ok'&&typeof x.documentText==='string');
    if(!doc)continue;
    // Explicit worldwide product discontinuation only. A plan-specific
    // removal cannot establish global loss of a feature.
    if(claim.type==='capability'&&!claim.plan&&typeof claim.value==='string'&&
       (tool.features||[]).some(value=>String(value).toLowerCase()===claim.value.toLowerCase())&&
       explicitGlobalRetirement(doc.documentText,claim.value)){
      changes.push({claimKey:claimKey(claim),type:'capability_retired',oldValue:claim.value,newValue:'retired',sourceUrl:claim.sourceUrl});
    }
    if(!claim.plan)continue;
    // Keep paragraphs separated: mixing multiple plan tiers into one sentence
    // would make otherwise reasonable numerical extraction unsafe.
    const sentences=doc.documentText.replace(/\r/g,'\n').split(/[\n.!?]/).map(x=>x.trim()).filter(Boolean);
    const numbers=new Set();
    if(claim.type==='plan_limit'&&claim.unit&&Number.isFinite(claim.quantity)){
      const unit=String(claim.unit).replace(/s$/i,'');
      const pat=new RegExp('\\b(\\d{1,3}(?:[, ]\\d{3})*|\\d+)\\s+'+escRe(unit)+'s?\\b','ig');
      for(const sentence of sentences){
        if(!eligibleSentence(sentence,String(claim.plan),claim.period||'total',claim.scope||null))continue;
        const hits=[...sentence.matchAll(pat)];
        if(hits.length!==1)continue;
        const n=validAmount(hits[0][1]);if(n!==null)numbers.add(n);
      }
      if(numbers.size===1&&![...numbers].includes(claim.quantity))changes.push({
        claimKey:claimKey(claim),type:'plan_limit',oldValue:claim.quantity,newValue:[...numbers][0],sourceUrl:claim.sourceUrl});
    }
    if(claim.type==='price_quote'&&claim.billingCycle==='monthly'&&claim.promotion===false&&
       Number.isFinite(claim.amount)&&claim.amount===claim.chargeAmount){
      const symbol={USD:'$',EUR:'€',GBP:'£'}[claim.currency];
      if(!symbol)continue;
      const pat=new RegExp(escRe(symbol)+'\\s*(\\d+(?:[,.]\\d{1,2})?)','g');
      for(const sentence of sentences){
        if(!eligibleSentence(sentence,String(claim.plan),'month',null)||!verifiedQuoteScope(sentence,claim))continue;
        if(/\b(annual|annually|yearly|per year|promo|discount|introductory|starting at)\b/i.test(sentence))continue;
        const hits=[...sentence.matchAll(pat)];
        if(hits.length!==1)continue;
        let n=Number(hits[0][1].replace(',','.'));if(Number.isFinite(n)&&n>0&&n<=10000)numbers.add(n);
      }
      if(numbers.size===1&&![...numbers].includes(claim.amount))changes.push({
        claimKey:claimKey(claim),type:'price_quote',oldValue:claim.amount,newValue:[...numbers][0],sourceUrl:claim.sourceUrl});
    }
  }
  return changes.sort((a,b)=>a.claimKey.localeCompare(b.claimKey));
}
function retireExactCapabilitySentence(value,capability){
  if(typeof value!=='string')return value;
  const feature=String(capability).trim(),escaped=escRe(feature);
  const mention=new RegExp('(?<![\\w])'+escaped+'(?![\\w])','i');
  if(!mention.test(value))return value;
  const sentences=value.split(/(?<=[.!?])\s+/),rewritten=[];
  for(const original of sentences){
    if(!mention.test(original)){rewritten.push(original);continue}
    // When a sentence is *about* the retired feature, drop that claim only.
    if(new RegExp('^\\s*'+escaped+'\\b','i').test(original)||
      new RegExp('^\\s*(?:test|check|verify|validate|review|evaluate|confirm|compare)\\s+'+escaped+'\\b','i').test(original))continue;
    // Never transfer a verb/entitlement from the removed feature to
    // other items in a mixed subject ("A and retired B can do X").
    if(new RegExp(escaped+'\\s+(?:can|could|may|might|will|does|is|are|has|have|had|helps?|provides?|supports?|enables?|allows?|requires?)\\b','i').test(original))return null;
    let rest=original;
    const patterns=[
      [new RegExp(',\\s*'+escaped+'\\s*,','gi'),','],
      [new RegExp('\\s+(?:and|or)\\s+'+escaped+'(?=\\s|[,.!?;:]|$)','gi'),''],
      [new RegExp(',\\s*'+escaped+'(?=\\s|[.!?;:]|$)','gi'),''],
      [new RegExp('\\bwith\\s+'+escaped+'(?=\\s|[.!?;:]|$)','gi'),''],
    ];
    for(const [pattern,replacement] of patterns)rest=rest.replace(pattern,replacement);
    rest=rest.replace(/\s{2,}/g,' ').replace(/,\s*,/g,',').replace(/\s+([.!?])/g,'$1').replace(/,\s*([.!?])/g,'$1').trim();
    // Complex assertions (e.g. "automations can queue work") cannot be
    // safely rewritten by string deletion. Do not mutate any catalog fields.
    if(mention.test(rest)||rest.length<14)return null;
    rewritten.push(rest);
  }
  return rewritten.join(' ').trim();
}
function retireFieldsWithoutCollateralLoss(updated,feature){
  const edit=value=>retireExactCapabilitySentence(value,feature);
  const singleFields=['description','pricing'];
  for(const key of singleFields){
    if(typeof updated[key]!=='string')continue;
    const next=edit(updated[key]);
    if(next===null)return false;
    updated[key]=next;
  }
  for(const key of ['bestFor','strengths','limitations','tradeoffs']){
    if(!Array.isArray(updated[key]))continue;
    const values=updated[key].map(edit);
    if(values.includes(null))return false;
    const kept=values.filter(x=>typeof x==='string'&&x.length>=12);
    if(!kept.length)return false;
    updated[key]=kept;
  }
  if(updated.pricingDetails&&typeof updated.pricingDetails==='object'){
    for(const key of ['freePlanSummary']){
      if(typeof updated.pricingDetails[key]!=='string')continue;
      const next=edit(updated.pricingDetails[key]);
      if(next===null)return false;
      updated.pricingDetails[key]=next;
    }
    if(Array.isArray(updated.pricingDetails.limits)){
      const values=updated.pricingDetails.limits.map(edit);
      if(values.includes(null))return false;
      updated.pricingDetails.limits=values.filter(x=>typeof x==='string'&&x.length>=12);
    }
  }
  if(updated.editorialReview&&typeof updated.editorialReview==='object'){
    for(const key of ['summary','buyerCheck','angle']){
      if(typeof updated.editorialReview[key]!=='string')continue;
      let next=edit(updated.editorialReview[key]);
      if(next===null)return false;
      if(!next&&key==='buyerCheck')next='Check the remaining verified capabilities and plan requirements before choosing.';
      if(!next&&key==='angle')next='Evaluate the remaining documented capabilities';
      if(!next)return false;
      updated.editorialReview[key]=next;
    }
    // The reviewed analysis remains unique; append the exact confirmed change
    // rather than replacing the original editorial assessment.
    updated.editorialReview.summary=(updated.editorialReview.summary+' The manufacturer has discontinued '+feature+'.').trim();
  }
  updated.description=(updated.description+' The manufacturer has discontinued '+feature+'.').trim();
  return updated.description.length>=60&&(!updated.editorialReview||updated.editorialReview.summary.length>=60);
}
function refreshExactNumericPhrase(value,claim,item){
  if(typeof value!=='string')return value;
  const oldPlain=String(item.oldValue),oldGrouped=Number(item.oldValue).toLocaleString('en-US');
  const newPlain=String(item.newValue),newGrouped=Number(item.newValue).toLocaleString('en-US');
  const currency={EUR:'€',USD:String.fromCharCode(36),GBP:'£'}[claim.currency]||'';
  const pairs=item.type==='plan_limit'?
    [[oldGrouped+' '+claim.unit,newGrouped+' '+claim.unit],
     [oldPlain+' '+claim.unit,newPlain+' '+claim.unit]]:
    [[currency+oldPlain,currency+newPlain]];
  for(const [from,to] of pairs){
    if(from&&value.includes(from)&&value.split(from).length===2){
      if(item.type==='price_quote'&&!value.toLowerCase().includes(String(claim.plan).toLowerCase()))continue;
      return value.replace(from,to);
    }
  }
  return value;
}

export function reconcileManufacturerFacts(tool,changes,previous,{today=new Date().toISOString().slice(0,10)}={}){
  if(!changes.length)return{status:'none'};
  const token=JSON.stringify(changes.map(x=>[x.claimKey,x.newValue,x.sourceUrl]));
  if(previous?.token!==token)return{status:'needs_second_observation',proposal:{token}};
  const updated=structuredClone(tool);let applied=0;
  for(const item of changes){
    const claim=(updated.decisionClaims||[]).find(x=>x?.status==='verified'&&x.sourceUrl===item.sourceUrl&&claimKey(x)===item.claimKey);
    if(!claim)continue;
    if(item.type==='capability_retired'&&claim.value===item.oldValue&&!claim.plan){
      const remaining=(updated.features||[]).filter(value=>String(value).toLowerCase()!==String(item.oldValue).toLowerCase());
      if(remaining.length<3||(updated.decisionClaims||[]).filter(other=>other!==claim&&other.status==='verified').length===0)continue; // Retain minimum public profile depth.
      // All exported editorial fields must be coherent before a D1 write.
      // A complex mixed factual sentence blocks automation rather than
      // silently erasing other manufacturer-backed product information.
      // Stage the entire retirement on a temporary copy. A rejected edit
      // must not leak earlier field mutations into subsequent price/limit
      // corrections in the same batch.
      const staged=structuredClone(updated);
      if(!retireFieldsWithoutCollateralLoss(staged,item.oldValue))continue;
      const stagedClaim=(staged.decisionClaims||[]).find(x=>x.status==='verified'&&x.sourceUrl===item.sourceUrl&&claimKey(x)===item.claimKey);
      if(!stagedClaim)continue;
      stagedClaim.status='retired';stagedClaim.verifiedAt=today;
      staged.features=remaining;
      staged.provenance={...(staged.provenance||{}),manufacturerRetiredCapabilities:[...(staged.provenance?.manufacturerRetiredCapabilities||[]),{value:item.oldValue,sourceUrl:item.sourceUrl,verifiedAt:today}]};
      Object.assign(updated,staged);
      applied++;
    }else if(item.type==='plan_limit'&&claim.quantity===item.oldValue){
      claim.quantity=item.newValue;claim.verifiedAt=today;
      if(claim.plan==='Free'&&updated.pricingDetails){
        updated.pricingDetails.freePlanSummary=refreshExactNumericPhrase(updated.pricingDetails.freePlanSummary,claim,item);
        if(Array.isArray(updated.pricingDetails.limits))updated.pricingDetails.limits=updated.pricingDetails.limits.map(x=>refreshExactNumericPhrase(x,claim,item));
      }
      updated.pricing=refreshExactNumericPhrase(updated.pricing,claim,item);
      if(updated.editorialReview&&typeof updated.editorialReview==='object')updated.editorialReview.summary=refreshExactNumericPhrase(updated.editorialReview.summary,claim,item);
      applied++;
    }else if(item.type==='price_quote'&&claim.amount===item.oldValue&&claim.chargeAmount===item.oldValue){
      claim.amount=item.newValue;claim.chargeAmount=item.newValue;claim.verifiedAt=today;
      updated.pricing=refreshExactNumericPhrase(updated.pricing,claim,item);
      if(updated.editorialReview&&typeof updated.editorialReview==='object')updated.editorialReview.summary=refreshExactNumericPhrase(updated.editorialReview.summary,claim,item);
      applied++;
    }
  }
  if(!applied)return{status:'not_applied'};
  updated.provenance={...(updated.provenance||{}),lastAutomaticClaimCorrection:today};
  return{status:'corrected',updatedTool:updated,count:applied};
}
