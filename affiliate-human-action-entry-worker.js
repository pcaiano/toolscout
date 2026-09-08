import base from './human-action-entry-worker.js';
import { recordAffiliateHumanAction } from './affiliate-human-action-state.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const SESSION_COOKIE='toolscout_cc';
const SESSION_TTL_SECONDS=86400;
function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'}
async function digestHex(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function sessionBucket(now=Date.now()){return Math.floor(now/(SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function validSession(request,env){if(!env.ADMIN_TOKEN)return false;const cookie=request.headers.get('Cookie')||'';const match=cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));if(!match)return false;const supplied=decodeURIComponent(match[1]);const bucket=sessionBucket();for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;return false}

function recorderScript(){return `<script>(function(){function addButtons(){document.querySelectorAll('[data-human-open^="affiliate:"]').forEach(function(open){if(open.parentElement.querySelector('[data-affiliate-record]'))return;var id=(open.getAttribute('data-human-open')||'').split(':').slice(1).join(':');if(!id)return;['contacted','submitted'].forEach(function(event){var b=document.createElement('button');b.className='btn';b.type='button';b.setAttribute('data-affiliate-record',event);b.setAttribute('data-tool-slug',id);b.textContent=event==='contacted'?'Record contacted':'Record submitted';open.parentElement.appendChild(b)})})}function refreshSoon(){setTimeout(addButtons,150);setTimeout(addButtons,900)}document.addEventListener('click',function(e){var b=e.target.closest('[data-affiliate-record]');if(!b)return;var event=b.getAttribute('data-affiliate-record'),slug=b.getAttribute('data-tool-slug');if(!event||!slug)return;b.disabled=true;var old=b.textContent;b.textContent='Saving…';fetch('/analytics/api/affiliate-human-action',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool_slug:slug,event:event,evidence:'Confirmed from Command Center human action queue'})}).then(function(r){return r.json().then(function(d){if(!r.ok||!d.ok)throw new Error(d.error||'save_failed');return d})}).then(function(){b.textContent='Recorded';setTimeout(function(){var rb=document.getElementById('refreshHumanActions');if(rb)rb.click()},150)}).catch(function(){b.disabled=false;b.textContent='Save failed';setTimeout(function(){b.textContent=old},1800)})});var observer=new MutationObserver(refreshSoon);var root=document.getElementById('humanActionSection')||document.body;observer.observe(root,{childList:true,subtree:true});refreshSoon()})();</script>`}
function inject(html){if(html.includes('data-affiliate-record'))return html;return html.replace('</body>',recorderScript()+'</body>')}

export default {
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='POST'&&u.pathname==='/analytics/api/affiliate-human-action'){
      if(!(await validSession(request,env)))return Response.json({ok:false,error:'command_center_session_expired'},{status:401,headers:JSON_H});
      let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers:JSON_H})}
      const result=await recordAffiliateHumanAction(env,body);
      return Response.json(result,{status:result.ok?200:400,headers:JSON_H});
    }
    const r=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&analyticsPath(u.pathname)&&r.ok&&(r.headers.get('Content-Type')||'').includes('text/html')){
      const h=new Headers(r.headers);h.delete('Content-Length');h.set('Cache-Control','private, no-store');
      return new Response(inject(await r.text()),{status:r.status,headers:h});
    }
    return r;
  },
  async scheduled(event,env,ctx){return base.scheduled?base.scheduled(event,env,ctx):undefined}
};
