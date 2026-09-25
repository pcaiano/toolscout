import http from 'node:http';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer';

const PORT=Number(process.env.PORT||10000);
const SHARED_SECRET=String(process.env.AUTH_BROKER_SHARED_SECRET||'');
const MAX_SESSIONS=2;
const SESSION_TTL_MS=20*60*1000;
const VIEWPORT={width:1280,height:800};
const sessions=new Map();
let browserPromise=null;

const safe=(v,n=4000)=>String(v??'').slice(0,n);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
function json(res,status,body){const data=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':Buffer.byteLength(data)});res.end(data)}
function html(res,status,body){res.writeHead(status,{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"});res.end(body)}
function publicHttp(v){try{const u=new URL(String(v||''));if(!['http:','https:'].includes(u.protocol))return null;const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.local')||h==='::1'||h.startsWith('127.')||h.startsWith('10.')||h.startsWith('192.168.')||h.startsWith('169.254.'))return null;const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return null;return u.toString()}catch{return null}}
function sameHost(a,b){try{const x=new URL(a).hostname.replace(/^www\./,''),y=new URL(b).hostname.replace(/^www\./,'');return x===y||x.endsWith('.'+y)||y.endsWith('.'+x)}catch{return false}}
function bearer(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'')}
function authorized(req){return SHARED_SECRET.length>=32&&crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(bearer(req)).digest()),Buffer.from(crypto.createHash('sha256').update(SHARED_SECRET).digest()))}
function tokenHash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}
function randomToken(){return crypto.randomBytes(32).toString('base64url')}
async function readJson(req,limit=2_000_000){return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>limit){reject(new Error('body_too_large'));req.destroy();return}chunks.push(c)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}
async function browser(){
  if(!browserPromise)browserPromise=puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check']}).catch(error=>{browserPromise=null;throw error});
  return browserPromise;
}
async function applyState(context,page,state,target){
  const cookies=Array.isArray(state?.cookies)?state.cookies.filter(c=>c&&c.name&&c.value):[];
  if(cookies.length){try{await context.setCookie(...cookies)}catch{}}
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>null);
  const origin=(()=>{try{return new URL(page.url()).origin}catch{return null}})();
  const stores=Array.isArray(state?.localStorage)?state.localStorage:[];
  const store=stores.find(x=>x?.origin===origin);
  if(store&&Array.isArray(store.entries)){
    try{await page.evaluate(entries=>{for(const [k,v] of entries)localStorage.setItem(k,v)},store.entries.filter(x=>Array.isArray(x)&&x.length===2).slice(0,200))}catch{}
    await page.reload({waitUntil:'domcontentloaded',timeout:15000}).catch(()=>null);
  }
}
async function exportState(context,page){
  const cookies=await context.cookies();
  let localStorage=[];
  try{
    const origin=new URL(page.url()).origin;
    const entries=await page.evaluate(()=>Object.entries(window.localStorage||{}).slice(0,200));
    localStorage=[{origin,entries}];
  }catch{}
  return{cookies,localStorage};
}
async function inspectPage(page){
  let info={};
  try{
    info=await page.evaluate(()=>{
      const text=(document.body?.innerText||'').slice(0,120000);
      const html=(document.documentElement?.innerHTML||'').slice(0,250000);
      const fields=[...document.querySelectorAll('input,textarea,select')].slice(0,80).map(el=>{
        const id=el.id||'',name=el.getAttribute('name')||'',type=(el.getAttribute('type')||el.tagName||'').toLowerCase(),placeholder=el.getAttribute('placeholder')||'';
        let label='';if(id){const lab=document.querySelector('label[for="'+CSS.escape(id)+'"]');if(lab)label=(lab.textContent||'').trim()}
        if(!label){const lab=el.closest('label');if(lab)label=(lab.textContent||'').trim()}
        return{name,type,placeholder,label:label.slice(0,180),required:Boolean(el.required)};
      });
      return{text,html,fields,title:document.title||'',forms:document.forms?.length||0,passwordFields:document.querySelectorAll('input[type="password"]').length};
    });
  }catch{}
  const hay=(String(info.text||'')+' '+String(info.html||'')).toLowerCase();
  const challenge=/g-recaptcha|h-captcha|cf-turnstile|turnstile|captcha|verify you are human|human verification/.test(hay);
  const paid=/paid listing|listing fee|purchase|checkout|payment required|premium only/.test(hay);
  const loginPresent=Number(info.passwordFields||0)>0||/\b(sign in|log in|login)\b/.test(String(info.text||'').toLowerCase())&&/password/.test(String(info.text||'').toLowerCase());
  const hasForm=Number(info.forms||0)>0&&Array.isArray(info.fields)&&info.fields.some(f=>!['hidden','submit','button'].includes(f.type));
  let routeType='unknown';
  if(loginPresent)routeType='login_page';else if(challenge)routeType='human_challenge';else if(hasForm)routeType='submission_form';
  return{routeType,challengeDetected:challenge,challengeType:challenge?'captcha_or_human_verification':null,paidSignal:paid,loginPresent,form:hasForm?{fields:info.fields}:null,evidence:safe(info.title+' | '+String(info.text||'').replace(/\s+/g,' ').slice(0,700),1000)};
}
async function newContext(target,state){
  const b=await browser(),context=await b.createBrowserContext();
  const page=await context.newPage();await page.setViewport(VIEWPORT);
  await applyState(context,page,state,target);
  return{context,page};
}
function validSession(id,token){const s=sessions.get(id);if(!s||s.expiresAt<=Date.now())return null;const supplied=tokenHash(token);const a=Buffer.from(s.tokenHash),b=Buffer.from(supplied);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;return s}
function sessionPage(id,token){
  const t=encodeURIComponent(token),sid=encodeURIComponent(id);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolScout secure login</title><style>
  body{font-family:system-ui,sans-serif;margin:0;background:#f5f6f8;color:#16181d}.bar{padding:12px 16px;background:#111827;color:white;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.wrap{max-width:1320px;margin:auto;padding:12px}.shot{width:100%;max-width:1280px;border:1px solid #cfd4dc;background:white;cursor:crosshair}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}button,input{font:inherit;padding:9px 11px;border:1px solid #b8c0cc;border-radius:8px;background:white}button{cursor:pointer}.primary{background:#111827;color:white}.note{font-size:13px;color:#4b5563}.url{font-family:monospace;overflow-wrap:anywhere}</style></head><body>
  <div class="bar"><b>ToolScout secure login session</b><span id="status">Ready</span></div><div class="wrap">
  <p class="note">Complete login, MFA or CAPTCHA yourself. ToolScout does not solve CAPTCHA and does not store the password or OTP you type here. When authenticated, press <b>Save session & resume</b>.</p>
  <div class="url" id="url"></div>
  <div class="controls"><button id="refresh">Refresh view</button><button data-key="Tab">Tab</button><button data-key="Enter">Enter</button><button id="back">Back</button><button id="up">Scroll up</button><button id="down">Scroll down</button></div>
  <div class="controls"><input id="text" type="password" autocomplete="off" placeholder="Type into focused browser field"><button id="type">Type into page</button><button id="clear">Clear</button></div>
  <img id="shot" class="shot" alt="Live browser screenshot">
  <div class="controls"><button class="primary" id="save">Save session & resume automation</button></div></div>
  <script>
  const sid='${sid}',tok='${t}',shot=document.getElementById('shot'),statusEl=document.getElementById('status'),urlEl=document.getElementById('url');
  async function call(action,payload={}){statusEl.textContent='Working…';const r=await fetch('/session/'+sid+'/action?token='+tok,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});const d=await r.json();if(!r.ok){statusEl.textContent=d.error||'Error';throw new Error(d.error)}statusEl.textContent=d.status||'Ready';if(d.currentUrl)urlEl.textContent=d.currentUrl;await view();return d}
  async function view(){shot.src='/session/'+sid+'/screenshot?token='+tok+'&t='+Date.now();fetch('/session/'+sid+'/state?token='+tok).then(r=>r.json()).then(d=>{if(d.currentUrl)urlEl.textContent=d.currentUrl;if(d.challengeDetected)statusEl.textContent='Human verification detected — complete it manually';}).catch(()=>{})}
  shot.addEventListener('click',e=>{const r=shot.getBoundingClientRect();call('click',{x:Math.round((e.clientX-r.left)/r.width*1280),y:Math.round((e.clientY-r.top)/r.height*800)})});
  document.getElementById('type').onclick=async()=>{const el=document.getElementById('text');const value=el.value;el.value='';await call('type',{text:value})};
  document.getElementById('clear').onclick=()=>document.getElementById('text').value='';
  document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>call('key',{key:b.dataset.key}));
  document.getElementById('refresh').onclick=()=>call('refresh');document.getElementById('back').onclick=()=>call('back');document.getElementById('up').onclick=()=>call('scroll',{dy:-650});document.getElementById('down').onclick=()=>call('scroll',{dy:650});
  document.getElementById('save').onclick=async()=>{const b=document.getElementById('save');b.disabled=true;try{const d=await call('save');statusEl.textContent=d.status||'Session saved. You may close this tab.'}catch{b.disabled=false}};
  view();setInterval(()=>{if(!document.hidden)view()},5000);
  </script></body></html>`;
}
async function completeSession(s){
  const inspection=await inspectPage(s.page);
  if(inspection.loginPresent)return{ok:false,error:'login_still_present',inspection};
  const sessionState=await exportState(s.context,s.page);
  const response=await fetch(s.completionUrl,{method:'POST',headers:{Authorization:'Bearer '+s.completionToken,'Content-Type':'application/json','User-Agent':'ToolScout-Auth-Broker/1.0'},body:JSON.stringify({sessionState,currentUrl:s.page.url(),challengeDetected:inspection.challengeDetected,challengeResolved:!inspection.loginPresent}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)return{ok:false,error:'toolscout_callback_http_'+response.status};
  await s.context.close().catch(()=>{});sessions.delete(s.id);
  return{ok:true,status:'Session saved. ToolScout automation resumed.'};
}
async function ephemeralInspect(body){
  const target=publicHttp(body?.targetUrl);if(!target)return{status:400,body:{error:'invalid_target'}};
  const {context,page}=await newContext(target,body?.sessionState||null);
  try{
    const inspection=await inspectPage(page);
    const sessionState=await exportState(context,page);
    return{status:200,body:{ok:true,currentUrl:page.url(),sessionState,...inspection}};
  }finally{await context.close().catch(()=>{})}
}
setInterval(async()=>{const now=Date.now();for(const [id,s] of sessions){if(s.expiresAt<=now){await s.context.close().catch(()=>{});sessions.delete(id)}}},60000).unref();

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'toolscout-auth-broker',activeSessions:sessions.size,maxSessions:MAX_SESSIONS,captchaPolicy:'human_only_no_bypass',passwordStorage:false});
  if(req.method==='GET'&&url.pathname==='/browser-health'){
    let context=null;
    try{
      const b=await browser();
      context=await b.createBrowserContext();
      const page=await context.newPage();
      await page.setViewport(VIEWPORT);
      await page.goto('about:blank');
      const version=await b.version();
      await context.close();
      return json(res,200,{ok:true,browser:'chromium',version,viewport:VIEWPORT});
    }catch(error){
      if(context)await context.close().catch(()=>{});
      return json(res,500,{ok:false,error:'browser_unavailable',detail:safe(error?.message||error,300)});
    }
  }
  if(req.method==='GET'&&url.pathname==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('User-agent: *\\nDisallow: /\\n')}
  if(req.method==='POST'&&url.pathname==='/auth/start'){
    if(!authorized(req))return json(res,401,{error:'unauthorized'});
    if(sessions.size>=MAX_SESSIONS)return json(res,429,{error:'session_capacity_reached'});
    let body;try{body=await readJson(req)}catch{return json(res,400,{error:'invalid_json'})}
    const target=publicHttp(body?.targetUrl),completionUrl=publicHttp(body?.completionUrl);
    if(!target||!completionUrl)return json(res,400,{error:'invalid_target_or_callback'});
    const id=safe(body?.handoffId,100);if(!/^ah_[a-zA-Z0-9-]+$/.test(id))return json(res,400,{error:'invalid_handoff_id'});
    const existing=sessions.get(id);if(existing)return json(res,200,{ok:true,sessionId:id,handoffUrl:existing.handoffUrl,expiresAt:new Date(existing.expiresAt).toISOString()});
    let context,page;try{({context,page}=await newContext(target,body?.initialState||null))}catch(error){return json(res,502,{error:'browser_start_failed',detail:safe(error?.message||error,300)})}
    const token=randomToken(),expiresAt=Date.now()+SESSION_TTL_MS;
    const base=`https://${req.headers.host}`,handoffUrl=`${base}/session/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
    sessions.set(id,{id,tokenHash:tokenHash(token),handoffUrl,expiresAt,context,page,target,completionUrl,completionToken:safe(body?.completionToken,200)});
    return json(res,201,{ok:true,sessionId:id,handoffUrl,expiresAt:new Date(expiresAt).toISOString()});
  }
  if(req.method==='POST'&&url.pathname==='/auth/inspect'){
    if(!authorized(req))return json(res,401,{error:'unauthorized'});
    let body;try{body=await readJson(req)}catch{return json(res,400,{error:'invalid_json'})}
    try{const out=await ephemeralInspect(body);return json(res,out.status,out.body)}catch(error){return json(res,502,{error:'browser_inspect_failed',detail:safe(error?.message||error,300)})}
  }
  const m=url.pathname.match(/^\/session\/(ah_[A-Za-z0-9-]+)$/);
  if(req.method==='GET'&&m){
    const token=url.searchParams.get('token')||'',s=validSession(m[1],token);if(!s)return html(res,403,'Expired or invalid secure session.');
    return html(res,200,sessionPage(m[1],token));
  }
  const sm=url.pathname.match(/^\/session\/(ah_[A-Za-z0-9-]+)\/screenshot$/);
  if(req.method==='GET'&&sm){
    const s=validSession(sm[1],url.searchParams.get('token')||'');if(!s)return json(res,403,{error:'invalid_session'});
    try{const png=await s.page.screenshot({type:'png'});res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','Content-Length':png.length});return res.end(png)}catch{return json(res,500,{error:'screenshot_failed'})}
  }
  const stm=url.pathname.match(/^\/session\/(ah_[A-Za-z0-9-]+)\/state$/);
  if(req.method==='GET'&&stm){
    const s=validSession(stm[1],url.searchParams.get('token')||'');if(!s)return json(res,403,{error:'invalid_session'});
    const inspection=await inspectPage(s.page);return json(res,200,{ok:true,currentUrl:s.page.url(),...inspection});
  }
  const am=url.pathname.match(/^\/session\/(ah_[A-Za-z0-9-]+)\/action$/);
  if(req.method==='POST'&&am){
    const s=validSession(am[1],url.searchParams.get('token')||'');if(!s)return json(res,403,{error:'invalid_session'});
    let body;try{body=await readJson(req,100000)}catch{return json(res,400,{error:'invalid_json'})}
    try{
      const action=String(body?.action||'');
      if(action==='click'){await s.page.mouse.click(Math.max(0,Math.min(VIEWPORT.width,num(body.x))),Math.max(0,Math.min(VIEWPORT.height,num(body.y))))}
      else if(action==='type'){await s.page.keyboard.type(safe(body?.text,1000),{delay:15})}
      else if(action==='key'){const key=String(body?.key||'');if(!['Tab','Enter','Escape','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key))return json(res,400,{error:'key_not_allowed'});await s.page.keyboard.press(key)}
      else if(action==='scroll'){await s.page.mouse.wheel({deltaY:Math.max(-2000,Math.min(2000,num(body.dy)))})}
      else if(action==='refresh'){await s.page.reload({waitUntil:'domcontentloaded',timeout:15000}).catch(()=>null)}
      else if(action==='back'){await s.page.goBack({waitUntil:'domcontentloaded',timeout:15000}).catch(()=>null)}
      else if(action==='save'){const done=await completeSession(s);return json(res,done.ok?200:409,done)}
      else return json(res,400,{error:'action_not_allowed'});
      await new Promise(r=>setTimeout(r,250));const inspection=await inspectPage(s.page);return json(res,200,{ok:true,status:inspection.challengeDetected?'Human verification detected — complete it manually':'Ready',currentUrl:s.page.url(),...inspection});
    }catch(error){return json(res,500,{error:'browser_action_failed',detail:safe(error?.message||error,300)})}
  }
  return json(res,404,{error:'not_found'});
});
server.listen(PORT,'0.0.0.0',()=>console.log(JSON.stringify({event:'listening',service:'toolscout-auth-broker',port:PORT,maxSessions:MAX_SESSIONS})));
