const UA='ToolScout Overflow Research/1.0 (+https://trytoolscout.org/)';
const MAX_HTML=500000;
const ACTION_RE=/(submit|submission|add[-_ /]?(?:tool|startup|product)|list[-_ /]?(?:your|a)?[-_ /]?(?:tool|startup|product)|register|sign[-_ /]?up|contribute|partner|advertise)/i;
const CONTACT_RE=/(contact|about|editorial|press|partnership|partner|advertise|submit|contribute)/i;
const AUTH_RE=/(login|log in|sign in|create account|register|password)/i;
const CAPTCHA_RE=/(captcha|g-recaptcha|h-captcha|cf-turnstile|turnstile)/i;
const PAYMENT_RE=/(paid listing|payment required|sponsored listing|buy a listing|purchase a listing|listing fee|pay to submit)/i;
const RECIPROCAL_RE=/(reciprocal link|link back|backlink required|add (?:our|this) badge|badge required)/i;
const AUTOMATION_BLOCK_RE=/(automated submissions? (?:are )?(?:not allowed|prohibited)|no bots|bot submissions? prohibited)/i;
const PAGE_CACHE_TTL_MS=20*60*1000;
const PAGE_CACHE_MAX=500;
const PER_HOST_CONCURRENCY=3;
const pageCache=new Map();
const pageInflight=new Map();
const hostState=new Map();

