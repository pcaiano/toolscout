const PAIR_RE=/^\/([a-z0-9-]+-vs-[a-z0-9-]+)(?:\.html)?\/?$/i;

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
async function assetJson(env,path,fallback){
  try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}
}
function aiProfile(tool){return tool?.aiIntegration&&typeof tool.aiIntegration==='object'?tool.aiIntegration:{status:'unverified',tier:'unknown',mcp:'unknown',publicApi:null,assistants:[],summary:'ToolScout has not yet verified this tool\'s current ChatGPT, Claude, Gemini, MCP or agent integration options.',sources:[]}}
function tier(p){if(p.status!=='verified')return'Not yet verified';return p.tier==='strong'?'Strong':p.tier==='moderate'?'Moderate':p.tier==='limited'?'Limited':'Verified'}
function card(tool){
  const p=aiProfile(tool),assistants=(p.assistants||[]).filter(Boolean),mcp=p.mcp==='official'?'Official MCP':p.mcp==='community'?'Community MCP':'Not verified',api=p.publicApi===true?'Verified':p.publicApi===false?'No':'Not verified';
  return '<div style="border:1px solid #e2e7ed;border-radius:14px;padding:16px;background:#fff"><div style="font-weight:850;font-size:17px">'+esc(tool.name)+'</div><div style="margin-top:8px;font-size:12px;line-height:1.6;color:#475467"><strong>AI interoperability:</strong> '+esc(tier(p))+'<br><strong>Assistants:</strong> '+esc(assistants.length?assistants.join(', '):'Not verified')+'<br><strong>Agent connectivity:</strong> '+esc(mcp)+'<br><strong>Public API:</strong> '+esc(api)+'</div><p style="font-size:13px;line-height:1.6;color:#667085;margin:10px 0 0">'+esc(p.summary||'AI interoperability has not yet been verified.')+'</p></div>';
}
function conclusion(a,b){
  const ap=aiProfile(a),bp=aiProfile(b),rank={unknown:0,limited:1,moderate:2,strong:3},av=rank[ap.tier]||0,bv=rank[bp.tier]||0;
  if(ap.status!=='verified'&&bp.status!=='verified')return 'ToolScout has not yet verified AI assistant or agent interoperability for either product. This factor is therefore excluded from the recommendation rather than scored as zero.';
  if(av===bv)return a.name+' and '+b.name+' currently have the same recorded AI interoperability tier. Compare the actual assistants, MCP surface and API permissions against your workflow.';
  const winner=av>bv?a:b,other=av>bv?b:a;
  return winner.name+' currently has the stronger verified AI interoperability profile. '+other.name+' can still be the better overall choice when product depth, price or workflow fit matters more.';
}
function section(a,b){
  return '<section data-ai-comparison="1" style="margin-top:26px;background:#f8faf7;border:1px solid #dce3da;border-radius:22px;padding:24px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#667085;font-weight:800">AI interoperability</div><h2 style="font-size:28px;letter-spacing:-.035em;margin:8px 0 10px">How these tools connect to AI assistants and agents</h2><p style="color:#475467;line-height:1.7;margin:0 0 16px">For ToolScout, AI integration is a separate decision dimension: named assistant support, MCP or agent connectivity, and API access are only credited when first-party evidence is verified.</p><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">'+card(a)+card(b)+'</div><p style="color:#475467;line-height:1.7;margin:16px 0 0"><strong>AI decision:</strong> '+esc(conclusion(a,b))+'</p></section>';
}

export async function transformComparisonAiResponse(request,response,env){
  if(request.method!=='GET'||!response?.ok||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  const match=new URL(request.url).pathname.match(PAIR_RE);if(!match)return response;
  let html=await response.text();if(html.includes('data-ai-comparison="1"'))return response;
  const [pairs,tools]=await Promise.all([assetJson(env,'/data/comparisons.json',[]),assetJson(env,'/data/tools.json',[])]);
  const pair=(Array.isArray(pairs)?pairs:[]).find(x=>Array.isArray(x)&&x.length>=2&&x[0]+'-vs-'+x[1]===match[1]);
  if(!pair)return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const bySlug=new Map((Array.isArray(tools)?tools:[]).map(x=>[x.slug,x])),a=bySlug.get(pair[0]),b=bySlug.get(pair[1]);if(!a||!b)return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const ai=section(a,b);
  if(html.includes('<section id="analysis"'))html=html.replace('<section id="analysis"',ai+'<section id="analysis"');
  else html=html.replace('</div></body>',ai+'</div></body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.set('Cache-Control','public, max-age=60');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
