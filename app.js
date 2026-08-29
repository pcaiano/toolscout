const SITE_BASE = '.';
const WORKER_ORIGIN = 'https://toolscout.luxurybuyerintelligence.workers.dev';
const state = { tools: [], intents: [], step: 0, answers: {}, ready: false };
const normalize = (value) => String(value || '').toLowerCase();
const tokenize = (value) => normalize(value).split(/[^a-z0-9]+/).filter((x) => x.length > 2);
const asset = (path) => `${SITE_BASE}${path}`;
const api = (path) => `${WORKER_ORIGIN}${path}`;
const affiliate = (toolSlug) => `${WORKER_ORIGIN}/go/${encodeURIComponent(toolSlug)}`;

const questions = [
  { id: 'goal', title: 'What are you mainly trying to do?', choices: [['crm','Manage customers and sales'],['marketing','Marketing and automation'],['seo','Improve SEO and search visibility'],['forms','Collect information with forms'],['automation','Automate repetitive work']] },
  { id: 'budget', title: 'What is your monthly budget?', choices: [['free','Free only'],['low','Under $25/month'],['mid','$25–100/month'],['high','$100+/month']] },
  { id: 'team', title: 'Who will use the tool?', choices: [['solo','Just me'],['small','2–5 people'],['team','6–20 people'],['large','20+ people'],['agency','An agency serving clients']] },
  { id: 'priority', title: 'What matters most?', choices: [['ease','Easy to use'],['automation','Automation'],['integrations','Integrations'],['features','Advanced features']] }
];

