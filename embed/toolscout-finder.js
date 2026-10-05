(()=>{
  const current=document.currentScript;
  if(!current)return;

  const API='https://trytoolscout.org/api/recommend';
  const EVENTS='https://trytoolscout.org/api/distribution/embed-event';
  const HOME='https://trytoolscout.org/';
  const clean=(v,max=120)=>String(v||'').replace(/[^A-Za-z0-9._:-]/g,'').slice(0,max);
  const host=clean(location.hostname.replace(/^www\./,''),120)||'embedded';
  const publisher=clean(current.dataset.publisher||host,120)||host;
  const mode=current.dataset.mode==='mini'?'mini':'full';
  const theme=current.dataset.theme==='light'?'light':'dark';
  const limit=mode==='mini'?1:Math.max(1,Math.min(3,Number.parseInt(current.dataset.limit||'3',10)||3));
  const shouldTrack=current.dataset.track!=='false';
  const root=document.createElement('div');
  root.setAttribute('data-toolscout-embed','finder');
  root.setAttribute('data-toolscout-mode',mode);
  const shadow=root.attachShadow({mode:'open'});

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const trackedUrl=(path,content='finder')=>{
    const url=new URL(path,HOME);
    url.searchParams.set('utm_source',publisher);
    url.searchParams.set('utm_medium','embed');
    url.searchParams.set('utm_campaign','toolscout_finder');
    url.searchParams.set('utm_content',content);
    return url.toString();
  };
  const event=(eventType,fields={})=>{
    if(!shouldTrack)return;
    const payload={
      embed_type:'finder',
      event:eventType,
      publisher_id:publisher,
      publisher_host:host,
      asset_id:'finder',
      mode,
      ...fields
    };
    try{
      const body=JSON.stringify(payload);
      if(navigator.sendBeacon){
        navigator.sendBeacon(EVENTS,new Blob([body],{type:'text/plain;charset=UTF-8'}));
      }else{
        fetch(EVENTS,{method:'POST',headers:{'content-type':'text/plain;charset=UTF-8'},body,keepalive:true,mode:'cors'}).catch(()=>{});
      }
    }catch{}
  };

  const palette=theme==='light'
    ?{bg:'#F3F5F1',panel:'#FFFFFF',text:'#0B0D0C',muted:'#5F665F',line:'#D9DED7',lime:'#86C900',limeText:'#0B0D0C'}
    :{bg:'#0B0D0C',panel:'#141814',text:'#F3F5F1',muted:'#A8B0A6',line:'#2C332D',lime:'#B7FF3C',limeText:'#0B0D0C'};

  shadow.innerHTML=\`
    <style>
      :host{all:initial}
      *,*::before,*::after{box-sizing:border-box}
      .tsf{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:\${palette.text};background:\${palette.bg};border:1px solid \${palette.line};border-radius:20px;padding:18px;max-width:680px;box-shadow:0 16px 38px rgba(0,0,0,.12)}
      .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
      .eyebrow{font-size:10px;line-height:1.2;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:\${palette.lime}}
      .mode{font-size:10px;color:\${palette.muted}}
      h2{font-size:\${mode==='mini'?'20px':'27px'};line-height:1.08;letter-spacing:-.035em;margin:0 0 7px;font-weight:850}
      .intro{font-size:13px;line-height:1.55;color:\${palette.muted};margin:0 0 14px}
      form{display:flex;gap:8px;align-items:stretch}
      input{min-width:0;flex:1;border:1px solid \${palette.line};border-radius:12px;background:\${palette.panel};color:\${palette.text};font:inherit;font-size:14px;padding:12px 13px;outline:none}
      input:focus{border-color:\${palette.lime};box-shadow:0 0 0 3px color-mix(in srgb,\${palette.lime} 20%,transparent)}
      button{border:0;border-radius:12px;background:\${palette.lime};color:\${palette.limeText};font:800 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:0 16px;cursor:pointer;min-height:44px}
      button:disabled{opacity:.58;cursor:wait}
      .status{display:none;margin-top:12px;font-size:12px;color:\${palette.muted};align-items:center;gap:8px}
      .status.show{display:flex}
      .dot{width:8px;height:8px;border-radius:50%;background:\${palette.lime};animation:pulse 1.15s ease-in-out infinite}
      .results{display:grid;gap:9px;margin-top:13px}
      .result{background:\${palette.panel};border:1px solid \${palette.line};border-radius:14px;padding:13px;animation:reveal 180ms ease both}
      .result-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .category{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:\${palette.muted};font-weight:750}
      .name{font-size:17px;line-height:1.1;font-weight:850;margin-top:3px}
      .match{font-size:11px;font-weight:850;white-space:nowrap;color:\${palette.lime}}
      .description{font-size:12px;line-height:1.5;color:\${palette.muted};margin:8px 0}
      .reasons{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 10px}
      .reason{font-size:10px;border:1px solid \${palette.line};border-radius:999px;padding:5px 7px;color:\${palette.muted}}
      .actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
      .actions a{font-size:11px;font-weight:800;text-decoration:none}
      .profile{color:\${palette.text};border-bottom:1px solid \${palette.line};padding-bottom:2px}
      .vendor{color:\${palette.lime}}
      .footer{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px;padding-top:11px;border-top:1px solid \${palette.line};font-size:10px;color:\${palette.muted}}
      .footer a{color:\${palette.muted};text-decoration:none}
      .footer a strong{color:\${palette.text}}
      .error{margin-top:12px;border:1px solid \${palette.line};border-radius:12px;padding:11px 12px;font-size:12px;line-height:1.45;color:\${palette.muted};background:\${palette.panel}}
      @keyframes pulse{0%,100%{opacity:.35;transform:scale(.86)}50%{opacity:1;transform:scale(1)}}
      @keyframes reveal{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
      @media(max-width:520px){.tsf{padding:15px;border-radius:16px}form{flex-direction:column}button{width:100%}.footer{align-items:flex-start;flex-direction:column}}
      @media(prefers-reduced-motion:reduce){.dot,.result{animation:none}}
    </style>
    <section class="tsf" aria-label="ToolScout Software Finder">
      <div class="top"><span class="eyebrow">ToolScout Finder</span><span class="mode">\${mode==='mini'?'Mini':'Full'}</span></div>
      <h2>Find the right software for the job.</h2>
      <p class="intro">Describe what you need. ToolScout narrows the market using workflow fit, constraints and verified catalog evidence.</p>
      <form novalidate>
        <input name="q" maxlength="300" required autocomplete="off" placeholder="e.g. CRM for a 5-person sales team" aria-label="Describe the software you need">
        <button type="submit">Find tools</button>
      </form>
      <div class="status" role="status" aria-live="polite"><span class="dot"></span><span>Matching your need to the catalog...</span></div>
      <div class="results" aria-live="polite"></div>
      <div class="footer"><span>Independent recommendations. No pay to rank.</span><a href="\${esc(trackedUrl('/','powered-by-toolscout'))}" target="_blank" rel="noopener"><strong>Powered by ToolScout</strong></a></div>
    </section>\`;

  const form=shadow.querySelector('form');
  const input=shadow.querySelector('input');
  const button=shadow.querySelector('button');
  const status=shadow.querySelector('.status');
  const results=shadow.querySelector('.results');

  function renderError(message){
    results.innerHTML=\`<div class="error">\${esc(message)}</div>\`;
  }

  function renderResults(data){
    const items=Array.isArray(data.recommendations)?data.recommendations:[];
    if(!items.length){
      renderError('No reliable match yet. Add the job, team size, budget or a must-have feature.');
      return;
    }
    results.innerHTML=items.map((item,index)=>{
      const match=item.match_type==='category_fit'
        ?esc(item.match_label||'Strong category fit')
        :esc(item.match_label||\`\${Number(item.match||0)}% match\`);
      const reasons=(item.reasons||[]).slice(0,mode==='mini'?2:3).map(reason=>\`<span class="reason">\${esc(reason)}</span>\`).join('');
      const profile=trackedUrl(item.profile_url||\`/tools/\${encodeURIComponent(item.slug)}\`,item.slug);
      const vendor=new URL(\`/go/\${encodeURIComponent(item.slug)}\`,HOME);
      vendor.searchParams.set('source',\`embed:\${publisher}\`);
      vendor.searchParams.set('utm_source',publisher);
      vendor.searchParams.set('utm_medium','embed');
      vendor.searchParams.set('utm_campaign','toolscout_finder');
      vendor.searchParams.set('utm_content',item.slug);
      return \`<article class="result" style="animation-delay:\${index*45}ms">
        <div class="result-top"><div><div class="category">\${esc(item.category||'Software')}</div><div class="name">\${esc(item.name)}</div></div><div class="match">\${match}</div></div>
        \${mode==='mini'?'':\`<div class="description">\${esc(item.description||'')}</div>\`}
        <div class="reasons">\${reasons}</div>
        <div class="actions">
          <a class="profile" data-action="profile" data-slug="\${esc(item.slug)}" href="\${esc(profile)}" target="_blank" rel="noopener">See ToolScout analysis</a>
          <a class="vendor" data-action="vendor" data-slug="\${esc(item.slug)}" href="\${esc(vendor.toString())}" target="_blank" rel="nofollow sponsored noopener">Visit vendor</a>
        </div>
      </article>\`;
    }).join('');
    results.querySelectorAll('a[data-action]').forEach(link=>{
      link.addEventListener('click',()=>event(link.dataset.action==='vendor'?'vendor_click':'profile_click',{result_slug:clean(link.dataset.slug,80)}));
    });
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const q=input.value.trim();
    if(q.length<2){
      renderError('Describe the software job in a little more detail.');
      input.focus();
      return;
    }
    button.disabled=true;
    status.classList.add('show');
    results.innerHTML='';
    event('search',{query_length:q.length});
    try{
      const url=new URL(API);
      url.searchParams.set('q',q);
      url.searchParams.set('limit',String(limit));
      const response=await fetch(url.toString(),{headers:{Accept:'application/json'},mode:'cors'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        if(response.status===422||data.error==='recommendation_unresolved'){
          renderError(data.message||'ToolScout could not identify a reliable software need. Add the job, team, budget or a must-have feature.');
          event('unresolved',{query_length:q.length});
          return;
        }
        throw new Error(data.error||'recommendation_unavailable');
      }
      renderResults(data);
      event('results',{intent_slug:clean(data.intent?.slug||data.observed_intent||'',90),result_count:Number(data.count||0)});
    }catch{
      renderError('The Finder is temporarily unavailable. You can still open ToolScout to search directly.');
      event('error');
    }finally{
      button.disabled=false;
      status.classList.remove('show');
    }
  });

  current.insertAdjacentElement('afterend',root);
  event('impression');
})();