function cacheGet(key){
  const item=pageCache.get(key);
  if(!item)return null;
  if(item.expiresAt<=Date.now()){pageCache.delete(key);return null}
  pageCache.delete(key);pageCache.set(key,item);
  return {...item.value,cacheHit:true};
}
function cacheSet(key,value,ttl=PAGE_CACHE_TTL_MS){
  pageCache.set(key,{value:{...value,cacheHit:false},expiresAt:Date.now()+ttl});
  while(pageCache.size>PAGE_CACHE_MAX)pageCache.delete(pageCache.keys().next().value);
}
function hostKey(url){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
async function acquireHost(url){
  const key=hostKey(url);if(!key)return()=>{};
  let state=hostState.get(key);
  if(!state){state={active:0,queue:[]};hostState.set(key,state)}
  if(state.active>=PER_HOST_CONCURRENCY)await new Promise(resolve=>state.queue.push(resolve));
  state.active++;
  return()=>{
    state.active=Math.max(0,state.active-1);
    const next=state.queue.shift();
    if(next)next();
    else if(state.active===0)hostState.delete(key);
  };
}


function safe(v,n=2000){return String(v??'').slice(0,n)}
function stripTags(v){return safe(v,8000).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function validPublicHttp(value){
  try{
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol))return false;
    const h=u.hostname.toLowerCase();
    if(h==='localhost'||h.endsWith('.local')||h==='::1'||h.startsWith('127.')||h.startsWith('10.')||h.startsWith('192.168.')||h.startsWith('169.254.'))return false;
    const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return false;
    return true;
  }catch{return false}
}
function sameHost(a,b){
  try{
    const x=new URL(a),y=new URL(b);
    const xh=x.hostname.replace(/^www\./,''),yh=y.hostname.replace(/^www\./,'');
    return xh===yh||xh.endsWith('.'+yh)||yh.endsWith('.'+xh);
  }catch{return false}
}
function absolute(href,base){
  try{const u=new URL(href,base);u.hash='';return validPublicHttp(u.toString())?u.toString():null}catch{return null}
}
function decodeEntities(v){return String(v||'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"')}
function extractLinks(html,base){
  const out=[];const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))&&out.length<500){
    const url=absolute(decodeEntities(m[1]),base);if(!url||!sameHost(base,url))continue;
    const text=stripTags(m[2]).slice(0,180);
    out.push({url,text});
  }
  return out;
}
function extractMailto(html){
  const out=[];const re=/<a\b[^>]*href=["'](mailto:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))&&out.length<20)out.push({url:decodeEntities(m[1]),text:stripTags(m[2]).slice(0,180),kind:'email'});
  return out;
}
function pageSignals(page){
  const text=stripTags(page.html).slice(0,120000);
  const lower=text.toLowerCase();
  return{
    auth:AUTH_RE.test(lower)||/<input[^>]+type=["']password["']/i.test(page.html),
    captcha:CAPTCHA_RE.test(page.html)||CAPTCHA_RE.test(lower),
    payment:PAYMENT_RE.test(lower),
    reciprocal:RECIPROCAL_RE.test(lower),
    automationBlocked:AUTOMATION_BLOCK_RE.test(lower),
    hasForm:/<form\b/i.test(page.html),
    title:safe((page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'',240),
    canonical:(page.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||page.html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)||[])[1]||null
  };
}
async function fetchPage(url){
  if(!validPublicHttp(url))return null;
  let key;try{const u=new URL(url);u.hash='';key=u.toString()}catch{return null}
  const cached=cacheGet(key);if(cached)return cached;
  if(pageInflight.has(key))return {...await pageInflight.get(key),cacheHit:true};
  const task=(async()=>{
    const release=await acquireHost(key);
    try{
      const r=await fetch(key,{headers:{'User-Agent':UA,'Accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'},redirect:'follow',signal:AbortSignal.timeout(12000)});
      const type=String(r.headers.get('content-type')||'').toLowerCase();
      const value=!r.ok||!type.includes('text/html')
        ?{ok:false,status:r.status,url:r.url||key,html:'',contentType:type}
        :{ok:true,status:r.status,url:r.url||key,html:(await r.text()).slice(0,MAX_HTML),contentType:type};
      cacheSet(key,value,value.ok?PAGE_CACHE_TTL_MS:3*60*1000);
      return value;
    }catch(error){
      const value={ok:false,status:0,url:key,error:safe(error?.message||error,300),html:''};
      cacheSet(key,value,60*1000);
      return value;
    }finally{release()}
  })();
  pageInflight.set(key,task);
  try{return {...await task,cacheHit:false}}finally{pageInflight.delete(key)}
}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let index=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=index++;if(i>=items.length)return;try{out[i]=await fn(items[i],i)}catch(error){out[i]={ok:false,error:safe(error?.message||error,500)}}}});
  await Promise.all(workers);return out;
}
function routeKind(link,page){
  const s=(link.text+' '+link.url).toLowerCase();
  if(page?.signals?.captcha)return'captcha';
  if(page?.signals?.auth)return'auth';
  if(ACTION_RE.test(s))return'submission';
  if(CONTACT_RE.test(s))return'contact';
  return'contact';
}
const ROLE_LOCAL_RE=/^(editorial|editor|partnerships?|partners?|submissions?|submit|newsletter|press|media|growth|marketing|hello|contact|team|info)([._+-].*)?$/i;
const EMAIL_RE=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
function hostFamily(a,b){
  const x=String(a||'').toLowerCase().replace(/^www\./,''),y=String(b||'').toLowerCase().replace(/^www\./,'');
  return Boolean(x&&y)&&(x===y||x.endsWith('.'+y)||y.endsWith('.'+x));
}
function publicRoleEmails(html,sourceUrl,expectedDomain){
  const out=[];const seen=new Set();
  const values=[...String(html||'').matchAll(EMAIL_RE)].map(m=>m[0]);
  for(const email of values){
    const [local,domain]=String(email).toLowerCase().split('@');
    if(!local||!domain||!ROLE_LOCAL_RE.test(local)||!hostFamily(domain,expectedDomain))continue;
    if(seen.has(email.toLowerCase()))continue;seen.add(email.toLowerCase());
    out.push({email:email.toLowerCase(),sourceUrl,role:local.split(/[._+-]/)[0]});
  }
  return out.slice(0,12);
}
async function researchRoleEmail(job){
  const p=job?.payload||{},source=String(p.url||''),expectedDomain=String(p.domain||'');
  if(p.authorizationClass!=='public_role_email_discovery_v1')return{ok:false,error:'email_discovery_contract_rejected'};
  if(!validPublicHttp(source)||!expectedDomain)return{ok:false,error:'invalid_email_discovery_target'};
  const first=await fetchPage(source);
  if(!first?.ok)return{ok:false,error:'source_unreachable',httpStatus:first?.status||0,targetUrl:source};
  const homepageEmails=publicRoleEmails(first.html,first.url,expectedDomain);
  if(homepageEmails.length)return{ok:true,targetUrl:source,finalUrl:first.url,httpStatus:first.status,roleEmails:homepageEmails,contactRoutes:[],pagesFetched:1,cacheHits:Number(Boolean(first.cacheHit)),classification:'public_role_email_found'};
  const candidates=[
    ...extractLinks(first.html,first.url).filter(x=>CONTACT_RE.test(x.text+' '+x.url)).map(x=>x.url),
    ...['/contact','/contact-us','/about','/team','/press','/media','/partners','/partnerships','/submit'].map(path=>absolute(path,first.url)).filter(Boolean)
  ];
  const urls=[...new Set(candidates)].filter(x=>x&&sameHost(first.url,x)).slice(0,10);
  const roleEmails=[];const seen=new Set();const contactRoutes=[];let pagesFetched=1,cacheHits=Number(Boolean(first.cacheHit));
  for(let i=0;i<urls.length;i+=4){
    const batchUrls=urls.slice(i,i+4);
    const pages=await mapLimit(batchUrls,4,fetchPage);
    for(let j=0;j<pages.length;j++){
      const page=pages[j],requested=batchUrls[j];
      if(!page?.ok)continue;
      pagesFetched++;cacheHits+=Number(Boolean(page.cacheHit));
      const signals=pageSignals(page);
      const routeUrl=page.url||requested;
      if(signals.hasForm||/(contact|partner|press|media|submit|contribute|editor)/i.test(new URL(routeUrl).pathname)){
        contactRoutes.push({url:routeUrl,kind:signals.hasForm?'form':'contact_page',hasForm:Boolean(signals.hasForm),auth:Boolean(signals.auth),captcha:Boolean(signals.captcha)});
      }
      for(const item of publicRoleEmails(page.html,page.url,expectedDomain)){
        if(seen.has(item.email))continue;seen.add(item.email);roleEmails.push(item);
      }
    }
    if(roleEmails.length)break;
  }
  const uniqueRoutes=[...new Map(contactRoutes.map(x=>[x.url,x])).values()].slice(0,8);
  return{ok:true,targetUrl:source,finalUrl:first.url,httpStatus:first.status,roleEmails:roleEmails.slice(0,12),contactRoutes:uniqueRoutes,pagesFetched,cacheHits,classification:roleEmails.length?'public_role_email_found':uniqueRoutes.length?'public_contact_route_found':'no_public_role_email_found'};
}
async function researchDistribution(job){
  const source=job?.payload?.url;
  if(!validPublicHttp(source))return{ok:false,error:'invalid_or_private_url'};
  const home=await fetchPage(source);
  if(!home?.ok)return{ok:false,error:'source_unreachable',httpStatus:home?.status||0,targetUrl:source,finalUrl:home?.url||source};
  home.signals=pageSignals(home);
  const links=extractLinks(home.html,home.url);
  const actionCandidates=links.filter(x=>ACTION_RE.test(x.text+' '+x.url)).slice(0,5);
  const contactCandidates=links.filter(x=>CONTACT_RE.test(x.text+' '+x.url)).slice(0,8);
  const unique=[...new Map([...actionCandidates,...contactCandidates].map(x=>[x.url,x])).values()].slice(0,8);
  const pages=await mapLimit(unique,4,async link=>{const p=await fetchPage(link.url);if(!p?.ok)return{link,page:p,signals:null};return{link,page:p,signals:pageSignals(p)}});
  const routes=[];
  for(const x of pages){
    if(!x?.page?.ok)continue;
    const signals=x.signals||{};
    if(ACTION_RE.test(x.link.text+' '+x.link.url)||signals.hasForm||signals.auth||signals.captcha){
      routes.push({url:x.page.url||x.link.url,kind:signals.captcha?'captcha':signals.auth?'auth':ACTION_RE.test(x.link.text+' '+x.link.url)?'submission':'contact',label:safe(x.link.text,160),hasForm:Boolean(signals.hasForm),auth:Boolean(signals.auth),captcha:Boolean(signals.captcha)});
    }
  }
  if(!routes.length&&(ACTION_RE.test(home.url)||home.signals.hasForm||home.signals.auth||home.signals.captcha)){
    routes.push({url:home.url,kind:home.signals.captcha?'captcha':home.signals.auth?'auth':ACTION_RE.test(home.url)?'submission':'contact',label:'source route',hasForm:Boolean(home.signals.hasForm),auth:Boolean(home.signals.auth),captcha:Boolean(home.signals.captcha)});
  }
  const mailto=extractMailto(home.html);
  const contactRoutes=[
    ...mailto,
    ...contactCandidates.slice(0,8).map(x=>({url:x.url,text:x.text,kind:'form'}))
  ];
  const blockers=[];
  for(const [name,flag] of Object.entries({payment:home.signals.payment,reciprocal:home.signals.reciprocal,automation_blocked:home.signals.automationBlocked}))if(flag)blockers.push(name);
  for(const x of pages){
    if(!x?.signals)continue;
    if(x.signals.payment&&!blockers.includes('payment'))blockers.push('payment');
    if(x.signals.reciprocal&&!blockers.includes('reciprocal'))blockers.push('reciprocal');
    if(x.signals.automationBlocked&&!blockers.includes('automation_blocked'))blockers.push('automation_blocked');
  }
  return{
    ok:true,targetUrl:source,finalUrl:home.url,httpStatus:home.status,
    classification:blockers.length?'policy_signal':routes.length?'route_found':contactRoutes.length?'contact_found':'no_route_found',
    routes:routes.slice(0,8),contactRoutes:contactRoutes.slice(0,12),blockers,
    evidence:{title:home.signals.title,canonical:home.signals.canonical,actionLinksScanned:actionCandidates.length,contactLinksScanned:contactCandidates.length,pagesFetched:1+pages.filter(x=>x?.page?.ok).length,cacheHits:Number(Boolean(home.cacheHit))+pages.filter(x=>x?.page?.cacheHit).length}
  };
}

