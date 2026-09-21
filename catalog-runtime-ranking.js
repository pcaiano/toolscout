const esc=v=>String(v??'').replace(/[\u2013\u2014]/g,'-').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]||m));
const normalize=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const STOP=new Set(['best','tool','tools','software','for','with','and','the','a','an','to','of','platform','platforms','small','business','team','teams','agency','agencies','consultant','consultants','real','estate','free','affordable']);
const CAPABILITY_RULES={
  'best-email-marketing-tools':['email marketing','newsletter','newsletters','email campaign','email campaigns'],
  'best-marketing-automation-tools':['marketing automation','lead nurturing','campaign automation'],
  'best-funnel-builder':['funnel','funnels'],
  'best-ai-ad-creative-tools':['ad creative','ad creatives','advertising creative','advertising creatives','creative generation','ad generation'],
  'best-keyword-research-tools':['keyword research','keyword','keywords','search volume'],
  'best-seo-tools-for-agencies':['seo','keyword','keywords','backlink','backlinks','search visibility'],
  'best-competitor-seo-tools':['competitor','competitors','competitive research','backlink','backlinks','seo'],
  'best-workflow-automation-tools':['workflow automation','automation','integrations'],
  'best-no-code-automation-tools':['no code','no-code','visual automation','workflow builder'],
  'best-lead-capture-forms':['lead capture','form builder','forms','form'],
  'best-forms-for-small-business':['form builder','forms','form'],
  'best-project-management-tools':['project management','project planning','task management','projects','project'],
  'best-free-project-management-tools':['project management','project planning','task management','projects','project'],
  'best-sales-prospecting-tools':['sales prospecting','prospecting','lead database','b2b leads','sales intelligence'],
  'best-cold-email-tools':['cold email','email outreach','sales engagement','outbound email','email sequences'],
  'best-customer-support-tools':['customer support','helpdesk','ticketing','customer service'],
  'best-social-media-management-tools':['social media','social scheduling','social analytics','social publishing'],
  'best-website-builders':['website builder','site builder','web design','website','websites'],
  'best-product-analytics-tools':['product analytics','funnels','funnel','retention','session replay','user behavior'],
  'best-ai-research-tools':['research','web research','source synthesis','grounded answers'],
  'best-ai-assistants':['ai assistant','ai assistants','chatbot','chatbots','assistant','assistants'],
  'best-ai-coding-tools':['coding','code editor','code assistant','code assistants','developer ai','coding agent','coding agents'],
  'best-developer-tools':['developer','development','deployment','devops','code'],
  'best-ecommerce-platforms':['ecommerce','online store','commerce','checkout','shopping cart'],
  'best-design-tools':['design','graphic design','ui design','prototype','prototyping'],
  'best-video-content-tools':['video','videos','screen recording','video editing','podcast editing']
};
const COMPOUND={
  'best-ai-marketing-tools':[['ai','artificial intelligence','machine learning']],
  'best-ai-ad-creative-tools':[['ai','artificial intelligence','generative ai']],
  'best-ai-research-tools':[['ai','artificial intelligence','llm','large language model']],
  'best-ai-coding-tools':[['ai','artificial intelligence','coding agent','code assistant']],
  'best-crm-with-automation':[['automation','workflow automation','sales automation']]
};
async function json(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}
function termMatch(text,term){term=normalize(term);return term&&(' '+text+' ').includes(' '+term+' ')}
function text(tool){return normalize([tool?.name,tool?.category,tool?.description,...(tool?.features||[]),...(tool?.bestFor||[])].join(' '))}
function featureText(tool){return normalize((tool?.features||[]).join(' '))}
function relevance(tool,intent){
  const t=text(tool),phrases=[...(intent?.keywords||[]),String(intent?.slug||'').replace(/^best-/,'').replace(/-/g,' '),intent?.title||''].map(normalize).filter(Boolean);
  let score=0;
  for(const p of phrases)if(p.includes(' ')&&termMatch(t,p))score+=3;
  const tokens=new Set(phrases.flatMap(x=>x.split(' ')).filter(x=>x.length>=3&&!STOP.has(x))),words=new Set(t.split(' '));
  for(const token of tokens)if(words.has(token))score+=0.75;
  return score;
}
function categoryMatch(tool,intent){
  const allowed=(Array.isArray(intent?.allowedCategories)&&intent.allowedCategories.length?intent.allowedCategories:[intent?.category]).map(normalize);
  return allowed.includes(normalize(tool?.category));
}
function capabilityMatch(tool,intent){
  const ft=featureText(tool),simple=CAPABILITY_RULES[intent.slug]||[],simpleOk=!simple.length||simple.some(x=>termMatch(ft,x));
  const groups=COMPOUND[intent.slug]||[],compoundOk=!groups.length||groups.every(group=>group.some(x=>termMatch(ft,x)));
  return simpleOk&&compoundOk;
}
function attributeMatch(tool,intent){if(intent.slug==='best-free-crm'||intent.slug==='best-free-project-management-tools')return tool?.freePlan===true;return true}
function eligible(tool,intent){return tool?.rankingEligible!==false&&categoryMatch(tool,intent)&&capabilityMatch(tool,intent)&&attributeMatch(tool,intent)&&relevance(tool,intent)>=0.75}
function score(tool,intent){
  let total=0;
  for(const [key,w] of Object.entries(intent?.weights||{})){
    const v=key==='freePlan'?(tool.freePlan?10:0):Number(tool.scores?.[key==='simplicity'?'ease':key]||0);
    total+=v*Number(w||0);
  }
  return total;
}
function smartTitle(slug){return String(slug||'').replace(/^best-/,'').split('-').map(w=>({ai:'AI',crm:'CRM',seo:'SEO',api:'API'}[w]||w.charAt(0).toUpperCase()+w.slice(1))).join(' ')}
async function intentFor(env,slug){
  const [base,longtail]=await Promise.all([json(env,'/data/intents.json',[]),json(env,'/data/seo-longtail.json',{intents:[]})]);
  const direct=(base||[]).find(x=>x.slug===slug);if(direct)return direct;
  const seed=(longtail?.intents||[]).find(x=>x.slug===slug);if(!seed)return null;
  const parent=(base||[]).find(x=>x.slug===seed.parent)||{};
  return{...parent,...seed,weights:seed.weights||parent.weights,keywords:[...(parent.keywords||[]),...(seed.keywords||[])]};
}
export async function renderRuntimeRanking(env,path,tools){
  const slug=String(path||'').replace(/^\//,'').replace(/\.html$/i,'').replace(/\/$/,'');
  if(!/^best-[a-z0-9-]+$/.test(slug))return null;
  const intent=await intentFor(env,slug);if(!intent)return null;
  const ranked=(tools||[]).filter(t=>eligible(t,intent)).map(t=>({...t,_score:score(t,intent)})).sort((a,b)=>b._score-a._score||String(a.name).localeCompare(String(b.name)));
  if(ranked.length<2)return null;
  const top=ranked.slice(0,3),runtimeTop=top.some(t=>String(t?.provenance?.mode||'').includes('runtime'));
  if(!runtimeTop)return null;
  const title=intent.title||smartTitle(slug),desc=intent.description||('ToolScout ranking for '+title.toLowerCase()+'.'),criteria=Object.entries(intent.weights||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,4).map(([k])=>k==='freePlan'?'free plan':k).join(', ');
  const cards=top.map((t,i)=>`<article class="card"><div class="rank">${i+1}</div><div class="meta">${esc(t.category)}</div><h2>${esc(t.name)}</h2><p>${esc(t.description)}</p><div class="proof">${esc(t.pricing||'See vendor for current pricing')}${t.freePlan?' · Free plan':''}</div><div class="features">${(t.features||[]).slice(0,5).map(x=>`<span>${esc(x)}</span>`).join('')}</div><a href="/tools/${encodeURIComponent(t.slug)}">View tool profile</a> <a href="/go/${encodeURIComponent(t.slug)}" rel="nofollow sponsored">Visit ${esc(t.name)}</a></article>`).join('');
  const schema={'@context':'https://schema.org','@type':'ItemList','itemListElement':top.map((t,i)=>({'@type':'ListItem',position:i+1,item:{'@type':'SoftwareApplication',name:t.name,applicationCategory:t.category,url:t.sourceUrl}}))};
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}: Compare the Best Options | ToolScout</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="https://trytoolscout.org/${encodeURIComponent(slug)}"><meta name="robots" content="index,follow"><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#111827}.wrap{max-width:940px;margin:auto;padding:28px 22px 80px}.brand{font-size:22px;font-weight:850;color:#111827;text-decoration:none}.hero{padding:72px 0 32px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#667085}h1{font-size:clamp(42px,7vw,68px);line-height:1;letter-spacing:-.055em;margin:14px 0 18px}.lead,.sub{line-height:1.65;color:#667085}.lead{font-size:19px}.sub{font-size:14px}.grid{display:grid;gap:14px}.card{position:relative;background:#fff;border:1px solid #e4e7ec;border-radius:20px;padding:24px}.rank{position:absolute;right:20px;top:18px;font-size:12px;font-weight:850;color:#98a2b3}.meta{font-size:11px;text-transform:uppercase;color:#667085;font-weight:800}.card h2{margin:8px 36px 8px 0;font-size:27px}.card p{font-size:16px;line-height:1.6;color:#667085}.proof{font-size:13px;color:#475467;margin:12px 0}.features{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.features span{font-size:11px;background:#f2f4f7;border-radius:999px;padding:6px 8px}.card a{display:inline-block;background:#111827;color:#fff;padding:11px 15px;border-radius:10px;text-decoration:none;font-weight:750;margin-right:6px}.section{margin-top:48px;padding-top:34px;border-top:1px solid #e4e7ec}.section p{color:#667085;line-height:1.65}.disclosure{margin-top:36px;color:#667085;font-size:12px;line-height:1.55}</style></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><main class="hero"><div class="eyebrow">Independent ToolScout guide · ${esc(intent.category||'software')}</div><h1>${esc(title)}</h1><p class="lead">${esc(desc)}</p><p class="sub">This guide focuses on ${esc(criteria||'documented fit')}. New catalog tools compete under the same eligibility and scoring rules as existing tools. ToolScout does not sell ranking positions.</p></main><section class="grid">${cards}</section><section class="section"><h2>How ToolScout chooses</h2><p>ToolScout starts with the job to be done. Eligible tools must match the guide category, demonstrate the required capabilities and pass hard constraints. Ranking then uses the same deterministic intent weights for every catalog tool, regardless of when it entered the catalog.</p></section><div class="disclosure">ToolScout may earn affiliate compensation from some outbound links. Recommendations are based on fit, never affiliate payout or paid placement.</div></div></body></html>`,{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=60'}});
}