function getSessionId() {
  try { const key='toolscout_session'; let id=localStorage.getItem(key); if(!id){id=(crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random()}`;localStorage.setItem(key,id);} return id; } catch { return `${Date.now()}-${Math.random()}`; }
}
const sessionId = getSessionId();
function logoUrl(tool) { try { const host=new URL(tool.sourceUrl).hostname; return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`; } catch { return ''; } }
function initials(name) { return String(name||'T').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }
function toolLogo(tool,large=false){const url=logoUrl(tool),size=large?56:46;return `<div class="tool-logo${large?' large':''}">${url?`<img src="${url}" alt="${tool.name} logo" width="${size}" height="${size}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`:''}<span class="logo-fallback" ${url?'style="display:none"':''}>${initials(tool.name)}</span></div>`;}

function inferredProfile(query, profile={}) {
  const q=normalize(query); const p={...profile};
  if(!p.team && /\bagenc(?:y|ies)\b/.test(q)) p.team='agency';
  if(!p.goal && /\bcrm\b|sales|customer/.test(q)) p.goal='crm';
  if(!p.goal && /seo|search visibility|keywords|organic/.test(q)) p.goal='seo';
  if(!p.goal && /forms?|surveys?|lead capture/.test(q)) p.goal='forms';
  if(!p.goal && /automation|automate|workflow/.test(q)) p.goal='automation';
  if(!p.goal && /marketing|email|ads?/.test(q)) p.goal='marketing';
  if(!p.budget && /free|budget|cheap|affordable/.test(q)) p.budget='free';
  if(!p.priority && /automation|automate|workflow/.test(q)) p.priority='automation';
  if(!p.priority && /integration|integrate|apps?/.test(q)) p.priority='integrations';
  if(!p.priority && /simple|easy|ease/.test(q)) p.priority='ease';
  return p;
}

function fitReasons(tool,query,intent,profile={}){
  const p=inferredProfile(query,profile),q=normalize(query),haystack=[tool.category,tool.description,...(tool.features||[]),...(tool.bestFor||[])].map(normalize).join(' '),reasons=[];const s=tool.scores||{};
  if(p.team==='agency'&&Number(s.agency||0)>=8)reasons.push('Strong fit for agencies');
  if(p.goal&&normalize(tool.category)===normalize(p.goal))reasons.push(`Strong ${p.goal} fit`);
  if(p.budget==='free'&&tool.freePlan)reasons.push('Free plan available');
  if(p.priority==='automation'&&Number(s.automation||0)>=7)reasons.push('Strong automation fit');
  if(p.priority==='integrations'&&Number(s.integrations||0)>=7)reasons.push('Strong integration coverage');
  if(p.priority==='ease'&&Number(s.ease||0)>=8)reasons.push('Easy to use');
  if(p.priority==='features'&&Number(s.features||0)>=7)reasons.push('Strong feature depth');
  if(p.team==='solo'&&Number(s.ease||0)>=8)reasons.push('Well suited to solo users');
  if(p.team==='small'&&Number(s.agency||0)>=7)reasons.push('Strong fit for small teams');
  if(p.team==='team'&&Number(s.agency||0)>=7)reasons.push('Scales well for growing teams');
  if(p.team==='large'&&Number(s.agency||0)>=8)reasons.push('Built for larger organisations');
  if(!reasons.length&&q){const matched=tokenize(q).find(w=>haystack.includes(w));if(matched)reasons.push(`Matches your ${matched} needs`);}
  if(!reasons.length&&tool.bestFor?.length)reasons.push(`Best for ${tool.bestFor[0]}`);return [...new Set(reasons)].slice(0,3);
}

async function boot(){const [toolsResponse,intentsResponse]=await Promise.all([fetch(asset('/data/tools.json'),{cache:'no-store'}),fetch(asset('/data/intents.json'),{cache:'no-store'})]);if(!toolsResponse.ok||!intentsResponse.ok)throw new Error('Database unavailable');state.tools=await toolsResponse.json();state.intents=await intentsResponse.json();state.ready=true;const go=document.getElementById('go');if(go)go.disabled=false;}
function detectIntent(query){const q=normalize(query);let best=null,bestScore=0;for(const intent of state.intents){let score=0;for(const keyword of intent.keywords||[])if(q.includes(normalize(keyword)))score+=2;if(intent.slug.includes('free')&&/free|budget|cheap|affordable/.test(q))score+=5;if(intent.slug.includes('crm')&&/crm|sales|customer/.test(q))score+=4;if(intent.slug.includes('agency')&&/agency|agencies|client/.test(q))score+=6;if(intent.slug.includes('seo')&&/seo|keywords|organic|search/.test(q))score+=4;if(score>bestScore){best=intent;bestScore=score;}}return best;}
function scoreTool(tool,query,intent,profile={}){const p=inferredProfile(query,profile),q=normalize(query),words=tokenize(query),haystack=[tool.name,tool.category,tool.description,...(tool.features||[]),...(tool.bestFor||[])].map(normalize).join(' ');let score=25;const s=tool.scores||{};for(const word of words){if(haystack.includes(word))score+=3;if(normalize(tool.category).includes(word))score+=3;}if(intent&&intent.category===tool.category)score+=18;if(p.goal&&normalize(tool.category)===normalize(p.goal))score+=18;if(p.goal==='automation'&&tool.category==='automation')score+=18;if((p.budget==='free'||/free|budget|cheap|affordable/.test(q))&&tool.freePlan)score+=10;if(p.budget==='low'&&Number(s.price||0)>=7)score+=7;if(p.budget==='mid'&&Number(s.price||0)>=5)score+=4;if(p.priority==='ease')score+=Number(s.ease||0)*1.5;if(p.priority==='automation')score+=Number(s.automation||0)*1.5;if(p.priority==='integrations')score+=Number(s.integrations||0)*1.5;if(p.priority==='features')score+=Number(s.features||0)*1.5;if(p.team==='agency')score+=Number(s.agency||0)*2.2;if(p.team==='solo')score+=Number(s.ease||0)*0.6;if(p.team==='small')score+=Number(s.agency||0)*0.9;if(p.team==='team')score+=Number(s.agency||0)*0.9;if(p.team==='large')score+=Number(s.agency||0)*1.1;if(intent){const w=intent.weights||{};if(w.freePlan&&tool.freePlan)score+=Math.min(8,w.freePlan*2);if(w.automation)score+=(Number(s.automation||0)*w.automation)/5;if(w.integrations)score+=(Number(s.integrations||0)*w.integrations)/5;if(w.features)score+=(Number(s.features||0)*w.features)/5;}return Math.round(Math.min(95,45+(score-25)*0.45));}
async function postEvent(path,payload){try{await fetch(api(path),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),keepalive:true});}catch{}}
async function trackSearch(intent,profile={}){postEvent('/api/search',{intent:intent?.slug||'general',session:sessionId,profile,source:'recommendation'});}
async function trackClick(tool,intent,profile={}){if(tool)postEvent('/api/click',{tool:tool.slug,intent:intent?.slug||'general',session:sessionId,profile,source:'recommendation'});}
function renderResults(query,profile={}){if(!state.ready)return;const effectiveProfile=inferredProfile(query,profile),intent=detectIntent(query);trackSearch(intent,effectiveProfile);const results=state.tools.map(tool=>({...tool,score:scoreTool(tool,query,intent,effectiveProfile)})).sort((a,b)=>b.score-a.score).slice(0,3);const out=document.getElementById('results');if(!results.length){out.innerHTML='<div class="empty-state"><strong>No close matches yet.</strong><span>Try describing the job, budget or team in a little more detail.</span></div>';return;}out.innerHTML=`<div class="profile-card"><div><span class="eyebrow">Your fit profile</span><h2>We found a few strong matches.</h2></div><div class="chips">${effectiveProfile.goal?`<span class="chip">${effectiveProfile.goal}</span>`:''}${effectiveProfile.budget?`<span class="chip">${effectiveProfile.budget}</span>`:''}${effectiveProfile.team?`<span class="chip">${effectiveProfile.team}</span>`:''}${effectiveProfile.priority?`<span class="chip">${effectiveProfile.priority}</span>`:''}</div></div>`+results.map((tool,i)=>{const cta=affiliate(tool.slug),reasons=fitReasons(tool,query,intent,effectiveProfile);return `<article class="result-card ${i===0?'featured':''}"><div class="result-top"><div class="brand-row">${toolLogo(tool)}<div><div class="meta">${tool.category}</div><h3>${tool.name}</h3></div></div><div class="match-score"><span>Match</span><strong>${tool.score}%</strong></div></div><div class="tool-proof"><span>${tool.pricing}</span>${tool.freePlan?'<span>Free plan</span>':''}</div><p>${tool.description}</p><div class="reason-grid">${reasons.map(reason=>`<div class="reason"><span>✓</span>${reason}</div>`).join('')}</div><div class="chips">${(tool.features||[]).slice(0,5).map(x=>`<span class="chip">${x}</span>`).join('')}</div><div class="result-bottom"><span class="fit-note">${i===0?'Top recommendation':intent?`Also worth considering for ${intent.title}`:'Strong alternative'}</span><a class="btn" href="${cta}" target="_blank" rel="nofollow sponsored noopener" data-tool="${tool.slug}">Explore ${tool.name} <span>→</span></a></div></article>`;}).join('');out.querySelectorAll('[data-tool]').forEach(link=>link.addEventListener('click',()=>trackClick(results.find(t=>t.slug===link.dataset.tool),intent,effectiveProfile)));out.scrollIntoView({behavior:'smooth',block:'start'});}
function showQuestion(){const q=questions[state.step];document.getElementById('guided').style.display='block';document.getElementById('progress').textContent=`Question ${state.step+1} of ${questions.length}`;document.getElementById('question').textContent=q.title;document.getElementById('choices').innerHTML=q.choices.map(([value,label])=>`<button type="button" class="choice ${state.answers[q.id]===value?'selected':''}" data-value="${value}">${label}</button>`).join('');document.getElementById('back').style.visibility=state.step?'visible':'hidden';document.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{state.answers[q.id]=btn.dataset.value;if(state.step<questions.length-1){state.step++;showQuestion();}else{document.getElementById('guided').style.display='none';renderResults('guided recommendation',{...state.answers});}}));}
function init(){const guidedStart=document.getElementById('guidedStart'),back=document.getElementById('back'),go=document.getElementById('go'),need=document.getElementById('need');if(!guidedStart||!back||!go||!need)return;go.disabled=true;guidedStart.addEventListener('click',()=>{if(!state.ready)return;state.step=0;state.answers={};document.getElementById('results').innerHTML='';showQuestion();});back.addEventListener('click',()=>{if(state.step>0){state.step--;showQuestion();}});go.addEventListener('click',()=>{const query=need.value.trim();if(!query){need.focus();return;}renderResults(query);});need.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go.click();}});need.addEventListener('input',()=>{go.disabled=!need.value.trim()||!state.ready;});}
document.addEventListener('DOMContentLoaded',()=>{init();boot().catch(()=>{const out=document.getElementById('results');if(out)out.innerHTML='<div class="empty-state"><strong>ToolScout is temporarily unable to load its database.</strong><span>Please try again in a moment.</span></div>';});});
