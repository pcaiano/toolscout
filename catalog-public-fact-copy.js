// Render-only removal of generic pending-verification language.
// Unsupported AI/free-plan assertions are omitted instead of displayed as
// pseudo-content. Internal evidence status stays in D1 and the decision engine.
export function cleanPublicCatalogProfileCopy(html){
 if(typeof html!=='string')return html;
 let out=html
  .replace(/<div\b[^>]*data-catalog-runtime-warning="1"[^>]*>[\s\S]*?<\/div>/gi,'')
  .replace(/;\s*verify current pricing before publication/gi,'')
  .replace(/Current product capabilities, pricing, tier eligibility and integrations require independent vendor verification\./gi,'')
  .replace(/\s*Vendor pricing and capabilities can change\./gi,'');
 // Do not publish a separate "AI interoperability not verified" section.
 out=out.replace(/<section\b[^>]*data-ai-interoperability="1"[^>]*>[\s\S]*?<\/section>/gi,section=>
   /\b(not yet verified|has not been verified|unverified|pending verification)\b/i.test(section)?'':section);
 // A nonanswer is not a FAQ. Remove only the corresponding unverified card.
 out=out.replace(/<details><summary>([^<]+)<\/summary><p>([\s\S]*?)<\/p><\/details>/gi,(all,title,answer)=>{
   if(!/\b(not yet verified|has not been verified|unverified|pending verification)\b/i.test(answer))return all;
   if(/work with (?:chatgpt|claude|gemini)|have a free plan/i.test(title))return '';
   return all;
 });
 out=out.replace(/<p><strong>Free plan recorded:<\/strong>\s*Unknown<\/p>/gi,'');
 // Structured FAQs must match the visible FAQ rather than making an invisible
 // machine-readable assertion about unsupported assistant or free-plan support.
 out=out.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,(all,raw)=>{
   let nodes;try{nodes=JSON.parse(raw)}catch{return all}
   for(const node of Array.isArray(nodes)?nodes:[nodes]){
     if(node?.['@type']!=='FAQPage'||!Array.isArray(node.mainEntity))continue;
     node.mainEntity=node.mainEntity.filter(q=>{
       const answer=String(q?.acceptedAnswer?.text||'');
       const question=String(q?.name||'');
       return !(/\b(not yet verified|has not been verified|unverified|pending verification)\b/i.test(answer)&&
          /work with (?:chatgpt|claude|gemini)|have a free plan/i.test(question));
     });
   }
   return '<script type="application/ld+json">'+JSON.stringify(nodes).replace(/</g,'\\u003c')+'</script>';
 });
 return out;
}
