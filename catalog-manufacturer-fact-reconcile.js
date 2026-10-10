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
  if(scope==='automation'&&!/automation/i.test(s))return false;
  if(scope==='stored'&&/automation/i.test(s)&&!/stored/i.test(s))return false;
  if(period==='month'&&!/\b(monthly|per month|each month)\b/i.test(s))return false;
  if(period==='day'&&!/\b(daily|per day|each day)\b/i.test(s))return false;
  if(period==='total'&&/\b(per month|monthly|per day|daily)\b/i.test(s))return false;
  if(/\b(save|discount|was|previously|promotion|promotional|introductory|starting at|as low as|compared to)\b/i.test(s))return false;
  return true;
}
function claimKey(claim){
  return [claim.type,claim.value,claim.plan,claim.type==='plan_limit'?claim.unit:claim.currency,
    claim.type==='plan_limit'?claim.period:claim.billingCycle,claim.type==='plan_limit'?claim.scope:''].join('|');
}
export function manufacturerFactProposals(tool,observations=[]){
  const changes=[];
  for(const claim of tool?.decisionClaims||[]){
    if(claim?.status!=='verified'||!claim.plan||!claim.sourceUrl||!vendorOwned(claim.sourceUrl,tool))continue;
    const doc=observations.find(x=>x.url===claim.sourceUrl&&x.status==='ok'&&typeof x.documentText==='string');
    if(!doc)continue;
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
        if(!eligibleSentence(sentence,String(claim.plan),'month',null))continue;
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
function refreshExactNumericPhrase(value,claim,item){
 if(typeof value!=='string')return value;
 const before=Number(item.oldValue),after=Number(item.newValue);
 if(!Number.isFinite(before)||!Number.isFinite(after))return value;
 const oldPlain=String(before),oldGrouped=before.toLocaleString('en-US');
 const newPlain=String(after),newGrouped=after.toLocaleString('en-US');
 const variants=item.type==='plan_limit'?
  [oldGrouped+' '+claim.unit,oldPlain+' '+claim.unit]:
  [({EUR:'€',USD:'
  if(!changes.length)return{status:'none'};
  const token=JSON.stringify(changes.map(x=>[x.claimKey,x.newValue,x.sourceUrl]));
  if(previous?.token!==token)return{status:'needs_second_observation',proposal:{token}};
  const updated=structuredClone(tool);let applied=0;
  for(const item of changes){
    const claim=(updated.decisionClaims||[]).find(x=>x?.status==='verified'&&x.sourceUrl===item.sourceUrl&&claimKey(x)===item.claimKey);
    if(!claim)continue;
    if(item.type==='plan_limit'&&claim.quantity===item.oldValue){
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
,GBP:'£'}[claim.currency]||'')+oldPlain];
 for(const [index,needle] of variants.entries()){
   if(!needle||!value.includes(needle)||value.split(needle).length!==2)continue;
   if(item.type==='price_quote'&&!value.toLowerCase().includes(String(claim.plan).toLowerCase()))continue;
   const replacement=item.type==='plan_limit'?(index===0?newGrouped:newPlain)+' '+claim.unit:
      ({EUR:'€',USD:'
  if(!changes.length)return{status:'none'};
  const token=JSON.stringify(changes.map(x=>[x.claimKey,x.newValue,x.sourceUrl]));
  if(previous?.token!==token)return{status:'needs_second_observation',proposal:{token}};
  const updated=structuredClone(tool);let applied=0;
  for(const item of changes){
    const claim=(updated.decisionClaims||[]).find(x=>x?.status==='verified'&&x.sourceUrl===item.sourceUrl&&claimKey(x)===item.claimKey);
    if(!claim)continue;
    if(item.type==='plan_limit'&&claim.quantity===item.oldValue){
      claim.quantity=item.newValue;claim.verifiedAt=today;applied++;
    }else if(item.type==='price_quote'&&claim.amount===item.oldValue&&claim.chargeAmount===item.oldValue){
      claim.amount=item.newValue;claim.chargeAmount=item.newValue;claim.verifiedAt=today;applied++;
    }
  }
  if(!applied)return{status:'not_applied'};
  updated.provenance={...(updated.provenance||{}),lastAutomaticClaimCorrection:today};
  return{status:'corrected',updatedTool:updated,count:applied};
}
,GBP:'£'}[claim.currency]||'')+newPlain;
   return value.replace(needle,replacement);
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
    if(item.type==='plan_limit'&&claim.quantity===item.oldValue){
      claim.quantity=item.newValue;claim.verifiedAt=today;applied++;
    }else if(item.type==='price_quote'&&claim.amount===item.oldValue&&claim.chargeAmount===item.oldValue){
      claim.amount=item.newValue;claim.chargeAmount=item.newValue;claim.verifiedAt=today;applied++;
    }
  }
  if(!applied)return{status:'not_applied'};
  updated.provenance={...(updated.provenance||{}),lastAutomaticClaimCorrection:today};
  return{status:'corrected',updatedTool:updated,count:applied};
}
