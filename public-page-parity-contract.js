function decode(value){return String(value||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")}
function strip(value){return decode(String(value||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}
function canonicalHref(html){
  const a=String(html||'').match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const b=String(html||'').match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return decode((a||b)?.[1]||'');
}
function canonicalInternal(href){
  try{
    const u=new URL(href,'https://trytoolscout.org');
    if(u.origin!=='https://trytoolscout.org')return null;
    u.hash='';u.search='';
    let p=u.pathname.replace(/\.html$/i,'')||'/';
    if(p!=='/'&&p.endsWith('/'))p=p.slice(0,-1);
    return p;
  }catch{return null}
}
function jsonLdTypes(html){
  const types=[];
  for(const m of String(html||'').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const data=JSON.parse(m[1]);
      const walk=v=>{
        if(Array.isArray(v)){for(const x of v)walk(x);return}
        if(!v||typeof v!=='object')return;
        const t=v['@type'];if(Array.isArray(t))types.push(...t.map(String));else if(t)types.push(String(t));
        if(v['@graph'])walk(v['@graph']);
      };
      walk(data);
    }catch{}
  }
  return [...new Set(types)].sort();
}
function hrefs(html){
  const out=[];
  for(const m of String(html||'').matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi))out.push(decode(m[1]));
  return out;
}
export function publicPageFingerprint(html){
  const text=String(html||'');
  const internal=[...new Set(hrefs(text).map(canonicalInternal).filter(Boolean))].sort();
  const monetized=[...new Set(internal.filter(x=>x.startsWith('/go/')))].sort();
  const h1=strip(text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  return{
    canonical:canonicalHref(text).replace(/\.html$/i,''),
    h1,
    jsonLdTypes:jsonLdTypes(text),
    internalLinks:internal,
    monetizedLinks:monetized,
    hasEditorialEvidence:/Editorial evidence:|Official (?:product )?source|Primary sources:/i.test(text),
    hasAffiliateDisclosure:/affiliate compensation|affiliate relationships|may earn/i.test(text),
    hasIndexFollow:/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*index[^"']*follow/i.test(text),
    hasLongDash:/[—–]/.test(text)
  };
}
export function comparePublicParity(beforeHtml,afterHtml){
  const before=publicPageFingerprint(beforeHtml),after=publicPageFingerprint(afterHtml);
  const errors=[];
  if(!after.canonical)errors.push('canonical_missing');
  if(before.h1&&after.h1!==before.h1)errors.push('h1_changed');
  for(const type of before.jsonLdTypes)if(!after.jsonLdTypes.includes(type))errors.push('jsonld_type_lost:'+type);
  for(const link of before.internalLinks)if(!after.internalLinks.includes(link))errors.push('internal_link_lost:'+link);
  for(const link of before.monetizedLinks)if(!after.monetizedLinks.includes(link))errors.push('monetized_link_lost:'+link);
  if(before.hasEditorialEvidence&&!after.hasEditorialEvidence)errors.push('editorial_evidence_lost');
  if(before.hasAffiliateDisclosure&&!after.hasAffiliateDisclosure)errors.push('affiliate_disclosure_lost');
  if(before.hasIndexFollow&&!after.hasIndexFollow)errors.push('robots_index_follow_lost');
  if(after.hasLongDash)errors.push('long_dash_introduced');
  return{ok:errors.length===0,errors,before,after};
}