function responseEvidenceFromText(text,endpoint){
  try{
    const parsed=JSON.parse(String(text||''));
    const keys=['public_url','publicUrl','listing_url','listingUrl','profile_url','profileUrl','status_url','statusUrl','resource_url','resourceUrl','url','href'];
    const walk=(v,depth=0)=>{
      if(depth>4||v==null)return null;
      if(typeof v==='string'){try{const u=new URL(v,endpoint);return validPublicHttp(u.href)&&sameHost(endpoint,u.href)?u.href:null}catch{return null}}
      if(Array.isArray(v)){for(const x of v){const hit=walk(x,depth+1);if(hit)return hit}return null}
      if(typeof v!=='object')return null;
      for(const k of keys)if(v[k]){const hit=walk(v[k],depth+1);if(hit)return hit}
      for(const x of Object.values(v)){const hit=walk(x,depth+1);if(hit)return hit}
      return null;
    };
    return walk(parsed);
  }catch{return null}
}
async function safeSameHostGet(start,headers,maxHops=3){
  let current=start;
  for(let i=0;i<=maxHops;i++){
    if(!validPublicHttp(current)||!sameHost(start,current))return{ok:false,status:0,url:current,error:'unsafe_redirect_target'};
    const r=await fetch(current,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(r.status>=300&&r.status<400){
      const next=absolute(r.headers.get('location')||'',current);
      if(!next||!sameHost(start,next))return{ok:false,status:r.status,url:current,error:'cross_host_redirect_blocked'};
      current=next;continue;
    }
    return{ok:r.ok,status:r.status,url:current,response:r};
  }
  return{ok:false,status:0,url:current,error:'redirect_limit'};
}
async function executeAuthorizedHttpAction(job){
  const p=job?.payload||{},endpoint=String(p.endpoint||''),method=String(p.method||'POST').toUpperCase(),contentType=String(p.contentType||'application/json').toLowerCase(),body=String(p.body||'');
  if(p.authorizationClass!=='verified_free_auto_adapter_v1')return{ok:false,error:'authorization_class_rejected'};
  if(!validPublicHttp(endpoint))return{ok:false,error:'invalid_or_private_endpoint'};
  if(!['POST','PUT','PATCH'].includes(method))return{ok:false,error:'method_not_authorized'};
  if(!['application/json','application/x-www-form-urlencoded'].includes(contentType))return{ok:false,error:'content_type_not_authorized'};
  if(body.length>50000)return{ok:false,error:'body_too_large'};
  try{
    const headers={'Content-Type':contentType,'Accept':'application/json,text/html;q=0.9,*/*;q=0.8','User-Agent':'ToolScout External Execution/1.0 (+https://trytoolscout.org/)'};
    const response=await fetch(endpoint,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(15000)});
    const location=response.headers.get('location');
    let evidenceUrl=null,finalUrl=endpoint,httpStatus=response.status,accepted=response.ok;
    if(response.status>=300&&response.status<400&&location){
      const next=absolute(location,endpoint);
      if(next&&sameHost(endpoint,next)){
        evidenceUrl=next;finalUrl=next;
        const followed=await safeSameHostGet(next,{'Accept':headers.Accept,'User-Agent':headers['User-Agent']},2);
        accepted=followed.ok;httpStatus=followed.status||response.status;finalUrl=followed.url||next;
      }
    }
    let text='';
    try{text=(await response.text()).slice(0,12000)}catch{}
    if(!evidenceUrl)evidenceUrl=responseEvidenceFromText(text,endpoint);
    return{
      ok:accepted,httpStatus,targetUrl:endpoint,finalUrl,evidenceUrl,
      responseType:safe(response.headers.get('content-type')||'',160),
      authorizationClass:p.authorizationClass
    };
  }catch(error){return{ok:false,httpStatus:0,targetUrl:endpoint,error:safe(error?.message||error,500),authorizationClass:p.authorizationClass}}
}
async function executeAuthorizedVerification(job){
  const p=job?.payload||{},target=String(p.targetUrl||'');
  if(p.authorizationClass!=='verified_publication_check_v1')return{ok:false,error:'authorization_class_rejected'};
  if(!validPublicHttp(target))return{ok:false,error:'invalid_or_private_target'};
  try{
    const r=await safeSameHostGet(target,{'Accept':'application/json,text/html;q=0.9,*/*;q=0.8','User-Agent':'ToolScout External Verifier/1.0 (+https://trytoolscout.org/)'},3);
    return{ok:r.ok,httpStatus:r.status,targetUrl:target,finalUrl:r.url||target,error:r.error||null,authorizationClass:p.authorizationClass};
  }catch(error){return{ok:false,httpStatus:0,targetUrl:target,error:safe(error?.message||error,500),authorizationClass:p.authorizationClass}}
}
export function runtimeStats(){
  let hostQueued=0,hostActive=0;
  for(const state of hostState.values()){hostActive+=Number(state.active||0);hostQueued+=Array.isArray(state.queue)?state.queue.length:0}
  return{pageCacheEntries:pageCache.size,pageInflight:pageInflight.size,activeHosts:hostState.size,hostActive,hostQueued,perHostConcurrency:PER_HOST_CONCURRENCY,pageCacheMax:PAGE_CACHE_MAX,pageCacheTtlMinutes:PAGE_CACHE_TTL_MS/60000};
}
export async function researchJob(job){
  const started=Date.now();
  try{
    const work=(async()=>{
      if(job?.type==='distribution_route_research'||job?.type==='contact_route_research')return researchDistribution(job);
      if(job?.type==='publisher_role_email_research'||job?.type==='vendor_role_email_research'||job?.type==='contact_supply_public_research')return researchRoleEmail(job);
      if(job?.type==='authorized_http_action')return executeAuthorizedHttpAction(job);
      if(job?.type==='authorized_verification')return executeAuthorizedVerification(job);
      return {ok:false,error:'unsupported_job_type'};
    })();
    const deadlineMs=(job?.type==='contact_supply_public_research'||job?.type==='publisher_role_email_research'||job?.type==='vendor_role_email_research')?45000:60000;
    const timeout=new Promise(resolve=>setTimeout(()=>resolve({ok:false,error:'job_deadline_exceeded',deadlineMs}),deadlineMs));
    const result=await Promise.race([work,timeout]);
    return{jobId:job?.jobId||null,...result,durationMs:Date.now()-started};
  }catch(error){return{jobId:job?.jobId||null,ok:false,error:safe(error?.message||error,500),durationMs:Date.now()-started}}
}
export async function runResearchBatch(jobs,{concurrency=24}={}){
  return mapLimit(Array.isArray(jobs)?jobs:[],Math.max(1,Math.min(48,Number(concurrency)||24)),researchJob);
}
