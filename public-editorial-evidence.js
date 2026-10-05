function stripCommercialSourceLinks(html){
  let out=String(html||'');
  out=out.replace(/(<section\b[^>]*data-toolscout-editorial-evidence=["']1["'][^>]*>)([\s\S]*?)(<\/section>)/gi,(match,open,body,close)=>open+body.replace(/<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi,'$1')+close);
  out=out.replace(/<p\b[^>]*class=["'][^"']*source-note[^"']*["'][^>]*>[\s\S]*?<\/p>/gi,'');
  out=out.replace(/\s*(?:·\s*)?<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>\s*Official(?:\s+product)?\s+source\s*<\/a>/gi,'');
  out=out.replace(/\s*(?:·\s*)?<a\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>\s*[^<]{0,120}\s+official(?:\s+product)?\s+source\s*<\/a>/gi,'');
  out=out.replace(/<strong>\s*Primary sources:\s*<\/strong>\s*/gi,'');
  return out;
}

export async function addPublicEditorialEvidence(request,response,env){
  if(!response?.ok||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  const html=stripCommercialSourceLinks(await response.text());
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('X-ToolScout-Editorial-Evidence','internal-source-v2');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
