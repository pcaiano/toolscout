(()=>{
  const current=document.currentScript;if(!current)return;
  const a=(current.dataset.a||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
  const b=(current.dataset.b||'').toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!a||!b)return;
  const host=location.hostname||'embed';
  const title=current.dataset.title||`${pretty(a)} vs ${pretty(b)}`;
  const qs=new URLSearchParams({utm_source:host,utm_medium:'distribution',utm_campaign:'embed_compare',utm_content:`${a}-vs-${b}`});
  const href=`https://trytoolscout.org/${encodeURIComponent(a)}-vs-${encodeURIComponent(b)}.html?${qs}`;
  const root=document.createElement('div');
  root.setAttribute('data-toolscout-embed','compare');
  root.style.cssText='font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:620px;border:1px solid #252b33;border-radius:18px;padding:18px;background:#0b0d10;color:#f5f7fa;box-sizing:border-box';
  root.innerHTML=`<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98a2b3;font-weight:800">ToolScout Compare</div><div style="font-size:24px;letter-spacing:-.03em;font-weight:850;margin:7px 0 8px">${esc(title)}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div style="border:1px solid #252b33;border-radius:12px;padding:12px;background:#14181d;font-weight:800">${esc(pretty(a))}</div><div style="border:1px solid #252b33;border-radius:12px;padding:12px;background:#14181d;font-weight:800">${esc(pretty(b))}</div></div><a href="${href}" target="_blank" rel="noopener" style="display:inline-block;margin-top:13px;color:#f5f7fa;text-decoration:none;font-size:12px;font-weight:800;border-bottom:1px solid #697586">Open independent comparison ↗</a><div style="margin-top:12px;font-size:10px;color:#667085">Powered by ToolScout · no pay-to-rank recommendations</div>`;
  current.insertAdjacentElement('afterend',root);
  function pretty(v){return String(v).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
})();
