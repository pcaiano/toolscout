(()=>{
  function message(form,text,state){
    const node=form.querySelector('[data-newsletter-status]');
    if(!node)return;
    node.textContent=text;
    node.dataset.state=state||'';
  }
  async function submit(form){
    const email=form.querySelector('input[type="email"]')?.value?.trim()||'';
    const company=form.querySelector('input[name="company"]')?.value||'';
    const button=form.querySelector('button[type="submit"]');
    if(!email){message(form,'Enter a valid email address.','error');return}
    if(button){button.disabled=true;button.dataset.label=button.textContent;button.textContent='Subscribing…'}
    message(form,'','');
    try{
      const response=await fetch('/api/newsletter/subscribe',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({
          email,
          company,
          consent:true,
          source:form.dataset.newsletterSource||'unknown',
          source_path:location.pathname
        })
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||'subscribe_failed');
      form.classList.add('is-success');
      const input=form.querySelector('input[type="email"]');
      if(input)input.value='';
      message(form,data.already_subscribed?'You are already on the list.':'You’re on the list.','success');
      if(typeof window.gtag==='function')window.gtag('event','newsletter_signup',{source:form.dataset.newsletterSource||'unknown'});
    }catch(error){
      message(form,'Could not subscribe right now. Please try again.','error');
    }finally{
      if(button){button.disabled=false;button.textContent=button.dataset.label||'Subscribe →'}
    }
  }
  document.addEventListener('submit',event=>{
    const form=event.target.closest?.('[data-newsletter-signup]');
    if(!form)return;
    event.preventDefault();
    submit(form);
  });
})();