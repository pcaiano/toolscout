const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

export function inferObservedProfile(slug){
  const s=String(slug||'').toLowerCase();
  if(/crm|customer|sales|pipeline/.test(s))return{category:'crm',weights:{category:35,sales:25,automation:15,integrations:15,ease:10}};
  if(/seo|keyword|search/.test(s))return{category:'seo',weights:{category:35,seo:25,research:15,content:10,integrations:10,ease:5}};
  if(/marketing|email|advertis|content/.test(s))return{category:'marketing',weights:{category:30,marketing:25,automation:20,content:10,integrations:10,ease:5}};
  if(/automation|workflow|integrat/.test(s))return{category:'automation',weights:{automation:30,integrations:30,ease:15,category:15,price:10}};
  if(/form|survey|lead-capture/.test(s))return{category:'forms',weights:{category:35,integrations:20,ease:20,automation:15,price:10}};
  if(/agency|agencies|client/.test(s))return{category:'business',weights:{agency:25,automation:25,integrations:25,marketing:10,ease:15}};
  return{category:'general',weights:{}};
}

function scoreTool(tool,item,profile){
  const weights=profile?.weights||item?.weights||{};let total=0,weight=0;
  for(const [key,wRaw] of Object.entries(weights)){
    const w=Number(wRaw)||0;if(!w)continue;let value=0;
    if(key==='category')value=String(tool.category||'').toLowerCase()===String(item.category||'').toLowerCase()?10:0;
    else if(key==='freePlan')value=tool.freePlan?10:0;
    else if(key==='simplicity'||key==='ease')value=Number(tool.scores?.ease||0);
    else value=Number(tool.scores?.[key]||0);
    total+=value*w;weight+=w;
  }
  return weight?total/weight:0;
}

function humanTitle(slug){
  const raw=String(slug||'').replace(/^observed-/,'').replace(/^best-/,'').replace(/-/g,' ').trim();
  if(!raw)return'Tool recommendations';
  return raw.replace(/\b\w/g,m=>m.toUpperCase());
}

function pickTools(tools,item,profile){
  return (tools||[]).map(t=>({...t,_score:scoreTool(t,item,profile)})).sort((a,b)=>b._score-a._score).slice(0,3);
}

export function renderOpportunityPage({slug,opportunity,tools=[]}){
  const item={slug,category:inferObservedProfile(slug).category};
  const profile=inferObservedProfile(slug);
  const ranked=pickTools(tools,item,profile);
  const title=humanTitle(slug);
  const score=Number(opportunity?.opportunity_score||0).toFixed(1);
  const cards=ranked.map(t=>`<article class="card"><div class="cat">${escapeHtml(t.category)}</div><div class="name">${escapeHtml(t.name)}</div><p>${escapeHtml(t.description)}</p><div class="features">${(t.features||[]).slice(0,5).map(escapeHtml).join(' · ')}</div><a class="cta" href="/go/${encodeURIComponent(t.slug)}?source=seo-opportunity" rel="nofollow sponsored">Explore ${escapeHtml(t.name)} →</a></article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — ToolScout</title><meta name="description" content="ToolScout recommendations for ${escapeHtml(title.toLowerCase())}, selected from the current software catalog based on practical fit, automation and integrations."><link rel="canonical" href="https://trytoolscout.org/${encodeURIComponent(slug)}.html"><meta name="robots" content="index,follow"><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f5f7fb;color:#101828}.wrap{max-width:920px;margin:auto;padding:30px 22px 80px}.brand{font-weight:850;font-size:23px;text-decoration:none;color:#101828}.hero{padding:75px 0 35px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:#667085}.hero h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.06em;margin:14px 0 18px}.hero p,.card p{font-size:18px;line-height:1.6;color:#667085}.signal{font-size:13px;color:#475467;margin-top:16px}.card{background:#fff;border:1px solid #e4e8ee;border-radius:20px;padding:22px;margin:14px 0}.name{font-size:24px;font-weight:800}.cat{font-size:11px;text-transform:uppercase;color:#667085}.features{font-size:13px;color:#475467;margin:12px 0}.cta{display:inline-block;background:#101828;color:#fff;text-decoration:none;padding:11px 15px;border-radius:11px;font-weight:750}.section{margin-top:42px}.section p{font-size:16px}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><main class="hero"><div class="eyebrow">ToolScout opportunity guide</div><h1>${escapeHtml(title)}</h1><p>We found a software need worth evaluating. These recommendations are selected from the current ToolScout catalog based on the observed intent and available tool fit.</p><div class="signal">Opportunity score: ${escapeHtml(score)}</div></main>${cards||'<div class="card"><strong>No suitable catalog matches yet.</strong><p>ToolScout is continuing to evaluate this opportunity.</p></div>'}<section class="section"><h2>Start with the job</h2><p>Tell ToolScout what you are trying to accomplish and it will narrow the options around your needs.</p><a class="cta" href="/">Find my tools →</a></section></div></body></html>`;
}
