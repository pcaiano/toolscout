const STYLE=`<style data-toolscout-newsletter-style="1">
.ts-newsletter{margin:34px 0 38px;padding:28px 0;border-top:1px solid #0B0D0C;border-bottom:1px solid #DDE2DC}
.ts-newsletter-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:38px;align-items:end}
.ts-newsletter .eyebrow{margin-bottom:10px}
.ts-newsletter h2{margin:0;font-size:clamp(30px,4.2vw,44px);line-height:1.02;letter-spacing:-.05em}
.ts-newsletter p{margin:12px 0 0;color:#626962;line-height:1.55;max-width:620px}
.ts-newsletter-form{display:grid;grid-template-columns:1fr auto;gap:8px}
.ts-newsletter-form input[type="email"]{width:100%;min-width:0;min-height:50px;border:1px solid #DDE2DC;border-radius:8px;background:#fff;padding:0 14px;font:inherit;color:#0B0D0C}
.ts-newsletter-form input[type="email"]:focus{outline:2px solid rgba(183,255,60,.55);outline-offset:1px}
.ts-newsletter-form button{min-height:50px;border:0;border-radius:8px;background:#0B0D0C;color:#fff;padding:0 16px;font:inherit;font-weight:800;cursor:pointer}
.ts-newsletter-form button:disabled{opacity:.55;cursor:wait}
.ts-newsletter-meta{grid-column:1/-1;margin:2px 0 0!important;font-size:11px!important;color:#777E77!important}
.ts-newsletter-status{grid-column:1/-1;min-height:18px;font-size:12px;font-weight:750}
.ts-newsletter-status[data-state="success"]{color:#355D00}.ts-newsletter-status[data-state="error"]{color:#9B2C2C}
.ts-newsletter-hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
@media(max-width:720px){.ts-newsletter{margin:26px 0 30px;padding:22px 0}.ts-newsletter-grid{grid-template-columns:1fr;gap:20px}.ts-newsletter-form{grid-template-columns:1fr}.ts-newsletter-form button{width:100%}}
</style>`;

function block(source='news-article'){
  return `<section class="ts-newsletter" data-toolscout-newsletter="1" aria-labelledby="ts-newsletter-title">
    <div class="ts-newsletter-grid">
      <div>
        <div class="eyebrow">ToolScout updates</div>
        <h2 id="ts-newsletter-title">Get the software changes worth knowing.</h2>
        <p>Independent product updates, AI integrations and meaningful software changes, selected by ToolScout.</p>
      </div>
      <form class="ts-newsletter-form" data-newsletter-signup data-newsletter-source="${source}" novalidate>
        <label class="ts-newsletter-hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
        <input type="email" name="email" autocomplete="email" inputmode="email" required aria-label="Email address" placeholder="Your email">
        <button type="submit">Subscribe →</button>
        <p class="ts-newsletter-meta">By subscribing, you agree to receive ToolScout software updates. Unsubscribe anytime. <a href="/privacy.html">Privacy policy</a>.</p>
        <div class="ts-newsletter-status" data-newsletter-status aria-live="polite"></div>
      </form>
    </div>
  </section>`;
}

export async function injectNewsletterSignup(response,{source='news-article'}={}){
  if(!response?.ok||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  let html=await response.text();
  if(html.includes('data-toolscout-newsletter="1"'))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  if(!html.includes('data-toolscout-newsletter-style="1"'))html=html.replace(/<\/head>/i,STYLE+'<script src="/newsletter-signup.js" defer></script></head>');
  const section=block(source);
  html=/<\/main>/i.test(html)?html.replace(/<\/main>/i,section+'</main>'):html.replace(/<\/body>/i,section+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
