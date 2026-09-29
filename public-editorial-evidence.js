function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function tools(env,request){
  try{
    const response=await env.ASSETS.fetch(new Request(new URL('/data/tools.json',request.url)));
    return response.ok?await response.json():[];
  }catch{return[]}
}

function toolSlug(pathname){
  const m=String(pathname||'').match(/^\/tools\/([a-z0-9][a-z0-9-]*)(?:\.html)?\/?$/i);
  return m?.[1]?.toLowerCase()||null;
}

function guideToolSlugs(html){
  const out=[],seen=new Set();
  for(const m of String(html||'').matchAll(/href=["']\/tools\/([a-z0-9][a-z0-9-]*)(?:\.html)?(?:[?#][^"']*)?["']/gi)){
    const slug=String(m[1]||'').toLowerCase();
    if(!slug||seen.has(slug))continue;
    seen.add(slug);
    out.push(slug);
    if(out.length>=4)break;
  }
  return out;
}

function insert(html,block){
  const marker='<section class="section"><h2>How ToolScout chooses</h2>';
  if(html.includes(marker))return html.replace(marker,block+marker);
  return /<\/body>/i.test(html)?html.replace(/<\/body>/i,block+'</body>'):html+block;
}

function hasEvidence(html){
  return /data-toolscout-editorial-evidence=["']1["']|Editorial evidence:|Official (?:product )?source|Primary sources:/i.test(String(html||''));
}

function profileBlock(tool){
  if(!tool?.sourceUrl)return'';
  const checked=tool.lastVerified?' Source checked '+esc(tool.lastVerified)+'.':'';
  return '<section class="section" data-toolscout-editorial-evidence="1"><h2>Editorial evidence</h2><p>ToolScout verifies product facts against the vendor\\'s official product source before using them in this profile.'+checked+'</p><p><a href="'+esc(tool.sourceUrl)+'" target="_blank" rel="noopener">Official product source for '+esc(tool.name||tool.slug)+'</a></p></section>';
}

function guideBlock(rows){
  const sources=rows.filter(x=>x?.sourceUrl).slice(0,4);
  if(!sources.length)return'';
  const items=sources.map(tool=>'<li><a href="'+esc(tool.sourceUrl)+'" target="_blank" rel="noopener">'+esc(tool.name||tool.slug)+' official product source</a>'+(tool.lastVerified?' <span>Source checked '+esc(tool.lastVerified)+'.</span>':'')+'</li>').join('');
  return '<section class="section" data-toolscout-editorial-evidence="1"><h2>Primary sources</h2><p>ToolScout uses first-party vendor sources for product facts in this guide. Affiliate status does not determine inclusion or ranking.</p><ul>'+items+'</ul></section>';
}

export async function addPublicEditorialEvidence(request,response,env){
  if(!response?.ok||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  let html=await response.text();
  if(hasEvidence(html))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});

  const pathname=new URL(request.url).pathname;
  const catalog=await tools(env,request);
  let block='';
  const slug=toolSlug(pathname);
  if(slug){
    block=profileBlock(catalog.find(x=>String(x?.slug||'').toLowerCase()===slug));
  }else if(/^\/best-[a-z0-9-]+(?:\.html)?\/?$/i.test(pathname)){
    const wanted=guideToolSlugs(html);
    const map=new Map(catalog.map(x=>[String(x?.slug||'').toLowerCase(),x]));
    block=guideBlock(wanted.map(x=>map.get(x)).filter(Boolean));
  }
  if(!block)return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});

  html=insert(html,block);
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('X-ToolScout-Editorial-Evidence','primary-source-v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
