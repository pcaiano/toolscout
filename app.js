const state = { tools: [], intents: [], step: 0, answers: [] };
const normalize = (value) => String(value || '').toLowerCase();
const tokenize = (value) => normalize(value).split(/[^a-z0-9]+/).filter((x) => x.length > 2);

const questions = [
  { id: 'goal', title: 'What are you mainly trying to do?', choices: [['crm','Manage customers and sales'],['marketing','Marketing and automation'],['seo','Improve SEO and search visibility'],['forms','Collect information with forms']] },
  { id: 'budget', title: 'What is your monthly budget?', choices: [['free','Free only'],['low','Under $25/month'],['mid','$25–100/month'],['high','$100+/month']] },
  { id: 'team', title: 'Who will use the tool?', choices: [['solo','Just me'],['small','2–5 people'],['team','6–20 people'],['large','20+ people']] },
  { id: 'priority', title: 'What matters most?', choices: [['ease','Easy to use'],['automation','Automation'],['integrations','Integrations'],['features','Advanced features']] }
];

const sessionId = (() => {
  const key = 'toolscout_session';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; localStorage.setItem(key, id); }
  return id;
})();

async function boot() {
  const [toolsResponse, intentsResponse] = await Promise.all([fetch('/data/tools.json',{cache:'no-store'}),fetch('/data/intents.json',{cache:'no-store'})]);
  if (!toolsResponse.ok || !intentsResponse.ok) throw new Error('Database unavailable');
  state.tools = await toolsResponse.json(); state.intents = await intentsResponse.json();
}

function detectIntent(query) {
  const q=normalize(query); let best=null,bestScore=0;
  for(const intent of state.intents){let score=0;for(const keyword of intent.keywords||[])if(q.includes(normalize(keyword)))score+=2;if(intent.slug.includes('free')&&/free|budget|cheap|affordable/.test(q))score+=5;if(intent.slug.includes('crm')&&/crm|sales|customer/.test(q))score+=4;if(intent.slug.includes('agency')&&/agency|agencies|client/.test(q))score+=4;if(intent.slug.includes('seo')&&/seo|keywords|organic|search/.test(q))score+=4;if(score>bestScore){best=intent;bestScore=score;}}
  return best;
}

function scoreTool(tool,query,intent,profile={}){
  const q=normalize(query),words=tokenize(query);const haystack=[tool.name,tool.category,tool.description,...(tool.features||[]),...(tool.bestFor||[])].map(normalize).join(' ');let score=40;
  for(const word of words){if(haystack.includes(word))score+=3;if(normalize(tool.category).includes(word))score+=3;}
  if(/free|budget|cheap|affordable/.test(q)&&tool.freePlan)score+=7;
  if(intent&&intent.category===tool.category)score+=18;
  if(intent){const w=intent.weights||{};if(w.freePlan&&tool.freePlan)score+=w.freePlan;if(w.price&&/free|affordable|budget|low cost/i.test(tool.pricing||''))score+=w.price;if(w.automation&&haystack.includes('automation'))score+=w.automation;if(w.integrations&&haystack.includes('integrations'))score+=w.integrations;if(w.features)score+=Math.min(w.features,(tool.features||[]).length*2);}
  if(profile.goal&&normalize(tool.category)===profile.goal)score+=18;if(profile.budget==='free'&&tool.freePlan)score+=15;if(profile.budget==='low'&&/free|low|affordable|under/i.test(tool.pricing||''))score+=6;if(profile.priority==='automation'&&haystack.includes('automation'))score+=10;if(profile.priority==='integrations'&&haystack.includes('integrations'))score+=10;if(profile.priority==='features')score+=Math.min(8,(tool.features||[]).length);
  return Math.min(99,score);
}

async function trackClick(tool,intent,profile={}){
  const event={tool:tool.slug,intent:intent?.slug||'general',session:sessionId,profile};
  try{
    const response=await fetch('/api/click',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event),keepalive:true});
    if(response.ok)return;
  }catch{}
  const clicks=JSON.parse(localStorage.getItem('toolscout_clicks')||'[]');clicks.push({...event,timestamp:new Date().toISOString()});localStorage.setItem('toolscout_clicks',JSON.stringify(clicks.slice(-500)));
}

function renderResults(query,profile={}){
  const intent=detectIntent(query);const results=state.tools.map(tool=>({...tool,score:scoreTool(tool,query,intent,profile)})).sort((a,b)=>b.score-a.score).slice(0,3);const out=document.getElementById('results');
  out.innerHTML=`<div class="result"><strong>Your profile</strong><div class="chips"><span class="chip">${profile.goal||'general'}</span><span class="chip">${profile.budget||'any budget'}</span><span class="chip">${profile.team||'any team'}</span><span class="chip">${profile.priority||'balanced'}</span></div></div>`+results.map((tool,i)=>{const cta=tool.affiliateUrl||tool.sourceUrl;return `<article class="result"><span class="score">${tool.score}/100</span><h3>${i===0?'Best match · ':''}${tool.name}</h3><div class="meta">${tool.pricing} · ${tool.category}</div><p>${tool.description}</p><div class="chips">${(tool.features||[]).slice(0,5).map(x=>`<span class="chip">${x}</span>`).join('')}</div><div class="actions" style="margin-top:16px"><span class="hint">${intent?`Matched for: ${intent.title}`:'Matched to your request'}</span><a class="btn" href="${cta}" target="_blank" rel="nofollow sponsored noopener" data-tool="${tool.slug}">See tool</a></div></article>`;}).join('');
  out.querySelectorAll('[data-tool]').forEach(link=>link.addEventListener('click',()=>trackClick(results.find(t=>t.slug===link.dataset.tool),intent,profile)));
  out.scrollIntoView({behavior:'smooth',block:'start'});
}

function showQuestion(){const q=questions[state.step];document.getElementById('guided').style.display='block';document.getElementById('progress').textContent=`Question ${state.step+1} of ${questions.length}`;document.getElementById('question').textContent=q.title;document.getElementById('choices').innerHTML=q.choices.map(([value,label])=>`<button class="choice ${state.answers[q.id]===value?'selected':''}" data-value="${value}">${label}</button>`).join('');document.getElementById('back').style.visibility=state.step?'visible':'hidden';document.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{state.answers[q.id]=btn.dataset.value;if(state.step<questions.length-1){state.step++;showQuestion();}else{document.getElementById('guided').style.display='none';renderResults('guided recommendation',{...state.answers});}}));}

document.getElementById('guidedStart').addEventListener('click',()=>{state.step=0;state.answers={};document.getElementById('results').innerHTML='';showQuestion();});
document.getElementById('back').addEventListener('click',()=>{if(state.step>0){state.step--;showQuestion();}});
document.getElementById('go').addEventListener('click',()=>{const query=document.getElementById('need').value.trim();if(query)renderResults(query);});
document.getElementById('need').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')document.getElementById('go').click();});
boot().catch(()=>{document.getElementById('results').innerHTML='<div class="result">ToolScout is temporarily unable to load its database.</div>';});
