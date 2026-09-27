function normalizeSlug(value){
  return String(value||'').trim().toLowerCase().replace(/^\/+|\/+$/g,'');
}

export function normalizeOwnedAssetPath(value){
  try{
    const u=new URL(String(value||''),'https://trytoolscout.org');
    let p=u.pathname.replace(/\.html$/i,'');
    if(p.length>1)p=p.replace(/\/+$/,'');
    return p||'/';
  }catch{
    let p=String(value||'').split('?')[0].replace(/\.html$/i,'');
    if(p.length>1)p=p.replace(/\/+$/,'');
    return p||'/';
  }
}

// Vendor outreach may cite guides/comparisons that mention the tool, but a tool-profile
// asset must always be the profile of the same tool. This prevents competitor-profile
// crossovers such as Jasper -> /tools/copy-ai or Zendesk -> /tools/crisp.
export function vendorAssetCoherence(assetUrl,toolSlug){
  const slug=normalizeSlug(toolSlug);
  const path=normalizeOwnedAssetPath(assetUrl);
  if(!slug)return {ok:false,reason:'missing_tool_slug',path,slug};
  if(/^\/tools\//i.test(path)){
    const expected=`/tools/${slug}`;
    return {ok:path.toLowerCase()===expected.toLowerCase(),reason:path.toLowerCase()===expected.toLowerCase()?null:'cross_tool_profile',path,expected,slug};
  }
  return {ok:true,reason:null,path,slug};
}
